/**
 * Detector rules under the narrowed contract (`SPEC.md` sections 3.5 - 4.5).
 *
 * Three rules only: SS-REF-001, SS-REF-002 and SS-TYPE-001. Everything the
 * detectors cannot follow is an error, not a guess.
 */

import { describe, expect, it } from "vitest";
import type { JsonValue, ValidationReport } from "../src/index.js";
import { CONSTRAINING_KEYWORDS, validateDocument } from "../src/index.js";
import {
  codeForSchema,
  findingIds,
  pointerForSchema,
  reportForSchema,
  tool,
  toolsDocument,
} from "./helpers.js";

/** The SPEC 4.2 constraining-keyword table, restated as a value under test. */
const CONSTRAINING_SAMPLES: Readonly<Record<string, JsonValue>> = {
  $defs: { T: { type: "string" } },
  additionalProperties: false,
  allOf: [{ type: "object" }],
  anyOf: [{ type: "object" }],
  const: {},
  contains: { type: "string" },
  dependentRequired: { a: ["b"] },
  dependentSchemas: { a: { type: "object" } },
  enum: [{}],
  if: { type: "object" },
  items: { type: "string" },
  maxProperties: 5,
  minProperties: 1,
  not: { type: "string" },
  oneOf: [{ type: "object" }],
  patternProperties: { "^x": { type: "string" } },
  prefixItems: [{ type: "string" }],
  properties: {},
  propertyNames: { type: "string" },
  required: ["a"],
  unevaluatedProperties: false,
};

function only(report: ValidationReport) {
  const finding = report.findings[0];
  if (finding === undefined) {
    throw new Error("expected exactly one finding");
  }
  expect(report.findings).toHaveLength(1);
  return finding;
}

