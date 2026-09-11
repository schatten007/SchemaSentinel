/**
 * RFC 6901 JSON Pointer helpers.
 *
 * `SPEC.md` section 3.4 restricts resolution to local pointers (`#`,
 * `#/$defs/...`, `#/definitions/...`) with `~0`/`~1` unescaping. Anything else
 * is reported as `SS-E-REF-EXTERNAL` rather than guessed at.
 */

import { isJsonObject, type JsonValue } from "./json.js";

export function escapePointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function appendPointer(base: string, token: string): string {
  return `${base}/${escapePointerToken(token)}`;
}

export function appendIndexPointer(base: string, index: number): string {
  return `${base}/${index}`;
}

function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function percentDecode(token: string): string | null {
  try {
    const decoded = decodeURIComponent(token);
    return decoded === token ? null : decoded;
  } catch {
    return null;
  }
}

export type RefTarget =
  | { readonly kind: "root" }
  | { readonly kind: "pointer"; readonly raw: string }
  | { readonly kind: "non-local" };

/**
 * Classifies a `$ref` string. Only `#` and `#/...` are resolvable offline;
 * plain-name fragments (`#Anchor`), absolute URIs and `file:` targets are
 * non-local because this tool never fetches anything.
 */
export function classifyRef(ref: string): RefTarget {
  if (ref === "#") {
    return { kind: "root" };
  }
  if (ref.startsWith("#/")) {
    return { kind: "pointer", raw: ref.slice(1) };
  }
  return { kind: "non-local" };
}

function splitPointer(pointer: string): readonly string[] {
  if (pointer === "") {
    return [];
  }
  return pointer.slice(1).split("/");
}

function isArrayIndex(token: string): boolean {
  if (token === "0") {
    return true;
  }
  return /^[1-9][0-9]*$/.test(token);
}

function step(node: JsonValue, token: string): JsonValue | undefined {
  if (isJsonObject(node)) {
    return Object.hasOwn(node, token) ? node[token] : undefined;
  }
  if (Array.isArray(node)) {
    if (!isArrayIndex(token)) {
      return undefined;
    }
    const index = Number(token);
    return index < node.length ? node[index] : undefined;
  }
  return undefined;
}

function resolveTokens(
  root: JsonValue,
  tokens: readonly string[],
  decode: boolean,
): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const token of tokens) {
    if (current === undefined) {
      return undefined;
    }
    const candidate = decode ? (percentDecode(token) ?? token) : token;
    current = step(current, unescapePointerToken(candidate));
  }
  return current;
}

/**
 * Resolves a local pointer against `root`. Returns `undefined` when the target
 * node is absent. Percent-decoding is attempted as a fallback so that
 * `#/$defs/My%20Type` resolves without misreporting a dangling reference.
 */
export function resolveLocalPointer(
  root: JsonValue,
  pointer: string,
): JsonValue | undefined {
  const tokens = splitPointer(pointer);
  const literal = resolveTokens(root, tokens, false);
  if (literal !== undefined) {
    return literal;
  }
  return resolveTokens(root, tokens, true);
}
