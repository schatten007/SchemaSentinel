/**
 * Independent evaluation gate (`SPEC.md` section 8).
 *
 * This suite runs the real CLI over the bundled corpus and scores it with the
 * Stage 3 harness. It asserts the `CONTEXT.md` section 7 targets: at least 95%
 * seeded-defect recall, zero false positives on valid controls, zero
 * misattributions, and byte-identical reports across two consecutive runs.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateCorpus, loadManifest, meetsTargets } from "../eval/harness.js";
import { createCorpusRunner } from "../eval/runner.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturesDir = path.join(projectRoot, "fixtures");

const manifest = await loadManifest(path.join(fixturesDir, "manifest.json"));
const evaluation = await evaluateCorpus(
  manifest,
  createCorpusRunner(fixturesDir),
);

function failuresFor(
  predicate: (fixture: (typeof evaluation.fixtures)[number]) => boolean,
): readonly string[] {
  return evaluation.fixtures.filter(predicate).map((fixture) => fixture.path);
}

describe("corpus evaluation against the real validator (SPEC 8)", () => {
  it("detects at least 95% of the seeded defects", () => {
    expect(failuresFor((fixture) => fixture.missed.length > 0)).toEqual([]);
    expect(evaluation.expectedFindingCount).toBeGreaterThan(0);
    expect(evaluation.recall).toBeGreaterThanOrEqual(0.95);
  });

  it("reports zero findings on the valid controls", () => {
    expect(failuresFor((fixture) => fixture.falsePositives > 0)).toEqual([]);
    expect(evaluation.falsePositiveCount).toBe(0);
  });

  it("emits no unexpected finding on a defect fixture", () => {
    expect(failuresFor((fixture) => fixture.unexpected.length > 0)).toEqual([]);
    expect(evaluation.unexpectedCount).toBe(0);
  });

  it("never attributes a defect to the wrong evidence family", () => {
    expect(failuresFor((fixture) => fixture.misattributed.length > 0)).toEqual(
      [],
    );
    expect(evaluation.misattributionCount).toBe(0);
  });

  it("produces byte-identical reports on consecutive runs", () => {
    expect(failuresFor((fixture) => !fixture.deterministic)).toEqual([]);
    expect(evaluation.deterministic).toBe(true);
  });

  it("returns the exit code each fixture expects", () => {
    expect(failuresFor((fixture) => !fixture.exitCodeOk)).toEqual([]);
    expect(evaluation.allExitCodesOk).toBe(true);
  });

  it("returns the error code each error fixture expects", () => {
    expect(failuresFor((fixture) => fixture.errorCodeOk === false)).toEqual([]);
    expect(evaluation.allErrorCodesOk).toBe(true);
  });

  it("meets every SPEC 8 target at once", () => {
    expect(meetsTargets(evaluation)).toBe(true);
  });
});