describe("SS-REF-001 dangling local reference (SPEC 4.1)", () => {
  it("fires when the pointer target is absent", () => {
    const finding = only(
      reportForSchema({
        type: "object",
        properties: { location: { $ref: "#/$defs/Location" } },
      }),
    );

    expect(finding.id).toBe("SS-REF-001");
    expect(finding.evidence).toBe("n8n#25964");
    expect(finding.severity).toBe("error");
    expect(finding.rule).toBe("ref.dangling");
    expect(finding.pointer).toBe(
      "/tools/0/inputSchema/properties/location/$ref",
    );
    expect(finding.message).toBe(
      "$ref '#/$defs/Location' does not resolve within the document.",
    );
    expect(finding.remediation).toBe(
      "Restore the $defs block or inline the referenced subschema.",
    );
  });

  it("fires when the pointer target is not a schema", () => {
    const finding = only(
      reportForSchema({
        title: "Weather",
        type: "object",
        properties: { location: { $ref: "#/title" } },
      }),
    );

    expect(finding.id).toBe("SS-REF-001");
    expect(finding.message).toBe(
      "$ref '#/title' resolves to a node that is not a schema.",
    );
  });

  it("finds references nested inside array items (SPEC 4.5)", () => {
    const finding = only(
      reportForSchema({
        type: "object",
        properties: {
          legs: { type: "array", items: { $ref: "#/$defs/Leg" } },
        },
      }),
    );

    expect(finding.pointer).toBe(
      "/tools/0/inputSchema/properties/legs/items/$ref",
    );
  });

  it("finds references behind every traversed keyword (SPEC 4.5)", () => {
    // Written as JSON text so that `then`/`else` stay ordinary schema keywords.
    const composition = JSON.parse(
      `{
        "type": "object",
        "properties": { "a": { "type": "string" } },
        "allOf": [{ "$ref": "#/$defs/A" }],
        "anyOf": [{ "$ref": "#/$defs/B" }],
        "oneOf": [{ "$ref": "#/$defs/C" }],
        "not": { "$ref": "#/$defs/D" },
        "if": { "$ref": "#/$defs/E" },
        "then": { "$ref": "#/$defs/F" },
        "else": { "$ref": "#/$defs/G" },
        "propertyNames": { "$ref": "#/$defs/H" },
        "dependentSchemas": { "a": { "$ref": "#/$defs/I" } },
        "patternProperties": { "^x": { "$ref": "#/$defs/J" } },
        "prefixItems": [{ "$ref": "#/$defs/K" }],
        "contains": { "$ref": "#/$defs/L" },
        "unevaluatedProperties": { "$ref": "#/$defs/M" },
        "additionalProperties": { "$ref": "#/$defs/N" },
        "contentSchema": { "$ref": "#/$defs/O" }
      }`,
    ) as JsonValue;

    const report = reportForSchema(composition);

    expect(findingIds(report)).toEqual(Array<string>(15).fill("SS-REF-001"));
  });

  it("enumerates every unresolved reference rather than stopping at the first", () => {
    const report = reportForSchema({
      type: "object",
      properties: {
        a: { $ref: "#/$defs/A" },
        b: { $ref: "#/$defs/B" },
        c: { $ref: "#/$defs/C" },
      },
    });

    expect(findingIds(report)).toEqual([
      "SS-REF-001",
      "SS-REF-001",
      "SS-REF-001",
    ]);
    expect(report.findings.map((finding) => finding.pointer)).toEqual([
      "/tools/0/inputSchema/properties/a/$ref",
      "/tools/0/inputSchema/properties/b/$ref",
      "/tools/0/inputSchema/properties/c/$ref",
    ]);
  });

  it("finds a dangling reference declared inside $defs", () => {
    const finding = only(
      reportForSchema({
        type: "object",
        properties: { a: { $ref: "#/$defs/A" } },
        $defs: { A: { $ref: "#/$defs/Missing" } },
      }),
    );

    expect(finding.pointer).toBe("/tools/0/inputSchema/$defs/A/$ref");
  });

  it("does not fire on resolvable references", () => {
    const report = reportForSchema({
      type: "object",
      properties: { location: { $ref: "#/$defs/Location" } },
      $defs: { Location: { type: "string" } },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("resolves structurally, so a pointer into legacy definitions works (SPEC 3.6)", () => {
    const report = reportForSchema({
      type: "object",
      properties: { a: { $ref: "#/definitions/A" } },
      definitions: { A: { type: "string" } },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("fires on a pointer into a definitions object whose target is missing", () => {
    const finding = only(
      reportForSchema({
        type: "object",
        properties: { passenger: { $ref: "#/definitions/Passenger" } },
        definitions: { Ticket: { type: "string" } },
      }),
    );

    expect(finding.id).toBe("SS-REF-001");
    expect(finding.message).toBe(
      "$ref '#/definitions/Passenger' does not resolve within the document.",
    );
  });

  it("unescapes ~0 and ~1 in pointer tokens", () => {
    const report = reportForSchema({
      type: "object",
      properties: {
        slash: { $ref: "#/$defs/a~1b" },
        tilde: { $ref: "#/$defs/c~0d" },
      },
      $defs: { "a/b": { type: "string" }, "c~d": { type: "string" } },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("treats a reference cycle as legal (SPEC 3.6)", () => {
    const report = reportForSchema({
      type: "object",
      properties: { node: { $ref: "#/$defs/Node" } },
      $defs: {
        Node: {
          type: "object",
          properties: { next: { $ref: "#/$defs/Node" } },
        },
      },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("treats a root reference as resolvable", () => {
    const report = reportForSchema({
      type: "object",
      properties: { child: { $ref: "#" } },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("attributes findings per tool (SPEC 4.4)", () => {
    const report = validateDocument(
      toolsDocument(
        tool("clean", {
          type: "object",
          properties: { a: { type: "string" } },
        }),
        tool("broken", {
          type: "object",
          properties: { a: { $ref: "#/$defs/A" } },
        }),
      ),
      "input.json",
    );

    const finding = only(report);
    expect(finding.toolName).toBe("broken");
    expect(finding.toolIndex).toBe(1);
    expect(finding.pointer).toBe("/tools/1/inputSchema/properties/a/$ref");
  });
});

describe("contentSchema traversal (SPEC 4.5, 4.2.1)", () => {
  const PAYLOAD: JsonValue = {
    payload: {
      type: "string",
      contentMediaType: "application/json",
      contentSchema: { $ref: "#/$defs/Document" },
    },
  };

  it("reports a dangling reference inside contentSchema, which Ajv never sees", () => {
    const finding = only(
      reportForSchema({ type: "object", properties: PAYLOAD }),
    );

    expect(finding.id).toBe("SS-REF-001");
    expect(finding.pointer).toBe(
      "/tools/0/inputSchema/properties/payload/contentSchema/$ref",
    );
  });

  it("counts a contentSchema reference for SS-REF-002, so $defs is not orphaned", () => {
    const report = reportForSchema({
      type: "object",
      $defs: { Document: { type: "object", properties: {} } },
      properties: PAYLOAD,
    });

    expect(report.findings).toHaveLength(0);
  });

  it("does not let contentSchema suppress SS-TYPE-001", () => {
    expect(
      findingIds(
        reportForSchema({
          type: "object",
          contentMediaType: "application/json",
          contentSchema: { type: "object", properties: {} },
        }),
      ),
    ).toEqual(["SS-TYPE-001"]);
  });
});

describe("supported reference forms (SPEC 3.5)", () => {
  const withRef = (ref: JsonValue): JsonValue => ({
    type: "object",
    properties: { a: { $ref: ref } },
  });

  it("accepts '#' and '#/...' and nothing else", () => {
    expect(
      reportForSchema({
        type: "object",
        $defs: { T: { type: "string" } },
        properties: { root: { $ref: "#" }, target: { $ref: "#/$defs/T" } },
      }).findings,
    ).toHaveLength(0);
  });

  it("rejects a reference into another document as SS-E-REF-EXTERNAL", () => {
    const externals: readonly string[] = [
      "https://example.com/schema.json#/$defs/T",
      "http://example.com/schema.json",
      "file:///tmp/schema.json",
      "urn:example:schema",
      "shared.json#/$defs/T",
      "./shared.json",
    ];

    for (const ref of externals) {
      expect(codeForSchema(withRef(ref)), ref).toBe("SS-E-REF-EXTERNAL");
    }
  });

  it("rejects an anchor reference as SS-E-REF-UNSUPPORTED", () => {
    expect(codeForSchema(withRef("#Location"))).toBe("SS-E-REF-UNSUPPORTED");
  });

  it("rejects an empty reference as SS-E-REF-UNSUPPORTED", () => {
    expect(codeForSchema(withRef(""))).toBe("SS-E-REF-UNSUPPORTED");
  });

  it("rejects a non-string reference as SS-E-REF-UNSUPPORTED", () => {
    for (const ref of [1, true, null, [], {}] as readonly JsonValue[]) {
      expect(codeForSchema(withRef(ref))).toBe("SS-E-REF-UNSUPPORTED");
    }
  });

  it("rejects anchor keywords wherever they appear", () => {
    const anchored: readonly JsonValue[] = [
      { type: "object", $anchor: "Root", properties: {} },
      {
        type: "object",
        properties: { a: { $anchor: "A", type: "string" } },
      },
      {
        type: "object",
        $defs: { T: { $dynamicAnchor: "T", type: "string" } },
        properties: { a: { $ref: "#/$defs/T" } },
      },
      { type: "object", $recursiveAnchor: true, properties: {} },
    ];

    for (const schema of anchored) {
      expect(codeForSchema(schema)).toBe("SS-E-REF-UNSUPPORTED");
    }
  });

  it("rejects $dynamicRef and $recursiveRef", () => {
    expect(
      codeForSchema({
        type: "object",
        properties: { node: { $dynamicRef: "#Node" } },
      }),
    ).toBe("SS-E-REF-UNSUPPORTED");
    expect(
      codeForSchema({
        type: "object",
        properties: { node: { $recursiveRef: "#" } },
      }),
    ).toBe("SS-E-REF-UNSUPPORTED");
  });

  it("rejects a nested $id that moves the resolution base", () => {
    const schema: JsonValue = {
      $id: "https://example.com/tools/root",
      type: "object",
      $defs: {
        Location: { $id: "https://example.com/tools/location", type: "string" },
      },
      properties: { location: { $ref: "#/$defs/Location" } },
    };

    expect(codeForSchema(schema)).toBe("SS-E-REF-UNSUPPORTED");
    expect(pointerForSchema(schema)).toBe(
      "/tools/0/inputSchema/$defs/Location/$id",
    );
  });

  it("accepts a root $id, because the base never affects a local pointer", () => {
    const report = reportForSchema({
      $id: "https://example.com/tools/root",
      type: "object",
      $defs: { Location: { type: "string" } },
      properties: { location: { $ref: "#/$defs/Location" } },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("prefers SS-E-REF-EXTERNAL when both reference errors are present (SPEC 3.8)", () => {
    expect(
      codeForSchema({
        type: "object",
        properties: {
          anchored: { $ref: "#Location" },
          external: { $ref: "https://example.com/schema.json" },
        },
      }),
    ).toBe("SS-E-REF-EXTERNAL");
  });
});

describe("SS-E-SCHEMA-INVALID (SPEC 3.7)", () => {
  it("rejects a draft-07 tuple `items` surviving in a 2020-12 document", () => {
    const schema: JsonValue = {
      type: "object",
      properties: {
        pair: {
          type: "array",
          items: [{ type: "string" }, { type: "number" }],
        },
      },
    };

    expect(codeForSchema(schema)).toBe("SS-E-SCHEMA-INVALID");
    expect(pointerForSchema(schema)).toBe("/tools/0/inputSchema");
  });

  it("rejects other mis-shaped keyword values", () => {
    expect(
      codeForSchema({
        type: "object",
        properties: { a: { type: "string" } },
        required: "a",
      }),
    ).toBe("SS-E-SCHEMA-INVALID");
    expect(
      codeForSchema({
        type: "object",
        properties: { count: { type: "integer", minimum: "3" } },
      }),
    ).toBe("SS-E-SCHEMA-INVALID");
  });

  it("still reports a schema that is invalid only because of a dangling reference", () => {
    // Ajv aborts on the missing ref; neutralizing it must leave a compilable
    // schema, so this stays a finding rather than becoming an error.
    const finding = only(
      reportForSchema({
        type: "object",
        properties: { location: { $ref: "#/$defs/Location" } },
      }),
    );

    expect(finding.id).toBe("SS-REF-001");
  });

  it("does not raise on a schema whose only oddity is an unknown keyword", () => {
    const report = reportForSchema({
      type: "object",
      properties: { a: { type: "string" } },
      "x-n8n-origin": "converted",
    });

    expect(report.findings).toHaveLength(0);
  });
});

describe("SS-REF-002 orphan definitions container (SPEC 4.1)", () => {
  it("fires on a populated $defs with zero $ref occurrences", () => {
    const finding = only(
      reportForSchema({ type: "object", $defs: { T: { type: "string" } } }),
    );

    expect(finding.id).toBe("SS-REF-002");
    expect(finding.evidence).toBe("n8n#25964");
    expect(finding.rule).toBe("ref.orphan-definitions");
    expect(finding.pointer).toBe("/tools/0/inputSchema/$defs");
  });

  it("does not fire when any $ref occurs anywhere in the tool schema", () => {
    const report = reportForSchema({
      type: "object",
      properties: { a: { $ref: "#/$defs/T" } },
      $defs: { T: { type: "string" } },
    });

    expect(report.findings).toHaveLength(0);
  });

  it("does not fire on an empty container", () => {
    expect(
      findingIds(reportForSchema({ type: "object", $defs: {} })),
    ).not.toContain("SS-REF-002");
  });

  it("inspects $defs only, never a legacy definitions object (SPEC 4.2.1)", () => {
    const report = reportForSchema({
      type: "object",
      properties: { a: { type: "string" } },
      definitions: { T: { type: "string" } },
    });

    expect(report.findings).toHaveLength(0);
  });
});

describe("SS-TYPE-001 collapsed root schema (SPEC 4.2)", () => {
  it("fires on a bare object root", () => {
    const finding = only(reportForSchema({ type: "object" }));

    expect(finding.id).toBe("SS-TYPE-001");
    expect(finding.evidence).toBe("n8n#33864");
    expect(finding.rule).toBe("type.root-collapsed");
    expect(finding.pointer).toBe("/tools/0/inputSchema");
  });

  it("fires on a root carrying only annotation keywords", () => {
    const finding = only(
      reportForSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://example.com/tools/weather",
        $comment: "converted",
        title: "Weather",
        description: "Look up the weather",
        default: {},
        examples: [{}],
        deprecated: false,
        readOnly: false,
        writeOnly: false,
        type: "object",
      }),
    );

    expect(finding.id).toBe("SS-TYPE-001");
  });

  it("fires on a root with no type at all", () => {
    expect(findingIds(reportForSchema({}))).toEqual(["SS-TYPE-001"]);
    expect(findingIds(reportForSchema({ title: "x" }))).toEqual([
      "SS-TYPE-001",
    ]);
  });

  it("does not fire when the root declares a non-object type", () => {
    expect(reportForSchema({ type: "string" }).findings).toHaveLength(0);
    expect(reportForSchema({ type: ["object", "null"] }).findings).toHaveLength(
      0,
    );
  });

  it("is suppressed by every constraining keyword in the SPEC 4.2 table", () => {
    // The table is closed (SPEC 4.2), so the exported set must match it exactly.
    expect(new Set([...CONSTRAINING_KEYWORDS])).toEqual(
      new Set([...Object.keys(CONSTRAINING_SAMPLES), "$ref"]),
    );

    for (const [keyword, value] of Object.entries(CONSTRAINING_SAMPLES)) {
      const report = reportForSchema({ type: "object", [keyword]: value });

      expect(findingIds(report), `keyword ${keyword}`).not.toContain(
        "SS-TYPE-001",
      );
    }

    // `$ref` is the one guard that needs a resolvable target to stay quiet, so
    // it is exercised beside the `$defs` block it points into.
    const withRef = reportForSchema({
      type: "object",
      $ref: "#/$defs/T",
      $defs: { T: { type: "object", properties: {} } },
    });
    expect(findingIds(withRef)).not.toContain("SS-TYPE-001");
  });

  it("is not suppressed by an empty $defs (SPEC 4.2)", () => {
    expect(findingIds(reportForSchema({ type: "object", $defs: {} }))).toEqual([
      "SS-TYPE-001",
    ]);
  });

  it("is not suppressed by a legacy definitions object (SPEC 4.2.1)", () => {
    expect([...CONSTRAINING_KEYWORDS]).not.toContain("definitions");
    expect(
      findingIds(
        reportForSchema({
          type: "object",
          definitions: { T: { type: "string" } },
        }),
      ),
    ).toEqual(["SS-TYPE-001"]);
  });

  it("does not fire on the canonical zero-argument tool", () => {
    expect(
      reportForSchema({ type: "object", additionalProperties: false }).findings,
    ).toHaveLength(0);
    expect(
      reportForSchema({ type: "object", properties: {} }).findings,
    ).toHaveLength(0);
  });

  it("is evaluated only at the tool schema root (SPEC 4.5)", () => {
    const report = reportForSchema({
      type: "object",
      properties: { nested: { type: "object" } },
    });

    expect(report.findings).toHaveLength(0);
  });
});

describe("deferred rules stay unimplemented (SPEC 4.3)", () => {
  it("does not flag a nested object without properties (SS-TYPE-002)", () => {
    expect(
      reportForSchema({
        type: "object",
        properties: { payload: { type: "object" } },
      }).findings,
    ).toHaveLength(0);
  });

  it("does not flag a property without a type (SS-TYPE-003)", () => {
    expect(
      reportForSchema({
        type: "object",
        properties: { anything: { description: "free form" } },
      }).findings,
    ).toHaveLength(0);
  });

  it("does not flag an array without items (SS-TYPE-004)", () => {
    expect(
      reportForSchema({
        type: "object",
        properties: {
          tags: { type: "array" },
          nested: {
            type: "object",
            properties: { inner: { type: "array" } },
          },
        },
      }).findings,
    ).toHaveLength(0);
  });
});

describe("attribution (SPEC 4.4)", () => {
  it("reports a root with surviving definitions as SS-REF-002 only", () => {
    const report = reportForSchema({
      type: "object",
      $defs: { Location: { type: "string" }, Unit: { type: "string" } },
    });

    expect(findingIds(report)).toEqual(["SS-REF-002"]);
  });

  it("reports a root with an empty $defs as SS-TYPE-001 only", () => {
    expect(findingIds(reportForSchema({ type: "object", $defs: {} }))).toEqual([
      "SS-TYPE-001",
    ]);
  });

  it("keeps the two families independent across tools", () => {
    const report = validateDocument(
      toolsDocument(
        tool("ref_loss", {
          type: "object",
          properties: { a: { $ref: "#/$defs/A" } },
        }),
        tool("type_collapse", { type: "object" }),
        tool("orphan", { type: "object", $defs: { T: { type: "string" } } }),
      ),
      "input.json",
    );

    expect(
      report.findings.map((finding) => [finding.toolName, finding.id]),
    ).toEqual([
      ["ref_loss", "SS-REF-001"],
      ["type_collapse", "SS-TYPE-001"],
      ["orphan", "SS-REF-002"],
    ]);
    expect(report.summary.byFingerprint).toEqual({
      "n8n#25964": 2,
      "n8n#33864": 1,
    });
  });
});
