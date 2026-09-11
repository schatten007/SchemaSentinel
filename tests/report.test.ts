import { describe, expect, it } from "vitest";
import type { JsonValue, Report } from "../src/index.js";
import {
  FINGERPRINTS,
  renderHumanReport,
  renderJsonReport,
  reportInputPath,
  validateDocument,
} from "../src/index.js";
import { missingTempPath, tool, toolsDocument } from "./helpers.js";

function keyOrderIsSorted(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(keyOrderIsSorted);
  }
  if (typeof value !== "object" || value === null) {
    return true;
  }
  const keys = Object.keys(value);
  const sorted = [...keys].sort();
  if (keys.join("\u0000") !== sorted.join("\u0000")) {
    return false;
  }
  return Object.values(value).every(keyOrderIsSorted);
}

const COLLAPSED = { type: "object" } as const;

describe("deterministic serialization (SPEC 6.3)", () => {
  it("sorts object keys ASCII-ascending at every depth", () => {
    const report = validateDocument(
      toolsDocument(tool("collapse", COLLAPSED)),
      "input.json",
    );
    const text = renderJsonReport(report);

    expect(keyOrderIsSorted(JSON.parse(text))).toBe(true);
  });

  it("uses 2-space indent, LF endings and exactly one trailing newline", () => {
    const report = validateDocument(
      toolsDocument(tool("collapse", COLLAPSED)),
      "input.json",
    );
    const text = renderJsonReport(report);

    expect(text).not.toContain("\r");
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    expect(text).toContain('\n  "input": {');
  });

  it("produces byte-identical output across repeated runs", () => {
    const document = toolsDocument(
      tool("a", { type: "object", properties: { z: { $ref: "#/$defs/Z" } } }),
      tool("b", COLLAPSED),
    );

    const first = renderJsonReport(validateDocument(document, "input.json"));
    const second = renderJsonReport(validateDocument(document, "input.json"));

    expect(first).toBe(second);
  });

  it("always lists both fingerprint keys, including zero counts", () => {
    const report = validateDocument(
      toolsDocument(tool("clean", { type: "object", properties: {} })),
      "input.json",
    );

    expect(Object.keys(report.summary.byFingerprint)).toEqual([
      ...FINGERPRINTS,
    ]);
    expect(report.summary.byFingerprint).toEqual({
      "n8n#25964": 0,
      "n8n#33864": 0,
    });
  });

  it("carries no timestamp-like or machine-identifying field", () => {
    const report = validateDocument(
      toolsDocument(tool("collapse", COLLAPSED)),
      "input.json",
    );
    const text = renderJsonReport(report).toLowerCase();

    for (const banned of ["timestamp", "generatedat", "duration", "hostname"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("reports input.dialect as the constant 2020-12 (SPEC 6.1)", () => {
    const report = validateDocument(
      toolsDocument(
        tool("declared", {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          properties: {},
        }),
        tool("defaulted", { type: "object", properties: {} }),
      ),
      "input.json",
    );

    expect(report.input.dialect).toBe("2020-12");
    expect(renderJsonReport(report)).toContain('"dialect": "2020-12"');
  });
});

describe("finding order (SPEC 6.3.1)", () => {
  it("sorts by pointer regardless of document key order", () => {
    const report = validateDocument(
      toolsDocument(
        tool("t", {
          type: "object",
          properties: {
            zulu: { $ref: "#/$defs/Z" },
            alpha: { $ref: "#/$defs/A" },
            mike: { $ref: "#/$defs/M" },
          },
        }),
      ),
      "input.json",
    );

    expect(report.findings.map((finding) => finding.pointer)).toEqual([
      "/tools/0/inputSchema/properties/alpha/$ref",
      "/tools/0/inputSchema/properties/mike/$ref",
      "/tools/0/inputSchema/properties/zulu/$ref",
    ]);
  });

  it("compares pointers as ASCII strings, not as numbers", () => {
    const tools = Array.from({ length: 11 }, (_, index) =>
      tool(`tool_${index}`, COLLAPSED),
    );
    const report = validateDocument(toolsDocument(...tools), "input.json");

    expect(report.findings.map((finding) => finding.toolIndex)).toEqual([
      0, 1, 10, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("breaks pointer ties with the finding id", () => {
    const report = validateDocument(
      toolsDocument(
        tool("t", { type: "object", $defs: { T: { type: "string" } } }),
      ),
      "input.json",
    );
    const ids = report.findings.map((finding) => finding.id);

    expect(ids).toEqual([...ids].sort());
  });
});

describe("input path normalization (SPEC 6.3.3)", () => {
  it("emits a POSIX path relative to the working directory", () => {
    const cwd = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo";
    const input =
      process.platform === "win32"
        ? "C:\\work\\repo\\fixtures\\defect\\a.json"
        : "/work/repo/fixtures/defect/a.json";

    expect(reportInputPath(input, cwd)).toBe("fixtures/defect/a.json");
  });

  it("degrades to the basename when the input is outside the working directory", () => {
    const relative = reportInputPath(missingTempPath());

    expect(relative).not.toContain("/");
    expect(relative).not.toContain("\\");
    expect(relative.startsWith("schema-sentinel-missing-")).toBe(true);
  });

  it("never emits an absolute machine path", () => {
    const cwd = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo";
    const outside =
      process.platform === "win32"
        ? "D:\\elsewhere\\a.json"
        : "/elsewhere/a.json";

    expect(reportInputPath(outside, cwd)).toBe("a.json");
  });
});

describe("human report (SPEC 6.3.7)", () => {
  it("is derived from the same sorted finding list", () => {
    const report: Report = validateDocument(
      toolsDocument(
        tool("t", {
          type: "object",
          properties: {
            zulu: { $ref: "#/$defs/Z" },
            alpha: { $ref: "#/$defs/A" },
          },
        }),
      ),
      "input.json",
    );
    const text = renderHumanReport(report);

    expect(text).not.toContain("\r");
    expect(text.indexOf("properties/alpha")).toBeLessThan(
      text.indexOf("properties/zulu"),
    );
    expect(text).toContain("findings: 2 (n8n#25964: 2, n8n#33864: 0)");
  });

  it("prints a caveat for a partial page (SPEC 3.2)", () => {
    const document: JsonValue = {
      tools: [tool("t", { type: "object", properties: {} })],
      nextCursor: "page-2",
    };
    const text = renderHumanReport(validateDocument(document, "input.json"));

    expect(text).toContain("nextCursor");
    expect(text).toContain("a clean page does not describe a clean server");
  });

  it("never describes a clean run as a guarantee", () => {
    const text = renderHumanReport(
      validateDocument(
        toolsDocument(tool("t", { type: "object", properties: {} })),
        "input.json",
      ),
    );

    expect(text).toContain(
      "no findings for the documented defect classes in the bundled corpus",
    );
    expect(text.toLowerCase()).not.toContain("compliant");
    expect(text.toLowerCase()).not.toContain("guarantee");
  });
});
