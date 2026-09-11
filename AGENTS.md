# SchemaSentinel Agent Guide

## Start Here
- Read `CONTEXT.md` before changing scope or behavior. This repo is the standalone SchemaSentinel package, not a monorepo; do not modify sibling projects.
- The MVP detectors are implemented (Stage 4 complete). `src/cli.ts` is the executable entrypoint and `src/index.ts` is the library entrypoint; `validate` exits `0`/`1` on a completed validation and `2` only when no trustworthy verdict was possible.

## Windows Commands
- PowerShell's effective execution policy is `Restricted`, so bare `npm` and `npx` invoke blocked `.ps1` shims. Use `npm.cmd` and `npx.cmd` at the prompt. Commands inside npm scripts are unaffected.
- Install: `npm.cmd install`
- Full gate, in required order (lint -> typecheck -> test): `npm.cmd run check`
- Build: `npm.cmd run build`; run the built CLI with `node dist/cli.js validate <file>`.
- Focus one file: `npx.cmd vitest run tests/cli.test.ts`; focus one test: `npx.cmd vitest run -t "test name"`.
- Corpus evaluation against the real validator: `npm.cmd run eval` (also enforced by `tests/evaluation.test.ts`).
- Format intentionally: `npm.cmd run format`. `lint` uses `biome check` and does not write changes.

## Toolchain Boundaries
- TypeScript is strict ESM with `NodeNext`; relative imports include the emitted `.js` extension even in `.ts` sources.
- Production builds use `tsconfig.json`; `tsconfig.test.json` typechecks `src/`, `tests/` and `eval/` without emitting. Do not put generated output under any of them.
- Runtime dependencies are Commander and Ajv; Vitest and Biome provide tests and formatting. Keep dependency versions exact in `package.json`.
- Pin the supported JSON Schema dialect in `SPEC.md` before implementing resolution or validation. Verify Ajv's current dialect-specific entry point with Context7 rather than assuming the default export supports the required dialect.

## CLI Contract
- Reserve exit code `0` for a completed validation with no detected defects, `1` for a completed validation that found defects, and `2` for input, configuration, or internal errors that prevented a trustworthy result.
- Validation is implemented, so `validate` reports `0` or `1`. It must still exit `2` rather than report a false pass whenever a trustworthy verdict is impossible.

## Correctness Guardrails
- Prefer a false alarm over clearing a broken schema. Every pass must be defensible against a bundled valid or seeded-defect fixture.
- Keep machine reports byte-identical across runs: no timestamps, random ordering, machine-specific absolute paths, or nondeterministic object traversal. Emit input-relative POSIX paths, sort object keys, sort findings by `(file, JSON pointer, fingerprint ID)`, and write LF line endings.
- Never edit the user's MCP server or ingest real credentials. Fixtures are synthetic and contain no tokens or personal data.
- Claim only that this tool detects documented defect classes in the bundled corpus; never claim official endorsement or guaranteed MCP compliance.
- Required target: at least 95% seeded-defect recall, zero false positives on valid controls, and deterministic reports. See `CONTEXT.md` sections 7, 8, 11, and 15.

## Corpus Independence
- Treat `SPEC.md` as the contract between corpus and detector work.
- A session editing the full fixture corpus or evaluation labels must not inspect or edit detector implementation. A session implementing detectors must not tune behavior against the full fixture corpus.
- Relabeling or weakening a fixture to make a detector pass is a specification change and requires explicit approval.

## Evidence
- Use `PROJECT_EVIDENCE.md` as the primary source for project scope, defect classes, and product claims.
- Consult the full research under `..\automation-engineering-pain-point-research\` only when `PROJECT_EVIDENCE.md` lacks required support. Search the large `report.md` for the relevant section instead of loading it in full.
- The MVP fingerprints are n8n #25964 and #33864. Do not add issue IDs, defect classes, or compliance claims without dated evidence in `PROJECT_EVIDENCE.md` and corresponding fixtures.

## Workflow And Skills
- Follow the staged workflow in `CONTEXT.md` section 13. Start a fresh session when responsibility moves from evidence to specification, specification to implementation, or implementation to review.
- Use `mcp-developer` for MCP contracts, `typescript-pro` for strict TypeScript implementation, `test-master` for the independent corpus/evaluation session, `code-reviewer` for a fresh read-only review, and `debugging-wizard` for isolated failures.
- Use `the-fool` only for evidence or claim audits; use `code-documenter` for README/demo documentation and `devops-engineer` only for CI.
- Do not use the Jira/Confluence planning and execution commands for this repo; no Atlassian MCP is configured. Avoid unrelated architecture, API, security, browser, database, and research skills unless scope changes.
