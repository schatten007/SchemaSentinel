/**
 * Validation orchestration.
 *
 * Order of operations follows `SPEC.md` section 3.3: IO, parse, shape,
 * schema type, dialect, then external references. Only after every exit-2
 * condition is ruled out are detectors allowed to produce findings.
 */

import { detectToolFindings } from "./detectors.js";
import {
  compilesUnderDialect,
  DEFAULT_DIALECT,
  type Dialect,
  detectDialect,
} from "./dialect.js";
import { isValidationInputError, ValidationInputError } from "./errors.js";
import {
  type NormalizedTool,
  normalizeDocument,
  readJsonFile,
} from "./ingest.js";
import {
  compareAscii,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "./json.js";
import { classifyRef } from "./pointer.js";
import {
  buildErrorReport,
  buildValidationReport,
  type Finding,
  type Report,
  renderHumanReport,
  renderJsonReport,
  reportInputPath,
  type ValidationReport,
} from "./report.js";
import {
  collectSchemaSites,
  type RefSite,
  type UnsupportedReferenceSite,
} from "./walk.js";

export type ExitCode = 0 | 1 | 2;

export interface ValidationOutcome {
  readonly exitCode: ExitCode;
  readonly report: Report;
  readonly json: string;
  readonly human: string;
}

export interface ValidateOptions {
  readonly cwd?: string;
}

interface ToolAnalysis {
  readonly tool: NormalizedTool;
  readonly dialect: Dialect;
  readonly refSites: readonly RefSite[];
  readonly unsupportedReferenceSites: readonly UnsupportedReferenceSite[];
}

interface ReferenceError {
  readonly code: "SS-E-REF-EXTERNAL" | "SS-E-REF-UNSUPPORTED";
  readonly message: string;
  readonly pointer: string;
  readonly toolIndex: number;
}

function referenceErrors(analysis: ToolAnalysis): readonly ReferenceError[] {
  const errors: ReferenceError[] = analysis.unsupportedReferenceSites.map(
    (site) => ({
      code: "SS-E-REF-UNSUPPORTED",
      message: `${site.keyword} is outside the supported local JSON Pointer reference subset.`,
      pointer: site.pointer,
      toolIndex: analysis.tool.index,
    }),
  );

  for (const site of analysis.refSites) {
    if (typeof site.value !== "string") {
      errors.push({
        code: "SS-E-REF-UNSUPPORTED",
        message:
          "$ref must be a string containing '#' or a '#/...' local JSON Pointer.",
        pointer: site.pointer,
        toolIndex: analysis.tool.index,
      });
      continue;
    }
    const target = classifyRef(site.value);
    if (target.kind !== "non-local") {
      continue;
    }
    if (site.value === "" || site.value.startsWith("#")) {
      errors.push({
        code: "SS-E-REF-UNSUPPORTED",
        message: `$ref '${site.value}' is outside the supported local JSON Pointer reference subset.`,
        pointer: site.pointer,
        toolIndex: analysis.tool.index,
      });
    } else {
      errors.push({
        code: "SS-E-REF-EXTERNAL",
        message: `$ref '${site.value}' targets another document and cannot be resolved offline.`,
        pointer: site.pointer,
        toolIndex: analysis.tool.index,
      });
    }
  }
  return errors;
}

function assertSupportedReferences(analyses: readonly ToolAnalysis[]): void {
  const errors = analyses.flatMap(referenceErrors);
  const code = errors.some((error) => error.code === "SS-E-REF-EXTERNAL")
    ? "SS-E-REF-EXTERNAL"
    : "SS-E-REF-UNSUPPORTED";
  const first = errors
    .filter((error) => error.code === code)
    .sort(
      (a, b) => a.toolIndex - b.toolIndex || compareAscii(a.pointer, b.pointer),
    )[0];
  if (first !== undefined) {
    throw new ValidationInputError(first.code, first.message, first.pointer);
  }
}

function cloneWithNeutralizedRefs(
  value: JsonValue,
  pointer: string,
  neutralized: ReadonlySet<string>,
  seen: Map<JsonObject | readonly JsonValue[], JsonValue>,
): JsonValue {
  if (Array.isArray(value)) {
    const existing = seen.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const clone: JsonValue[] = [];
    seen.set(value, clone);
    for (const [index, child] of value.entries()) {
      clone.push(
        cloneWithNeutralizedRefs(
          child,
          `${pointer}/${index}`,
          neutralized,
          seen,
        ),
      );
    }
    return clone;
  }
  if (isJsonObject(value)) {
    const existing = seen.get(value);
    if (existing !== undefined) {
      return existing;
    }
    const clone: Record<string, JsonValue> = {};
    seen.set(value, clone);
    for (const key of Object.keys(value)) {
      const child = value[key];
      const childPointer = `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
      if (neutralized.has(childPointer)) {
        continue;
      }
      if (child !== undefined) {
        clone[key] = cloneWithNeutralizedRefs(
          child,
          childPointer,
          neutralized,
          seen,
        );
      }
    }
    return clone;
  }
  return value;
}

/**
 * Ajv is a compilability gate, never the finding enumerator (SPEC 1.1). A
 * schema that cannot compile and has no finding to explain it would otherwise
 * be reported as clean, which the correctness boundary in `CONTEXT.md`
 * section 8 forbids.
 */
function assertCompilable(
  analyses: readonly ToolAnalysis[],
  findings: readonly Finding[],
): void {
  for (const analysis of analyses) {
    const danglingRefs = new Set(
      findings
        .filter(
          (finding) =>
            finding.toolIndex === analysis.tool.index &&
            finding.id === "SS-REF-001",
        )
        .map((finding) => finding.pointer),
    );
    const neutralized = cloneWithNeutralizedRefs(
      analysis.tool.inputSchema,
      analysis.tool.schemaPointer,
      danglingRefs,
      new Map(),
    );
    if (
      isJsonObject(neutralized) &&
      compilesUnderDialect(neutralized, analysis.dialect)
    ) {
      continue;
    }
    throw new ValidationInputError(
      "SS-E-SCHEMA-INVALID",
      "inputSchema is not a valid JSON Schema 2020-12 document after reported dangling references are neutralized.",
      analysis.tool.schemaPointer,
    );
  }
}

function documentDialect(analyses: readonly ToolAnalysis[]): Dialect {
  for (const analysis of analyses) {
    if (Object.hasOwn(analysis.tool.inputSchema, "$schema")) {
      return analysis.dialect;
    }
  }
  return DEFAULT_DIALECT;
}

/** Validates an already-parsed document. Throws `ValidationInputError`. */
export function validateDocument(
  document: JsonValue,
  inputPath: string,
): ValidationReport {
  const normalized = normalizeDocument(document);

  const analyses: readonly ToolAnalysis[] = normalized.tools.map((tool) => {
    const dialect = detectDialect(tool.inputSchema, tool.schemaPointer);
    return {
      tool,
      dialect,
      ...collectSchemaSites(tool.inputSchema, tool.schemaPointer),
    };
  });

  assertSupportedReferences(analyses);

  const findings = analyses.flatMap((analysis) =>
    detectToolFindings(analysis.tool, analysis.dialect, analysis.refSites),
  );

  assertCompilable(analyses, findings);

  return buildValidationReport({
    findings,
    dialect: documentDialect(analyses),
    partialPage: normalized.partialPage,
    inputPath,
    toolCount: normalized.tools.length,
  });
}

function toOutcome(report: Report, exitCode: ExitCode): ValidationOutcome {
  return {
    exitCode,
    report,
    json: renderJsonReport(report),
    human: renderHumanReport(report),
  };
}

export async function validateFile(
  filePath: string,
  options: ValidateOptions = {},
): Promise<ValidationOutcome> {
  const inputPath = reportInputPath(filePath, options.cwd ?? process.cwd());

  try {
    const document = await readJsonFile(filePath);
    const report = validateDocument(document, inputPath);
    return toOutcome(report, report.findings.length === 0 ? 0 : 1);
  } catch (error) {
    const failure = isValidationInputError(error)
      ? error
      : new ValidationInputError(
          "SS-E-INTERNAL",
          "An internal error prevented validation from completing.",
        );
    return toOutcome(
      buildErrorReport({
        code: failure.code,
        message: failure.message,
        ...(failure.pointer === "" ? {} : { pointer: failure.pointer }),
        inputPath,
      }),
      2,
    );
  }
}
