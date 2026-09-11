/**
 * Dialect handling and the Ajv compilability gate.
 *
 * `SPEC.md` section 1.1 pins the 2020-12 entry point and records two
 * load-bearing Ajv behaviors, both re-verified against ajv@8.20.0 on
 * 2026-09-10:
 *
 *  1. `new Ajv2020().compile()` throws on a schema declaring the draft-07
 *     `$schema`, so every other declared dialect is rejected before compiling.
 *  2. `compile()` aborts at the *first* unresolved `$ref`.
 *
 * Consequence: Ajv is a compilability gate only. Findings are enumerated by
 * this package's own traversal so that one defect never hides the rest.
 */

import Ajv2020Import from "ajv/dist/2020.js";
import { ValidationInputError } from "./errors.js";
import type { JsonObject } from "./json.js";

export const DIALECTS = ["2020-12"] as const;

export type Dialect = (typeof DIALECTS)[number];

/** MCP defaults to JSON Schema 2020-12 when no dialect is declared (SPEC 1). */
export const DEFAULT_DIALECT: Dialect = "2020-12";

const CANONICAL_META_SCHEMA = "https://json-schema.org/draft/2020-12/schema";

const DIALECT_BY_URI: ReadonlyMap<string, Dialect> = new Map<string, Dialect>([
  ["https://json-schema.org/draft/2020-12/schema", "2020-12"],
  ["http://json-schema.org/draft/2020-12/schema", "2020-12"],
]);

/**
 * The definitions container inspected by `SS-REF-002` (SPEC 3.4). It selects
 * the orphan-detection container only; pointer resolution stays dialect
 * agnostic, so `#/$defs/...` resolves in draft-07 and vice versa.
 */
export function definitionsKeyword(_dialect: Dialect): "$defs" {
  return "$defs";
}

export function detectDialect(
  inputSchema: JsonObject,
  schemaPointer: string,
): Dialect {
  if (!Object.hasOwn(inputSchema, "$schema")) {
    return DEFAULT_DIALECT;
  }

  const declared = inputSchema.$schema;
  const pointer = `${schemaPointer}/$schema`;

  if (typeof declared !== "string") {
    throw new ValidationInputError(
      "SS-E-DIALECT",
      "$schema is present but is not a string, so the dialect cannot be determined.",
      pointer,
    );
  }

  const normalized = declared.trim().replace(/#$/, "");
  const dialect = DIALECT_BY_URI.get(normalized);
  if (dialect === undefined) {
    throw new ValidationInputError(
      "SS-E-DIALECT",
      `$schema '${declared}' declares a dialect other than the supported 2020-12 dialect.`,
      pointer,
    );
  }
  return dialect;
}

interface AjvInstance {
  compile(schema: object): unknown;
}

interface AjvOptions {
  readonly strict?: boolean | "log";
  readonly allowUnionTypes?: boolean;
}

type AjvConstructor = new (options?: AjvOptions) => AjvInstance;

/**
 * ajv ships as CJS with no `exports` map. Under ESM the constructor can arrive
 * either directly or as `mod.default`, so normalize before use (SPEC 1.1).
 */
function normalizeAjvConstructor(imported: unknown): AjvConstructor {
  const candidate = (imported as { default?: unknown } | null | undefined)
    ?.default;
  if (typeof candidate === "function") {
    return candidate as AjvConstructor;
  }
  if (typeof imported === "function") {
    return imported as AjvConstructor;
  }
  throw new ValidationInputError(
    "SS-E-INTERNAL",
    "The JSON Schema validator could not be loaded.",
  );
}

/**
 * Compilability gate. Returns `true` when Ajv can compile the schema under its
 * declared dialect. Ajv's message is deliberately discarded: report text must
 * not depend on Ajv wording (SPEC 6.3.6).
 *
 * The input document is never mutated; only a shallow copy carrying the
 * canonical meta-schema URI is handed to Ajv (SPEC 3.4).
 */
export function compilesUnderDialect(
  inputSchema: JsonObject,
  _dialect: Dialect,
): boolean {
  const AjvConstructor = normalizeAjvConstructor(Ajv2020Import);
  const gateSchema: Record<string, unknown> = {
    ...inputSchema,
    $schema: CANONICAL_META_SCHEMA,
  };

  try {
    new AjvConstructor({ strict: false, allowUnionTypes: true }).compile(
      gateSchema,
    );
    return true;
  } catch {
    return false;
  }
}
