import { describe, expect, it } from "vitest";
import { validateDocument } from "../src/index.js";
import { reportForSchema, tool, toolsDocument } from "./helpers.js";

describe("JSON Pointer emission (SPEC 3.1, 6.1)", () => {
  it("escapes ~ and / in emitted pointer tokens", () => {
    const report = reportForSchema({
      type: "object",
      properties: {
        "a/b": { $ref: "#/$defs/Missing" },
        "c~d": { $ref: "#/$defs/Missing" },
      },
    });

    expect(report.findings.map((finding) => finding.pointer)).toEqual([
      "/tools/0/inputSchema/properties/a~1b/$ref",
      "/tools/0/inputSchema/properties/c~0d/$ref",
    ]);
  });

  it("indexes array positions numerically", () => {
    const report = reportForSchema({
      type: "object",
      properties: { a: { type: "string" } },
      allOf: [
        { type: "object" },
        { $ref: "#/$defs/Missing" },
        { $ref: "#/$defs/AlsoMissing" },
      ],
    });

    expect(report.findings.map((finding) => finding.pointer)).toEqual([
      "/tools/0/inputSchema/allOf/1/$ref",
      "/tools/0/inputSchema/allOf/2/$ref",
    ]);
  });

  it("resolves a pointer through an array position", () => {
    const report = reportForSchema({
      type: "object",
      properties: { a: { $ref: "#/allOf/0" } },
      allOf: [{ type: "string" }],
    });

    expect(report.findings).toHaveLength(0);
  });

  it("keeps the tool index in the pointer", () => {
    const report = validateDocument(
      toolsDocument(
        tool("a", { type: "object", properties: { x: { type: "string" } } }),
        tool("b", { type: "object", properties: { x: { type: "string" } } }),
        tool("c", { type: "object" }),
      ),
      "input.json",
    );

    expect(report.findings.map((finding) => finding.pointer)).toEqual([
      "/tools/2/inputSchema",
    ]);
  });
});
