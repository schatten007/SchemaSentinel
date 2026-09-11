import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  FixtureExpectation,
  FixtureResult,
  Manifest,
  ReportedFinding,
} from "../eval/harness.js";
import {
  evaluateCorpus,
  loadManifest,
  meetsTargets,
  scoreFindings,
} from "../eval/harness.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");
const fixturesDir = path.join(projectRoot, "fixtures");
const manifestPath = path.join(fixturesDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

const KNOWN_IDS = ["SS-REF-001", "SS-REF-002", "SS-TYPE-001"];
const KNOWN_ERROR_CODES = [
  "SS-E-IO",
  "SS-E-PARSE",
  "SS-E-SHAPE",
  "SS-E-SCHEMA-TYPE",
  "SS-E-DIALECT",
  "SS-E-REF-EXTERNAL",
  "SS-E-REF-UNSUPPORTED",
  "SS-E-SCHEMA-INVALID",
];

/**
 * SPEC 7.2 gives SS-E-IO no committed fixture, and SPEC 3.7 gives SS-E-INTERNAL
 * none by definition. Every other exit-2 code must be represented.
 */
const CODES_WITHOUT_FIXTURES = ["SS-E-IO", "SS-E-INTERNAL"];

const DIALECT_2020 = [
  "https://json-schema.org/draft/2020-12/schema",
  "https://json-schema.org/draft/2020-12/schema#",
  "http://json-schema.org/draft/2020-12/schema",
  "http://json-schema.org/draft/2020-12/schema#",
];

interface ToolLike {
  readonly name?: unknown;
  readonly inputSchema?: unknown;
}

async function collectFixtureFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await collectFixtureFiles(path.join(dir, entry.name));
      for (const item of nested) {
        found.push(`${entry.name}/${item}`);
      }
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".json") &&
      entry.name !== "manifest.json"
    ) {
      found.push(entry.name);
    }
  }
  return found;
}

function extractTools(document: unknown): ToolLike[] | null {
  if (Array.isArray(document)) {
    return document as ToolLike[];
  }
  if (document !== null && typeof document === "object") {
    const record = document as Record<string, unknown>;
    if (Array.isArray(record.tools)) {
      return record.tools as ToolLike[];
    }
    const result = record.result;
    if (result !== null && typeof result === "object") {
      const resultRecord = result as Record<string, unknown>;
      if (Array.isArray(resultRecord.tools)) {
        return resultRecord.tools as ToolLike[];
      }
    }
  }
  return null;
}

function toolIndexFromPointer(pointer: string): number | null {
  const match = /^\/tools\/(\d+)(?:\/|$)/.exec(pointer);
  const captured = match?.[1];
  if (captured === undefined) {
    return null;
  }
  return Number(captured);
}

function resolvePointer(root: unknown, pointer: string): unknown {
  if (pointer === "") {
    return root;
  }
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));

  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function runnerFrom(): (fixture: FixtureExpectation) => Promise<FixtureResult> {
  return async (fixture) => {
    if (fixture.kind === "error") {
      return {
        path: fixture.path,
        exitCode: fixture.expectedExitCode,
        reportText: JSON.stringify({
          error: { code: fixture.expectedErrorCode },
        }),
      };
    }
    const findings: ReportedFinding[] = (fixture.expectedFindings ?? []).map(
      (finding) => ({
        id: finding.id,
        pointer: finding.pointer,
        toolName: finding.toolName,
      }),
    );
    return {
      path: fixture.path,
      exitCode: fixture.expectedExitCode,
      reportText: JSON.stringify({ findings }),
    };
  };
}

function manifestOf(...fixtures: FixtureExpectation[]): Manifest {
  return { manifestVersion: 1, fixtures };
}

function hasEvidence(evidence: FixtureExpectation["evidence"]): boolean {
  if (typeof evidence === "string") {
    return evidence.length > 0;
  }
  return Array.isArray(evidence) && evidence.length > 0;
}

