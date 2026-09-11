/**
 * Exit-2 conditions from `SPEC.md` section 3.3.
 *
 * These are errors, never findings: they mean no trustworthy verdict was
 * produced, so they must not be counted as detections (SPEC 3.3, 8).
 */

export const ERROR_CODES = [
  "SS-E-IO",
  "SS-E-PARSE",
  "SS-E-SHAPE",
  "SS-E-SCHEMA-TYPE",
  "SS-E-DIALECT",
  "SS-E-REF-EXTERNAL",
  "SS-E-REF-UNSUPPORTED",
  "SS-E-SCHEMA-INVALID",
  "SS-E-INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * `SS-E-INTERNAL` is reserved for unexpected implementation failures. Invalid
 * user schemas and unsupported reference constructs have dedicated codes.
 */
export class ValidationInputError extends Error {
  readonly code: ErrorCode;
  readonly pointer: string;

  constructor(code: ErrorCode, message: string, pointer = "") {
    super(message);
    this.name = "ValidationInputError";
    this.code = code;
    this.pointer = pointer;
  }
}

export function isValidationInputError(
  value: unknown,
): value is ValidationInputError {
  return value instanceof ValidationInputError;
}
