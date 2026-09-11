/**
 * Report contract (`SPEC.md` section 6).
 *
 * Determinism is contractual: sorted findings, ASCII-sorted keys at every
 * depth, CWD-relative POSIX paths, no timestamps, and messages built from
 * static templates plus values taken from the input.
 */

import path from "node:path";
import type { Dialect } from "./dialect.js";
import type { ErrorCode } from "./errors.js";
import { canonicalJson, compareAscii } from "./json.js";
import { TOOL_NAME, TOOL_VERSION } from "./version.js";

export const REPORT_VERSION = 1 as const;

export const FINGERPRINTS = ["n8n#25964", "n8n#33864"] as const;

export type Fingerprint = (typeof FINGERPRINTS)[number];

export type FindingId = "SS-REF-001" | "SS-REF-002" | "SS-TYPE-001";

export type Severity = "error";

export interface Finding {
  readonly evidence: Fingerprint;
  readonly id: FindingId;
  readonly message: string;
  readonly pointer: string;
  readonly remediation: string;
  readonly rule: string;
  readonly severity: Severity;
  readonly toolIndex: number;
  readonly toolName: string;
}

export interface ValidationReport {
  readonly findings: readonly Finding[];
  readonly input: {
    readonly dialect: Dialect;
    readonly partialPage: boolean;
    readonly path: string;
    readonly toolCount: number;
  };
  readonly reportVersion: typeof REPORT_VERSION;
  readonly summary: {
    readonly byFingerprint: Readonly<Record<Fingerprint, number>>;
    readonly findingCount: number;
  };
  readonly tool: { readonly name: string; readonly version: string };
}

export interface ErrorReport {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly pointer?: string;
  };
  readonly input: { readonly path: string };
  readonly reportVersion: typeof REPORT_VERSION;
  readonly tool: { readonly name: string; readonly version: string };
}

export type Report = ValidationReport | ErrorReport;

export function isErrorReport(report: Report): report is ErrorReport {
  return "error" in report;
}

/**
 * SPEC 6.3.3: POSIX-separated and relative to the CWD; a path outside the CWD
 * degrades to its basename. An absolute machine path is never emitted.
 */
export function reportInputPath(filePath: string, cwd = process.cwd()): string {
  const absolute = path.resolve(cwd, filePath);
  const relative = path.relative(cwd, absolute);
  if (
    relative === "" ||
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    return path.basename(absolute);
  }
  return relative.split(path.sep).join("/");
}

/**
 * SPEC 6.3.1: sort by `(input.path, pointer, id)` as ASCII strings. A single
 * report covers a single input, so `input.path` is carried explicitly to keep
 * the ordering key identical to the contract rather than merely equivalent.
 */
export function sortFindings(
  inputPath: string,
  findings: readonly Finding[],
): readonly Finding[] {
  const keyed = findings.map((finding) => ({
    finding,
    key: [inputPath, finding.pointer, finding.id] as const,
  }));

  keyed.sort((a, b) => {
    for (let index = 0; index < a.key.length; index += 1) {
      const order = compareAscii(a.key[index] ?? "", b.key[index] ?? "");
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  });

  return keyed.map((entry) => entry.finding);
}

export function buildValidationReport(options: {
  readonly findings: readonly Finding[];
  readonly dialect: Dialect;
  readonly partialPage: boolean;
  readonly inputPath: string;
  readonly toolCount: number;
}): ValidationReport {
  const findings = sortFindings(options.inputPath, options.findings);
  const byFingerprint: Record<Fingerprint, number> = {
    "n8n#25964": 0,
    "n8n#33864": 0,
  };
  for (const finding of findings) {
    byFingerprint[finding.evidence] += 1;
  }

  return {
    findings,
    input: {
      dialect: options.dialect,
      partialPage: options.partialPage,
      path: options.inputPath,
      toolCount: options.toolCount,
    },
    reportVersion: REPORT_VERSION,
    summary: { byFingerprint, findingCount: findings.length },
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
  };
}

export function buildErrorReport(options: {
  readonly code: ErrorCode;
  readonly message: string;
  readonly pointer?: string;
  readonly inputPath: string;
}): ErrorReport {
  return {
    error: {
      code: options.code,
      message: options.message,
      ...(options.pointer === undefined ? {} : { pointer: options.pointer }),
    },
    input: { path: options.inputPath },
    reportVersion: REPORT_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
  };
}

export function renderJsonReport(report: Report): string {
  return canonicalJson(report);
}

const PARTIAL_PAGE_CAVEAT =
  "caveat: nextCursor is present, so this is one page of a paginated tools/list; a clean page does not describe a clean server";

function renderValidationHuman(report: ValidationReport): string {
  const lines: string[] = [
    `${TOOL_NAME} ${TOOL_VERSION}`,
    `input: ${report.input.path}`,
    `dialect: ${report.input.dialect}`,
    `tools: ${report.input.toolCount}`,
  ];
  if (report.input.partialPage) {
    lines.push(PARTIAL_PAGE_CAVEAT);
  }
  lines.push("");

  for (const finding of report.findings) {
    lines.push(
      `${finding.id}  ${finding.severity}  ${finding.evidence}  tool "${finding.toolName}"`,
      `  pointer: ${finding.pointer}`,
      `  message: ${finding.message}`,
      `  fix:     ${finding.remediation}`,
      "",
    );
  }

  const counts = FINGERPRINTS.map(
    (fingerprint) =>
      `${fingerprint}: ${report.summary.byFingerprint[fingerprint]}`,
  ).join(", ");
  lines.push(`findings: ${report.summary.findingCount} (${counts})`);
  if (report.summary.findingCount === 0) {
    lines.push(
      "no findings for the documented defect classes in the bundled corpus",
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderErrorHuman(report: ErrorReport): string {
  const location =
    report.error.pointer === undefined ? "" : ` at ${report.error.pointer}`;
  const lines = [
    `${TOOL_NAME} ${TOOL_VERSION}`,
    `input: ${report.input.path}`,
    `error: ${report.error.code}${location}`,
    `  ${report.error.message}`,
    "no verdict was produced; this input was not validated",
  ];
  return `${lines.join("\n")}\n`;
}

export function renderHumanReport(report: Report): string {
  return isErrorReport(report)
    ? renderErrorHuman(report)
    : renderValidationHuman(report);
}

/** Short stdout line used when the full report is redirected with `--out`. */
export function renderSummaryLine(report: Report, outPath?: string): string {
  const destination =
    outPath === undefined ? "" : ` (report written to ${outPath})`;
  if (isErrorReport(report)) {
    return `${TOOL_NAME}: ${report.error.code} in ${report.input.path}; no verdict was produced${destination}\n`;
  }
  const noun = report.summary.findingCount === 1 ? "finding" : "findings";
  return `${TOOL_NAME}: ${report.summary.findingCount} ${noun} in ${report.input.path}${destination}\n`;
}
