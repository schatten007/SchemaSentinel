/**
 * Detector rules (`SPEC.md` section 4).
 *
 * Only two evidence-backed fingerprint families exist. Valid JSON Schema is
 * never treated as evidence of corruption (SPEC 4.2.1), and one observable
 * defect maps to exactly one evidence family (SPEC 4.4).
 */

import { type Dialect, definitionsKeyword } from "./dialect.js";
import type { NormalizedTool } from "./ingest.js";
import { isJsonObject, type JsonObject } from "./json.js";
import { appendPointer, classifyRef, resolveLocalPointer } from "./pointer.js";
import type { Finding } from "./report.js";
import type { RefSite } from "./walk.js";

/**
 * SPEC 4.2: any one of these means the root schema asserts something about its
 * input, so `SS-TYPE-001` does not fire. `$defs`/`definitions` are present for
 * attribution reasons when it is non-empty: a root holding surviving definitions
 * is the signature of reference loss (#25964), not root collapse (#33864).
 */
export const CONSTRAINING_KEYWORDS = [
  "$defs",
  "$ref",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "contains",
  "dependentRequired",
  "dependentSchemas",
  "enum",
  "if",
  "items",
  "maxProperties",
  "minProperties",
  "not",
  "oneOf",
  "patternProperties",
  "prefixItems",
  "properties",
  "propertyNames",
  "required",
  "unevaluatedProperties",
] as const;

function refRemediation(dialect: Dialect): string {
  return `Restore the ${definitionsKeyword(dialect)} block or inline the referenced subschema.`;
}

function isSchemaNode(value: unknown): boolean {
  return isJsonObject(value) || typeof value === "boolean";
}

function detectDanglingRefs(
  tool: NormalizedTool,
  dialect: Dialect,
  refSites: readonly RefSite[],
): readonly Finding[] {
  const findings: Finding[] = [];

  for (const site of refSites) {
    if (typeof site.value !== "string") {
      // Not a usable reference; the Ajv compilability gate rejects the schema
      // rather than this rule claiming a documented n8n defect.
      continue;
    }

    const target = classifyRef(site.value);
    if (target.kind === "root") {
      continue;
    }
    if (target.kind === "non-local") {
      // Already rejected as SS-E-REF-EXTERNAL before detectors run.
      continue;
    }

    const resolved = resolveLocalPointer(tool.inputSchema, target.raw);
    if (resolved === undefined) {
      findings.push({
        evidence: "n8n#25964",
        id: "SS-REF-001",
        message: `$ref '${site.value}' does not resolve within the document.`,
        pointer: site.pointer,
        remediation: refRemediation(dialect),
        rule: "ref.dangling",
        severity: "error",
        toolIndex: tool.index,
        toolName: tool.name,
      });
      continue;
    }

    if (!isSchemaNode(resolved)) {
      findings.push({
        evidence: "n8n#25964",
        id: "SS-REF-001",
        message: `$ref '${site.value}' resolves to a node that is not a schema.`,
        pointer: site.pointer,
        remediation: refRemediation(dialect),
        rule: "ref.dangling",
        severity: "error",
        toolIndex: tool.index,
        toolName: tool.name,
      });
    }
  }

  return findings;
}

function detectOrphanDefinitions(
  tool: NormalizedTool,
  dialect: Dialect,
  refSites: readonly RefSite[],
): readonly Finding[] {
  if (refSites.length > 0) {
    return [];
  }

  const container = definitionsKeyword(dialect);
  const value = tool.inputSchema[container];
  if (!isJsonObject(value) || Object.keys(value).length === 0) {
    return [];
  }

  return [
    {
      evidence: "n8n#25964",
      id: "SS-REF-002",
      message: `${container} is populated but no $ref occurs anywhere in this tool's inputSchema.`,
      pointer: appendPointer(tool.schemaPointer, container),
      remediation: `Restore the $ref sites that referenced ${container}, or remove the unused container.`,
      rule: "ref.orphan-definitions",
      severity: "error",
      toolIndex: tool.index,
      toolName: tool.name,
    },
  ];
}

function hasConstrainingKeyword(schema: JsonObject): boolean {
  return CONSTRAINING_KEYWORDS.some((keyword) => {
    if (!Object.hasOwn(schema, keyword)) {
      return false;
    }
    if (keyword !== "$defs") {
      return true;
    }
    const definitions = schema.$defs;
    return isJsonObject(definitions) && Object.keys(definitions).length > 0;
  });
}

function detectCollapsedRoot(tool: NormalizedTool): readonly Finding[] {
  const schema = tool.inputSchema;
  const declaredType = Object.hasOwn(schema, "type") ? schema.type : undefined;
  const qualifies = declaredType === undefined || declaredType === "object";

  if (!qualifies || hasConstrainingKeyword(schema)) {
    return [];
  }

  return [
    {
      evidence: "n8n#33864",
      id: "SS-TYPE-001",
      message:
        "inputSchema carries no constraining keyword, so the declared parameter set is missing.",
      pointer: tool.schemaPointer,
      remediation:
        'Restore the declared parameter set, or declare the empty parameter set explicitly with "properties": {} or "additionalProperties": false.',
      rule: "type.root-collapsed",
      severity: "error",
      toolIndex: tool.index,
      toolName: tool.name,
    },
  ];
}

export function detectToolFindings(
  tool: NormalizedTool,
  dialect: Dialect,
  refSites: readonly RefSite[],
): readonly Finding[] {
  return [
    ...detectDanglingRefs(tool, dialect, refSites),
    ...detectOrphanDefinitions(tool, dialect, refSites),
    ...detectCollapsedRoot(tool),
  ];
}
