/**
 * Wires the Stage 3 evaluation harness to the real validator.
 *
 * The runner drives the actual CLI entrypoint with `--format json` so that the
 * evaluation scores the shipped behavior — exit code and report bytes — rather
 * than an internal shortcut.
 */

import path from "node:path";
import { type CliIo, runCli } from "../src/index.js";
import type {
  CorpusEvaluation,
  FixtureExpectation,
  FixtureResult,
} from "./harness.js";

export function createCorpusRunner(
  fixturesDir: string,
): (fixture: FixtureExpectation) => Promise<FixtureResult> {
  return async (fixture) => {
    const chunks: string[] = [];
    const io: CliIo = {
      stdout: (text) => {
        chunks.push(text);
      },
      stderr: () => {},
    };

    const exitCode = await runCli(
      ["validate", path.join(fixturesDir, fixture.path), "--format", "json"],
      io,
    );

    return { path: fixture.path, exitCode, reportText: chunks.join("") };
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatEvaluation(evaluation: CorpusEvaluation): string {
  const lines: string[] = [
    "fixture                                    kind    exit  findings",
  ];

  for (const fixture of evaluation.fixtures) {
    const exit = `${fixture.actualExitCode}${fixture.exitCodeOk ? "" : "!"}`;
    const detail =
      fixture.kind === "error"
        ? `${fixture.actualErrorCode ?? "none"}${fixture.errorCodeOk ? "" : "!"}`
        : `matched=${fixture.matched.length} missed=${fixture.missed.length} unexpected=${fixture.unexpected.length} misattributed=${fixture.misattributed.length}`;
    lines.push(
      `${fixture.path.padEnd(42)} ${fixture.kind.padEnd(7)} ${exit.padEnd(5)} ${detail}`,
    );
  }

  lines.push(
    "",
    `recall:          ${evaluation.matchedFindingCount}/${evaluation.expectedFindingCount} (${percent(evaluation.recall)})`,
    `false positives: ${evaluation.falsePositiveCount}`,
    `unexpected:      ${evaluation.unexpectedCount}`,
    `misattributions: ${evaluation.misattributionCount}`,
    `deterministic:   ${evaluation.deterministic}`,
    `exit codes ok:   ${evaluation.allExitCodesOk}`,
    `error codes ok:  ${evaluation.allErrorCodesOk}`,
  );

  return `${lines.join("\n")}\n`;
}
