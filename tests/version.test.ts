import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOL_NAME, TOOL_VERSION } from "../src/index.js";

const packageJsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);

describe("tool identity", () => {
  it("matches package.json so reports never disagree with the release", async () => {
    const manifest: unknown = JSON.parse(
      await readFile(packageJsonPath, "utf8"),
    );

    expect(manifest).toMatchObject({
      name: TOOL_NAME,
      version: TOOL_VERSION,
    });
  });
});
