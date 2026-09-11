/**
 * Library entrypoint. `src/cli.ts` is the executable entrypoint.
 *
 * Behavior is specified by `SPEC.md`; evidence is bounded by
 * `PROJECT_EVIDENCE.md`. This package detects the documented defect classes in
 * the bundled corpus and claims nothing beyond that.
 */

export { CONSTRAINING_KEYWORDS } from "./detectors.js";
export {
  DEFAULT_DIALECT,
  DIALECTS,
  type Dialect,
  definitionsKeyword,
} from "./dialect.js";
export {
  ERROR_CODES,
  type ErrorCode,
  isValidationInputError,
  ValidationInputError,
} from "./errors.js";
export {
  type NormalizedInput,
  type NormalizedTool,
  normalizeDocument,
  readJsonFile,
} from "./ingest.js";
export type { JsonObject, JsonValue } from "./json.js";
export { type CliIo, createProgram, runCli } from "./program.js";
export {
  type ErrorReport,
  FINGERPRINTS,
  type Finding,
  type FindingId,
  type Fingerprint,
  isErrorReport,
  REPORT_VERSION,
  type Report,
  renderHumanReport,
  renderJsonReport,
  reportInputPath,
  type ValidationReport,
} from "./report.js";
export {
  type ExitCode,
  type ValidateOptions,
  type ValidationOutcome,
  validateDocument,
  validateFile,
} from "./validate.js";
export { TOOL_NAME, TOOL_VERSION } from "./version.js";
