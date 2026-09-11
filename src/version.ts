/**
 * Single source of truth for the tool identity emitted in every report.
 * Kept in source rather than read from `package.json` so that reports never
 * depend on filesystem layout at runtime. `tests/version.test.ts` asserts that
 * this stays in sync with `package.json`.
 */

export const TOOL_NAME = "schema-sentinel";
export const TOOL_VERSION = "0.1.0";
