/**
 * File ingestion and input normalization (`SPEC.md` section 3).
 *
 * Every accepted envelope shape collapses to `{ "tools": [...] }` so that a
 * reported JSON Pointer never varies with the envelope (SPEC 3.1).
 */

import { readFile } from "node:fs/promises";
import { ValidationInputError } from "./errors.js";
import { isJsonObject, type JsonObject, type JsonValue } from "./json.js";

export interface NormalizedTool {
  readonly index: number;
  readonly name: string;
  readonly inputSchema: JsonObject;
  /** Pointer to the tool entry, e.g. `/tools/0`. */
  readonly pointer: string;
  /** Pointer to the tool's schema root, e.g. `/tools/0/inputSchema`. */
  readonly schemaPointer: string;
}

export interface NormalizedInput {
  readonly tools: readonly NormalizedTool[];
  readonly partialPage: boolean;
}

export async function readJsonFile(filePath: string): Promise<JsonValue> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new ValidationInputError(
      "SS-E-IO",
      "Input file is missing or unreadable.",
    );
  }

  // A byte-order mark is an encoding artifact, not a schema defect.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  try {
    return JSON.parse(withoutBom) as JsonValue;
  } catch {
    // Never surface the parser's own message: it varies across Node versions.
    throw new ValidationInputError("SS-E-PARSE", "Input is not valid JSON.");
  }
}

function shapeError(message: string, pointer = ""): ValidationInputError {
  return new ValidationInputError("SS-E-SHAPE", message, pointer);
}

interface ToolsContainer {
  readonly tools: readonly JsonValue[];
  readonly partialPage: boolean;
}

function locateTools(document: JsonValue): ToolsContainer {
  if (Array.isArray(document)) {
    return { tools: document, partialPage: false };
  }

  if (!isJsonObject(document)) {
    throw shapeError(
      "Input is not a tools/list response: expected a JSON-RPC envelope, a result object, or a tool array.",
    );
  }

  const result = document.result;
  const container = isJsonObject(result) ? result : document;

  if (!Object.hasOwn(container, "tools")) {
    if (Object.hasOwn(document, "error")) {
      throw shapeError(
        "Input is a JSON-RPC error envelope, so it carries no tools/list result.",
      );
    }
    throw shapeError(
      "Input is not a tools/list response: expected a JSON-RPC envelope, a result object, or a tool array.",
    );
  }

  const tools = container.tools;
  if (!Array.isArray(tools)) {
    throw shapeError("'tools' is present but is not an array.", "/tools");
  }

  const partialPage =
    Object.hasOwn(container, "nextCursor") && container.nextCursor !== null;

  return { tools, partialPage };
}

export function normalizeDocument(document: JsonValue): NormalizedInput {
  const located = locateTools(document);
  const shapedTools: {
    readonly index: number;
    readonly inputSchema: JsonValue | undefined;
    readonly name: string;
    readonly pointer: string;
  }[] = [];

  for (const [index, entry] of located.tools.entries()) {
    const pointer = `/tools/${index}`;

    if (!isJsonObject(entry)) {
      throw shapeError("Tool entry is not a JSON object.", pointer);
    }

    const name = entry.name;
    if (typeof name !== "string") {
      throw shapeError("Tool is missing a string 'name'.", pointer);
    }

    if (!Object.hasOwn(entry, "inputSchema")) {
      throw shapeError("Tool is missing 'inputSchema'.", pointer);
    }

    shapedTools.push({ index, inputSchema: entry.inputSchema, name, pointer });
  }

  const tools: NormalizedTool[] = [];
  for (const { index, inputSchema, name, pointer } of shapedTools) {
    const schemaPointer = `${pointer}/inputSchema`;
    if (!isJsonObject(inputSchema)) {
      throw new ValidationInputError(
        "SS-E-SCHEMA-TYPE",
        "'inputSchema' is present but is not a JSON object.",
        schemaPointer,
      );
    }

    tools.push({
      index,
      name,
      inputSchema,
      pointer,
      schemaPointer,
    });
  }

  return { tools, partialPage: located.partialPage };
}