const defectFixture: FixtureExpectation = {
  path: "defect/sample.json",
  kind: "defect",
  expectedExitCode: 1,
  evidence: "n8n#25964",
  expectedFindings: [
    {
      id: "SS-REF-001",
      pointer: "/tools/0/inputSchema/properties/a/$ref",
      toolName: "t",
    },
  ],
};

const validFixture: FixtureExpectation = {
  path: "valid/sample.json",
  kind: "valid",
  expectedExitCode: 0,
  expectedFindings: [],
};

const errorFixture: FixtureExpectation = {
  path: "error/sample.json",
  kind: "error",
  expectedExitCode: 2,
  expectedErrorCode: "SS-E-PARSE",
};

describe("fixture corpus consistency", () => {
  it("loads through the harness and declares manifestVersion 1", async () => {
    const loaded = await loadManifest(manifestPath);
    expect(loaded).toEqual(manifest);
    expect(manifest.manifestVersion).toBe(1);
  });

  it("ships the 8 valid, 8 defect and 14 error fixtures required by SPEC 7", () => {
    expect(manifest.fixtures).toHaveLength(30);
    expect(manifest.fixtures.filter((f) => f.kind === "valid")).toHaveLength(8);
    expect(manifest.fixtures.filter((f) => f.kind === "defect")).toHaveLength(
      8,
    );
    expect(manifest.fixtures.filter((f) => f.kind === "error")).toHaveLength(
      14,
    );
  });

  it("holds the detection corpus near 15 files (CONTEXT 4)", () => {
    const detection = manifest.fixtures.filter((f) => f.kind !== "error");

    expect(detection.length).toBeGreaterThanOrEqual(14);
    expect(detection.length).toBeLessThanOrEqual(17);
  });

  it("labels 15 expected findings across the defect corpus", () => {
    const total = manifest.fixtures
      .filter((f) => f.kind === "defect")
      .reduce((sum, f) => sum + (f.expectedFindings?.length ?? 0), 0);

    expect(total).toBe(15);
  });

  it("lists every fixture file exactly once and no orphan files", async () => {
    const discovered = await collectFixtureFiles(fixturesDir);
    const listed = manifest.fixtures.map((f) => f.path);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...discovered].sort()).toEqual([...listed].sort());
    expect(listed).not.toContain("manifest.json");
  });

  it("keeps paths relative, POSIX-separated and sorted", () => {
    const paths = manifest.fixtures.map((f) => f.path);
    expect(paths).toEqual([...paths].sort());
    for (const value of paths) {
      expect(value.includes("\\")).toBe(false);
      expect(value.startsWith("/")).toBe(false);
    }
  });

  it("keeps kind, exit code, evidence and error code coherent", () => {
    for (const fixture of manifest.fixtures) {
      if (fixture.kind === "valid") {
        expect(fixture.expectedExitCode).toBe(0);
        expect(fixture.expectedFindings ?? []).toEqual([]);
        expect(fixture.expectedErrorCode).toBeUndefined();
      } else if (fixture.kind === "defect") {
        expect(fixture.expectedExitCode).toBe(1);
        expect(fixture.expectedFindings?.length ?? 0).toBeGreaterThan(0);
        expect(hasEvidence(fixture.evidence)).toBe(true);
        expect(fixture.expectedErrorCode).toBeUndefined();
      } else {
        expect(fixture.expectedExitCode).toBe(2);
        expect(fixture.expectedFindings ?? []).toEqual([]);
        expect(KNOWN_ERROR_CODES).toContain(fixture.expectedErrorCode);
      }
    }
  });

  it("uses only known ids and unique (id, toolName, pointer) expectations", () => {
    for (const fixture of manifest.fixtures) {
      const keys = (fixture.expectedFindings ?? []).map(
        (finding) => `${finding.id}|${finding.toolName}|${finding.pointer}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
      for (const finding of fixture.expectedFindings ?? []) {
        expect(KNOWN_IDS).toContain(finding.id);
        expect(finding.pointer.startsWith("/tools/")).toBe(true);
        expect(finding.toolName.length).toBeGreaterThan(0);
      }
    }
  });

  it("records the mixed-family fixture's evidence as an array", () => {
    const mixed = manifest.fixtures.find(
      (fixture) => fixture.path === "defect/mixed-multi-tool.json",
    );
    expect(Array.isArray(mixed?.evidence)).toBe(true);
    expect(mixed?.evidence).toEqual(["n8n#25964", "n8n#33864"]);
  });

  it("covers every exit-2 code that SPEC says can have a fixture", () => {
    const covered = new Set(
      manifest.fixtures
        .filter((fixture) => fixture.kind === "error")
        .map((fixture) => fixture.expectedErrorCode),
    );

    for (const code of KNOWN_ERROR_CODES) {
      if (CODES_WITHOUT_FIXTURES.includes(code)) {
        expect(covered.has(code), code).toBe(false);
      } else {
        expect(covered.has(code), code).toBe(true);
      }
    }
    expect(covered.has("SS-E-INTERNAL")).toBe(false);
  });

  it("keeps every scored fixture in the 2020-12 dialect (SPEC 3.4)", async () => {
    for (const fixture of manifest.fixtures) {
      if (fixture.kind === "error") {
        continue;
      }
      const text = await readFile(path.join(fixturesDir, fixture.path), "utf8");
      const tools = extractTools(JSON.parse(text) as unknown) ?? [];

      for (const entry of tools) {
        const schema = entry.inputSchema as Record<string, unknown> | undefined;
        const declared = schema?.$schema;
        if (declared !== undefined) {
          expect(
            DIALECT_2020,
            `${fixture.path} declares ${String(declared)}`,
          ).toContain(declared);
        }
      }
    }
  });

  it("parses each fixture and resolves every expected pointer to its tool", async () => {
    for (const fixture of manifest.fixtures) {
      const text = await readFile(path.join(fixturesDir, fixture.path), "utf8");
      if (fixture.path === "error/malformed.json") {
        expect(() => JSON.parse(text)).toThrow();
        continue;
      }
      const parsed: unknown = JSON.parse(text);
      for (const finding of fixture.expectedFindings ?? []) {
        const toolIndex = toolIndexFromPointer(finding.pointer);
        expect(toolIndex).not.toBeNull();
        const tools = extractTools(parsed);
        expect(tools).not.toBeNull();
        expect(tools?.[toolIndex ?? 0]?.name).toBe(finding.toolName);
        const normalized = { tools: tools ?? [] };
        expect(resolvePointer(normalized, finding.pointer)).toBeDefined();
      }
    }
  });
});

describe("finding scorer", () => {
  it("matches identical (id, toolName, pointer) triples as a multiset", () => {
    const expected = [
      { id: "SS-REF-001", pointer: "/tools/0/x/$ref", toolName: "t" },
      { id: "SS-REF-001", pointer: "/tools/0/x/$ref", toolName: "t" },
    ];
    const actual = [
      { id: "SS-REF-001", pointer: "/tools/0/x/$ref", toolName: "t" },
      { id: "SS-REF-001", pointer: "/tools/0/x/$ref", toolName: "t" },
    ];
    const score = scoreFindings(expected, actual);
    expect(score.matched).toHaveLength(2);
    expect(score.missed).toHaveLength(0);
    expect(score.misattributed).toHaveLength(0);
  });

  it("treats a wrong-family id at an expected location as misattribution", () => {
    const expected = [
      {
        id: "SS-REF-001",
        pointer: "/tools/0/inputSchema/properties/a/$ref",
        toolName: "t",
      },
    ];
    const actual = [
      {
        id: "SS-TYPE-001",
        pointer: "/tools/0/inputSchema/properties/a/$ref",
        toolName: "t",
      },
    ];
    const score = scoreFindings(expected, actual);
    expect(score.matched).toHaveLength(0);
    expect(score.missed).toHaveLength(1);
    expect(score.misattributed).toHaveLength(1);
  });
});

describe("corpus evaluation", () => {
  it("scores the shipped manifest as a perfect, deterministic, target-meeting run", async () => {
    const result = await evaluateCorpus(manifest, runnerFrom());
    expect(result.expectedFindingCount).toBeGreaterThan(0);
    expect(result.matchedFindingCount).toBe(result.expectedFindingCount);
    expect(result.recall).toBe(1);
    expect(result.falsePositiveCount).toBe(0);
    expect(result.misattributionCount).toBe(0);
    expect(result.unexpectedCount).toBe(0);
    expect(result.deterministic).toBe(true);
    expect(result.allExitCodesOk).toBe(true);
    expect(result.allErrorCodesOk).toBe(true);
    expect(meetsTargets(result)).toBe(true);
  });

  it("counts a missing expected finding against recall", async () => {
    const result = await evaluateCorpus(
      manifestOf(defectFixture),
      async (fixture) => ({
        path: fixture.path,
        exitCode: 1,
        reportText: JSON.stringify({ findings: [] }),
      }),
    );
    expect(result.recall).toBe(0);
    expect(result.fixtures[0]?.missed).toHaveLength(1);
    expect(meetsTargets(result)).toBe(false);
  });

  it("counts any finding on a valid control as a false positive", async () => {
    const result = await evaluateCorpus(
      manifestOf(validFixture),
      async (fixture) => ({
        path: fixture.path,
        exitCode: 0,
        reportText: JSON.stringify({
          findings: [
            {
              id: "SS-TYPE-001",
              pointer: "/tools/0/inputSchema",
              toolName: "sample",
            },
          ],
        }),
      }),
    );
    expect(result.falsePositiveCount).toBe(1);
    expect(meetsTargets(result)).toBe(false);
  });

  it("scores wrong-family output as misattribution as well as a miss", async () => {
    const result = await evaluateCorpus(
      manifestOf(defectFixture),
      async (fixture) => ({
        path: fixture.path,
        exitCode: 1,
        reportText: JSON.stringify({
          findings: [
            {
              id: "SS-TYPE-001",
              pointer: "/tools/0/inputSchema/properties/a/$ref",
              toolName: "t",
            },
          ],
        }),
      }),
    );
    expect(result.recall).toBe(0);
    expect(result.misattributionCount).toBe(1);
    expect(meetsTargets(result)).toBe(false);
  });

  it("fails the targets when a defect fixture reports an extra finding", async () => {
    const result = await evaluateCorpus(
      manifestOf(defectFixture),
      async (fixture) => ({
        path: fixture.path,
        exitCode: 1,
        reportText: JSON.stringify({
          findings: [
            {
              id: "SS-REF-001",
              pointer: "/tools/0/inputSchema/properties/a/$ref",
              toolName: "t",
            },
            {
              id: "SS-TYPE-001",
              pointer: "/tools/9/inputSchema",
              toolName: "other",
            },
          ],
        }),
      }),
    );
    expect(result.recall).toBe(1);
    expect(result.unexpectedCount).toBe(1);
    expect(result.misattributionCount).toBe(0);
    expect(meetsTargets(result)).toBe(false);
  });

  it("fails determinism when two runs differ", async () => {
    let runs = 0;
    const result = await evaluateCorpus(
      manifestOf(validFixture),
      async (fixture) => {
        runs += 1;
        return {
          path: fixture.path,
          exitCode: 0,
          reportText: JSON.stringify({ findings: [], run: runs }),
        };
      },
    );
    expect(result.deterministic).toBe(false);
    expect(meetsTargets(result)).toBe(false);
  });

  it("scores error fixtures on exit code and error code only", async () => {
    const result = await evaluateCorpus(
      manifestOf(errorFixture),
      async (fixture) => ({
        path: fixture.path,
        exitCode: 2,
        reportText: JSON.stringify({ error: { code: "SS-E-SHAPE" } }),
      }),
    );
    expect(result.allExitCodesOk).toBe(true);
    expect(result.allErrorCodesOk).toBe(false);
    expect(result.expectedFindingCount).toBe(0);
    expect(meetsTargets(result)).toBe(false);
  });
});
