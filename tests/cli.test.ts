import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CliIo } from "../src/index.js";
import { runCli } from "../src/index.js";
import {
  missingTempPath,
  tool,
  toolsDocument,
  writeTempDocument,
  writeTempJson,
} from "./helpers.js";

interface Captured {
  readonly io: CliIo;
  readonly out: string[];
  readonly err: string[];
}

function capture(): Captured {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (text) => {
        out.push(text);
      },
      stderr: (text) => {
        err.push(text);
      },
    },
    out,
    err,
  };
}

function joined(chunks: readonly string[]): string {
  return chunks.join("");
}

const CLEAN = toolsDocument(
  tool("get_weather", {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  }),
);

const BROKEN = toolsDocument(
  tool("get_weather", {
    type: "object",
    properties: { location: { $ref: "#/$defs/Location" } },
  }),
);

describe("exit-code contract (SPEC 5)", () => {
  it("exits 0 when validation completes with zero findings", async () => {
    const file = await writeTempDocument(CLEAN);
    const sink = capture();

    const code = await runCli(["validate", file], sink.io);

    expect(code).toBe(0);
    expect(joined(sink.out)).toContain("findings: 0");
    expect(joined(sink.err)).toBe("");
  });

  it("exits 1 when validation completes with findings", async () => {
    const file = await writeTempDocument(BROKEN);
    const sink = capture();

    const code = await runCli(["validate", file], sink.io);

    expect(code).toBe(1);
    expect(joined(sink.out)).toContain("SS-REF-001");
  });

  it("exits 2 on SS-E-IO for a temporary path that is never created", async () => {
    const file = missingTempPath();
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);

    expect(code).toBe(2);
    const report: unknown = JSON.parse(joined(sink.out));
    expect(report).toEqual({
      error: {
        code: "SS-E-IO",
        message: "Input file is missing or unreadable.",
      },
      input: { path: path.basename(file) },
      reportVersion: 1,
      tool: { name: "schema-sentinel", version: "0.1.0" },
    });
    expect(joined(sink.out)).not.toContain('"findings"');
  });

  it("keeps stdout empty for a human-format error so no output reads as a pass", async () => {
    const sink = capture();

    const code = await runCli(["validate", missingTempPath()], sink.io);

    expect(code).toBe(2);
    expect(joined(sink.out)).toBe("");
    expect(joined(sink.err)).toContain("SS-E-IO");
    expect(joined(sink.err)).toContain("no verdict was produced");
  });

  it("exits 2 on unparseable JSON", async () => {
    const file = await writeTempJson('{"tools": [');
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);

    expect(code).toBe(2);
    expect(JSON.parse(joined(sink.out))).toEqual({
      error: { code: "SS-E-PARSE", message: "Input is not valid JSON." },
      input: { path: path.basename(file) },
      reportVersion: 1,
      tool: { name: "schema-sentinel", version: "0.1.0" },
    });
  });

  it("exits 2 on a declared draft-07 dialect, which is no longer analyzed", async () => {
    const file = await writeTempDocument(
      toolsDocument(
        tool("t", {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {},
        }),
      ),
    );
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);

    expect(code).toBe(2);
    expect(JSON.parse(joined(sink.out))).toMatchObject({
      error: { code: "SS-E-DIALECT", pointer: "/tools/0/inputSchema/$schema" },
    });
    expect(joined(sink.out)).not.toContain('"findings"');
  });

  it("exits 2 on an external reference", async () => {
    const file = await writeTempDocument(
      toolsDocument(
        tool("t", {
          type: "object",
          properties: { a: { $ref: "https://example.com/schema.json" } },
        }),
      ),
    );
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);

    expect(code).toBe(2);
    expect(JSON.parse(joined(sink.out))).toMatchObject({
      error: { code: "SS-E-REF-EXTERNAL" },
    });
  });

  it("exits 2 on a reference construct outside the supported subset", async () => {
    const file = await writeTempDocument(
      toolsDocument(
        tool("t", {
          type: "object",
          properties: { a: { $dynamicRef: "#Node" } },
        }),
      ),
    );
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);

    expect(code).toBe(2);
    expect(JSON.parse(joined(sink.out))).toMatchObject({
      error: { code: "SS-E-REF-UNSUPPORTED" },
    });
  });

  it("exits 2 without leaking findings when a schema is invalid for another reason", async () => {
    const file = await writeTempDocument(
      toolsDocument(
        tool("t", {
          type: "object",
          properties: {
            a: { $ref: "#/$defs/Missing", type: 7 },
          },
        }),
      ),
    );
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);

    expect(code).toBe(2);
    expect(JSON.parse(joined(sink.out))).toMatchObject({
      error: { code: "SS-E-SCHEMA-INVALID", pointer: "/tools/0/inputSchema" },
    });
    expect(joined(sink.out)).not.toContain("SS-REF-001");
  });

  it("exits 2 on an unusable option value", async () => {
    const file = await writeTempDocument(CLEAN);
    const sink = capture();

    expect(await runCli(["validate", file, "--format", "yaml"], sink.io)).toBe(
      2,
    );
    expect(await runCli(["validate"], sink.io)).toBe(2);
    expect(await runCli(["explain", file], sink.io)).toBe(2);
  });

  it("exits 0 for --version", async () => {
    const sink = capture();

    expect(await runCli(["--version"], sink.io)).toBe(0);
    expect(joined(sink.out).trim()).toBe("0.1.0");
  });
});

describe("output routing (SPEC 5, 6)", () => {
  it("emits only the JSON document on stdout with --format json", async () => {
    const file = await writeTempDocument(BROKEN);
    const sink = capture();

    const code = await runCli(["validate", file, "--format", "json"], sink.io);
    const parsed: unknown = JSON.parse(joined(sink.out));

    expect(code).toBe(1);
    expect(parsed).toMatchObject({
      reportVersion: 1,
      tool: { name: "schema-sentinel", version: "0.1.0" },
    });
    expect(joined(sink.err)).toBe("");
  });

  it("writes the report to --out and leaves only a summary on stdout", async () => {
    const file = await writeTempDocument(BROKEN);
    const outPath = `${file}.report.json`;
    const sink = capture();

    const code = await runCli(
      ["validate", file, "--format", "json", "--out", outPath],
      sink.io,
    );
    const written = await readFile(outPath, "utf8");

    expect(code).toBe(1);
    expect(JSON.parse(written)).toMatchObject({ reportVersion: 1 });
    expect(joined(sink.out)).toBe(
      `schema-sentinel: 1 finding in ${path.basename(file)} (report written to ${outPath})\n`,
    );
  });

  it("produces byte-identical reports on consecutive runs", async () => {
    const file = await writeTempDocument(BROKEN);
    const first = capture();
    const second = capture();

    await runCli(["validate", file, "--format", "json"], first.io);
    await runCli(["validate", file, "--format", "json"], second.io);

    expect(joined(first.out)).toBe(joined(second.out));
    expect(joined(first.out)).not.toContain("\r");
  });
});
