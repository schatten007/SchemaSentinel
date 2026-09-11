import { describe, expect, it } from "vitest";
import type { JsonValue } from "../src/index.js";
import {
  normalizeDocument,
  ValidationInputError,
  validateDocument,
} from "../src/index.js";
import { codeOf, tool, toolsDocument } from "./helpers.js";

const TYPED_SCHEMA: JsonValue = {
  type: "object",
  properties: { city: { type: "string" } },
};

describe("input contract (SPEC 3.1)", () => {
  it("accepts the JSON-RPC envelope, the bare result, and the bare array", () => {
    const entry = tool("get_weather", TYPED_SCHEMA);
    const envelope: JsonValue = {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [entry] },
    };

    const shapes: readonly JsonValue[] = [
      envelope,
      toolsDocument(entry),
      [entry],
    ];

    for (const shape of shapes) {
      const normalized = normalizeDocument(shape);
      expect(normalized.tools).toHaveLength(1);
      expect(normalized.tools[0]?.pointer).toBe("/tools/0");
      expect(normalized.tools[0]?.schemaPointer).toBe("/tools/0/inputSchema");
    }
  });

  it("roots every pointer at the normalized document regardless of envelope", () => {
    const entry = tool("get_weather", {
      type: "object",
      properties: { location: { $ref: "#/$defs/Location" } },
    });

    const pointers = (
      [
        { jsonrpc: "2.0", id: 7, result: { tools: [entry] } },
        toolsDocument(entry),
        [entry],
      ] as readonly JsonValue[]
    ).map(
      (shape) => validateDocument(shape, "input.json").findings[0]?.pointer,
    );

    expect(new Set(pointers).size).toBe(1);
    expect(pointers[0]).toBe("/tools/0/inputSchema/properties/location/$ref");
  });
});

describe("partial pages (SPEC 3.2)", () => {
  it("marks a page carrying nextCursor and keeps validating it", () => {
    const report = validateDocument(
      { tools: [tool("get_weather", TYPED_SCHEMA)], nextCursor: "page-2" },
      "input.json",
    );

    expect(report.input.partialPage).toBe(true);
    expect(report.input.toolCount).toBe(1);
    expect(report.findings).toHaveLength(0);
  });

  it("reads nextCursor inside a JSON-RPC result envelope", () => {
    const report = validateDocument(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [tool("get_weather", TYPED_SCHEMA)],
          nextCursor: "page-2",
        },
      },
      "input.json",
    );

    expect(report.input.partialPage).toBe(true);
  });

  it("reports a complete page as not partial", () => {
    const report = validateDocument(
      toolsDocument(tool("get_weather", TYPED_SCHEMA)),
      "input.json",
    );

    expect(report.input.partialPage).toBe(false);
  });
});

describe("exit-2 input conditions (SPEC 3.3)", () => {
  it("rejects a document that matches none of the accepted shapes", () => {
    expect(codeOf(() => normalizeDocument({ foo: 1 }))).toBe("SS-E-SHAPE");
    expect(codeOf(() => normalizeDocument("tools"))).toBe("SS-E-SHAPE");
    expect(codeOf(() => normalizeDocument({ tools: {} }))).toBe("SS-E-SHAPE");
  });

  it("rejects a JSON-RPC error envelope", () => {
    expect(
      codeOf(() =>
        normalizeDocument({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
      ),
    ).toBe("SS-E-SHAPE");
  });

  it("rejects a tool missing name or inputSchema", () => {
    expect(
      codeOf(() => normalizeDocument({ tools: [{ inputSchema: {} }] })),
    ).toBe("SS-E-SHAPE");
    expect(codeOf(() => normalizeDocument({ tools: [{ name: "a" }] }))).toBe(
      "SS-E-SHAPE",
    );
    expect(codeOf(() => normalizeDocument({ tools: ["a"] }))).toBe(
      "SS-E-SHAPE",
    );
  });

  it("separates a present-but-non-object inputSchema as SS-E-SCHEMA-TYPE", () => {
    for (const schema of [
      true,
      "object",
      [],
      3,
      null,
    ] as readonly JsonValue[]) {
      expect(
        codeOf(() => normalizeDocument({ tools: [tool("t", schema)] })),
      ).toBe("SS-E-SCHEMA-TYPE");
    }
  });

  it("points SS-E-SCHEMA-TYPE at the offending tool", () => {
    try {
      normalizeDocument({
        tools: [tool("ok", TYPED_SCHEMA), tool("bad", "object")],
      });
      throw new Error("expected a ValidationInputError");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationInputError);
      expect((error as ValidationInputError).pointer).toBe(
        "/tools/1/inputSchema",
      );
    }
  });

  it("reports a later shape error before an earlier schema-type error", () => {
    expect(
      codeOf(() =>
        normalizeDocument({
          tools: [tool("bad_schema", "object"), { inputSchema: TYPED_SCHEMA }],
        }),
      ),
    ).toBe("SS-E-SHAPE");
  });

  it("accepts an empty tool list", () => {
    const report = validateDocument({ tools: [] }, "input.json");
    expect(report.input.toolCount).toBe(0);
    expect(report.findings).toHaveLength(0);
  });
});
