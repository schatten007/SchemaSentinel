/**
 * Runs the whole bundled corpus through the real validator and prints the
 * SPEC section 8 metrics. Exits 1 when a target is missed.
 *
 *   npm run eval
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCorpus, loadManifest, meetsTargets } from "./harness.js";
import { createCorpusRunner, formatEvaluation } from "./runner.js";

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

process.stdout.write(formatEvaluation(evaluation));
process.exitCode = meetsTargets(evaluation) ? 0 : 1;
