/**
 * Dialect handling under the narrowed contract (`SPEC.md` sections 1, 1.2, 3.4).
 *
 * 2020-12 is the only supported dialect. Every other declared dialect exits 2
 * with SS-E-DIALECT rather than being reinterpreted, because the pinned Ajv
 * entry point cannot validate it and a reinterpreted verdict would not be
 * defensible (`CONTEXT.md` section 8).
 */

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../src/index.js";
import {
  DEFAULT_DIALECT,
  definitionsKeyword,
  validateDocument,
} from "../src/index.js";
import {
  codeForSchema,
  codeOf,
  pointerForSchema,
  pointerOf,
  reportForSchema,
  tool,
  toolsDocument,
} from "./helpers.js";

const DIALECT_2020 = "https://json-schema.org/draft/2020-12/schema";
const TYPED: JsonValue = { type: "object", properties: {} };

function withSchemaKeyword(value: JsonValue): JsonValue {
  return { $schema: value, type: "object", properties: {} };
}

function dialectOf(schema: JsonValue): string {
  return reportForSchema(schema).input.dialect;
}

describe("2020-12 is the only supported dialect (SPEC 1, 3.4)", () => {
  it("defaults a schema with no $schema to 2020-12", () => {
    expect(DEFAULT_DIALECT).toBe("2020-12");
    expect(dialectOf(TYPED)).toBe("2020-12");
  });

  it("accepts an explicitly declared 2020-12 dialect", () => {
    expect(dialectOf(withSchemaKeyword(DIALECT_2020))).toBe("2020-12");
  });

  it("accepts the http spelling and the trailing-# spelling of 2020-12", () => {
    const spellings: readonly string[] = [
      "https://json-schema.org/draft/2020-12/schema",
      "https://json-schema.org/draft/2020-12/schema#",
      "http://json-schema.org/draft/2020-12/schema",
      "http://json-schema.org/draft/2020-12/schema#",
    ];

    for (const spelling of spellings) {
      expect(dialectOf(withSchemaKeyword(spelling)), spelling).toBe("2020-12");
    }
  });

  it("reports input.dialect as the constant 2020-12", () => {
    const report = validateDocument(
      toolsDocument(
        tool("declared", withSchemaKeyword(DIALECT_2020)),
        tool("defaulted", TYPED),
      ),
      "input.json",
    );

    expect(report.input.dialect).toBe("2020-12");
  });
});

describe("every other dialect exits 2 with SS-E-DIALECT (SPEC 1.2, 3.4)", () => {
  it("rejects draft-07, which the previous contract accepted", () => {
    expect(
      codeForSchema(
        withSchemaKeyword("http://json-schema.org/draft-07/schema#"),
      ),
    ).toBe("SS-E-DIALECT");
  });

  it("rejects 2019-09, which the previous contract accepted", () => {
    expect(
      codeForSchema(
        withSchemaKeyword("https://json-schema.org/draft/2019-09/schema"),
      ),
    ).toBe("SS-E-DIALECT");
  });

  it("rejects any other dialect URI", () => {
    const foreign: readonly string[] = [
      "http://json-schema.org/draft-04/schema#",
      "http://json-schema.org/draft-06/schema#",
      "https://json-schema.org/draft/2021-99/schema",
      "urn:custom",
      "",
    ];

    for (const value of foreign) {
      expect(codeForSchema(withSchemaKeyword(value)), value).toBe(
        "SS-E-DIALECT",
      );
    }
  });

  it("rejects a non-string $schema", () => {
    for (const value of [2020, true, null, [], {}] as readonly JsonValue[]) {
      expect(codeForSchema(withSchemaKeyword(value))).toBe("SS-E-DIALECT");
    }
  });

  it("points SS-E-DIALECT at the declaring keyword", () => {
    expect(
      pointerForSchema(
        withSchemaKeyword("http://json-schema.org/draft-07/schema#"),
      ),
    ).toBe("/tools/0/inputSchema/$schema");
  });

  it("names the offending tool when an earlier tool is clean", () => {
    const run = () =>
      validateDocument(
        toolsDocument(
          tool("ok", TYPED),
          tool("bad", withSchemaKeyword("urn:custom")),
        ),
        "input.json",
      );

    expect(codeOf(run)).toBe("SS-E-DIALECT");
    expect(pointerOf(run)).toBe("/tools/1/inputSchema/$schema");
  });

  it("refuses a draft-07 schema even when it is otherwise well formed", () => {
    expect(
      codeForSchema({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        definitions: { Location: { type: "string" } },
        properties: { location: { $ref: "#/definitions/Location" } },
        required: ["location"],
      }),
    ).toBe("SS-E-DIALECT");
  });
});

describe("the definitions container collapses to $defs (SPEC 4.2.1)", () => {
  it("maps the single supported dialect to $defs", () => {
    expect(definitionsKeyword("2020-12")).toBe("$defs");
  });
});
