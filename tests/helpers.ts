import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JsonValue, ValidationReport } from "../src/index.js";
import { ValidationInputError, validateDocument } from "../src/index.js";

/** Wraps tool entries in the bare result shape from SPEC 3.1. */
export function toolsDocument(...tools: readonly JsonValue[]): JsonValue {
  return { tools: [...tools] };
}

export function tool(name: string, inputSchema: JsonValue): JsonValue {
  return { name, description: `${name} description`, inputSchema };
}

/** Validates a single-tool document and returns the report. */
export function reportForSchema(inputSchema: JsonValue): ValidationReport {
  return validateDocument(
    toolsDocument(tool("probe", inputSchema)),
    "input.json",
  );
}

export function findingIds(report: ValidationReport): readonly string[] {
  return report.findings.map((finding) => finding.id);
}

/**
 * Runs `work` and returns the SPEC 3.3 error it raised. Fails loudly when the
 * call succeeds, so a silently-tolerated input can never read as a pass.
 */
function inputErrorFrom(work: () => unknown): ValidationInputError {
  try {
    work();
  } catch (error) {
    if (error instanceof ValidationInputError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a ValidationInputError, but the call succeeded");
}

/** The SPEC 3.3 error code `work` raises. */
export function codeOf(work: () => unknown): string {
  return inputErrorFrom(work).code;
}

/** The pointer carried by the SPEC 3.3 error `work` raises. */
export function pointerOf(work: () => unknown): string | undefined {
  return inputErrorFrom(work).pointer;
}

/** The SPEC 3.3 error code raised while validating a single tool schema. */
export function codeForSchema(inputSchema: JsonValue): string {
  return codeOf(() => reportForSchema(inputSchema));
}

/** The pointer carried by the error a single tool schema raises. */
export function pointerForSchema(inputSchema: JsonValue): string | undefined {
  return pointerOf(() => reportForSchema(inputSchema));
}

export async function writeTempJson(text: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "schema-sentinel-"));
  const filePath = path.join(directory, "tools.json");
  await writeFile(filePath, text, "utf8");
  return filePath;
}

export function writeTempDocument(document: JsonValue): Promise<string> {
  return writeTempJson(JSON.stringify(document));
}

/**
 * A path under the OS temp directory that is never created, for the SS-E-IO
 * case that SPEC 7.2 says has no committed fixture.
 */
export function missingTempPath(): string {
  return path.join(tmpdir(), `schema-sentinel-missing-${randomUUID()}.json`);
}
