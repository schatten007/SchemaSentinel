import { readFile } from "node:fs/promises";

export type FixtureKind = "valid" | "defect" | "error";

export interface ExpectedFinding {
  readonly id: string;
  readonly pointer: string;
  readonly toolName: string;
}

export interface FixtureExpectation {
  readonly path: string;
  readonly kind: FixtureKind;
  readonly expectedExitCode: number;
  readonly evidence?: string | readonly string[];
  readonly expectedFindings?: readonly ExpectedFinding[];
  readonly expectedErrorCode?: string;
}

export interface Manifest {
  readonly manifestVersion: number;
  readonly fixtures: readonly FixtureExpectation[];
}

export interface ReportedFinding {
  readonly id: string;
  readonly pointer: string;
  readonly toolName: string;
  readonly evidence?: string;
}

export interface ReportShape {
  readonly findings?: readonly ReportedFinding[];
  readonly error?: { readonly code?: string };
}

export interface FixtureResult {
  readonly path: string;
  readonly exitCode: number;
  readonly reportText: string;
}

export interface FixtureEvaluation {
  readonly path: string;
  readonly kind: FixtureKind;
  readonly expectedExitCode: number;
  readonly actualExitCode: number;
  readonly exitCodeOk: boolean;
  readonly expectedErrorCode: string | null;
  readonly actualErrorCode: string | null;
  readonly errorCodeOk: boolean | null;
  readonly matched: readonly ReportedFinding[];
  readonly missed: readonly ExpectedFinding[];
  readonly unexpected: readonly ReportedFinding[];
  readonly misattributed: readonly ReportedFinding[];
  readonly falsePositives: number;
  readonly deterministic: boolean;
}

export interface CorpusEvaluation {
  readonly fixtures: readonly FixtureEvaluation[];
  readonly expectedFindingCount: number;
  readonly matchedFindingCount: number;
  readonly recall: number;
  readonly falsePositiveCount: number;
  readonly misattributionCount: number;
  readonly unexpectedCount: number;
  readonly deterministic: boolean;
  readonly allExitCodesOk: boolean;
  readonly allErrorCodesOk: boolean;
}

export const EVALUATION_TARGETS = {
  recall: 0.95,
  falsePositives: 0,
  misattributions: 0,
  unexpected: 0,
} as const;

interface FindingScore {
  readonly matched: readonly ReportedFinding[];
  readonly missed: readonly ExpectedFinding[];
  readonly unexpected: readonly ReportedFinding[];
  readonly misattributed: readonly ReportedFinding[];
}

function findingKey(finding: {
  id: string;
  toolName: string;
  pointer: string;
}): string {
  return JSON.stringify([finding.id, finding.toolName, finding.pointer]);
}

function locationKey(finding: { toolName: string; pointer: string }): string {
  return JSON.stringify([finding.toolName, finding.pointer]);
}

export function scoreFindings(
  expected: readonly ExpectedFinding[],
  actual: readonly ReportedFinding[],
): FindingScore {
  const remaining = new Map<string, number>();
  for (const finding of expected) {
    const key = findingKey(finding);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const expectedLocations = new Set(
    expected.map((finding) => locationKey(finding)),
  );
  const matched: ReportedFinding[] = [];
  const unexpected: ReportedFinding[] = [];
  const misattributed: ReportedFinding[] = [];

  for (const finding of actual) {
    const key = findingKey(finding);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      matched.push(finding);
    } else {
      unexpected.push(finding);
      if (expectedLocations.has(locationKey(finding))) {
        misattributed.push(finding);
      }
    }
  }

  const missed: ExpectedFinding[] = [];
  for (const finding of expected) {
    const key = findingKey(finding);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      missed.push(finding);
    }
  }

  return { matched, missed, unexpected, misattributed };
}

function parseReport(reportText: string): ReportShape {
  try {
    const parsed: unknown = JSON.parse(reportText);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as ReportShape;
    }
    return {};
  } catch {
    return {};
  }
}

export async function evaluateCorpus(
  manifest: Manifest,
  run: (fixture: FixtureExpectation) => Promise<FixtureResult>,
): Promise<CorpusEvaluation> {
  const evaluations: FixtureEvaluation[] = [];
  let expectedFindingCount = 0;
  let matchedFindingCount = 0;
  let falsePositiveCount = 0;
  let misattributionCount = 0;
  let unexpectedCount = 0;
  let deterministic = true;
  let allExitCodesOk = true;
  let allErrorCodesOk = true;

  for (const fixture of manifest.fixtures) {
    const first = await run(fixture);
    const second = await run(fixture);

    const deterministicHere = first.reportText === second.reportText;
    deterministic = deterministic && deterministicHere;

    const exitCodeOk = first.exitCode === fixture.expectedExitCode;
    allExitCodesOk = allExitCodesOk && exitCodeOk;

    const report = parseReport(first.reportText);
    const actualFindings = Array.isArray(report.findings)
      ? report.findings
      : [];
    const expectedFindings = fixture.expectedFindings ?? [];
    const score = scoreFindings(expectedFindings, actualFindings);

    const expectedErrorCode = fixture.expectedErrorCode ?? null;
    const actualErrorCode =
      typeof report.error?.code === "string" ? report.error.code : null;
    let errorCodeOk: boolean | null = null;
    if (fixture.kind === "error") {
      errorCodeOk = actualErrorCode === expectedErrorCode;
      allErrorCodesOk = allErrorCodesOk && errorCodeOk;
    }

    let falsePositives = 0;
    if (fixture.kind === "valid") {
      falsePositives = actualFindings.length;
    } else if (fixture.kind === "defect") {
      expectedFindingCount += expectedFindings.length;
      matchedFindingCount += score.matched.length;
      unexpectedCount += score.unexpected.length - score.misattributed.length;
    }
    falsePositiveCount += falsePositives;
    misattributionCount += score.misattributed.length;

    evaluations.push({
      path: fixture.path,
      kind: fixture.kind,
      expectedExitCode: fixture.expectedExitCode,
      actualExitCode: first.exitCode,
      exitCodeOk,
      expectedErrorCode,
      actualErrorCode,
      errorCodeOk,
      matched: score.matched,
      missed: score.missed,
      unexpected: score.unexpected,
      misattributed: score.misattributed,
      falsePositives,
      deterministic: deterministicHere,
    });
  }

  const recall =
    expectedFindingCount === 0 ? 1 : matchedFindingCount / expectedFindingCount;

  return {
    fixtures: evaluations,
    expectedFindingCount,
    matchedFindingCount,
    recall,
    falsePositiveCount,
    misattributionCount,
    unexpectedCount,
    deterministic,
    allExitCodesOk,
    allErrorCodesOk,
  };
}

export function meetsTargets(evaluation: CorpusEvaluation): boolean {
  return (
    evaluation.recall >= EVALUATION_TARGETS.recall &&
    evaluation.falsePositiveCount <= EVALUATION_TARGETS.falsePositives &&
    evaluation.misattributionCount <= EVALUATION_TARGETS.misattributions &&
    evaluation.unexpectedCount <= EVALUATION_TARGETS.unexpected &&
    evaluation.deterministic &&
    evaluation.allExitCodesOk &&
    evaluation.allErrorCodesOk
  );
}

export async function loadManifest(filePath: string): Promise<Manifest> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as Manifest;
}
