/**
 * Minimal JSON value model plus the canonical serializer required by
 * `SPEC.md` section 6.3 (deterministic reports).
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}

/** ASCII / UTF-16 code-unit ordering. Never locale-dependent (SPEC 6.3.4). */
export function compareAscii(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (isJsonObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareAscii)) {
      const child = value[key];
      if (child !== undefined) {
        sorted[key] = sortKeysDeep(child);
      }
    }
    return sorted;
  }
  return value;
}

/**
 * Serializes a report: keys sorted ASCII-ascending at every depth, 2-space
 * indent, LF endings, exactly one trailing newline (SPEC 6.3.2).
 */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}
