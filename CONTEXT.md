# SchemaSentinel — Project Context

> **Tier:** Small (Project 1 of 4)
> **One-liner:** A CLI + library that validates MCP tool schemas and catches documented n8n↔MCP schema defects before they silently break AI-agent tool calls.
> **Status:** Narrowed MVP implementation, review fixes, documentation, sample reports, demo script, and CI are complete. The CLI, library, fixtures, and evaluation harness pass 136 tests and detect 15/15 seeded defects with 0 false positives, 0 unexpected findings, 0 misattributions, deterministic reports, and correct exit/error codes as of 2026-09-11. Recording the demo and publishing the repository remain.
> On 2026-09-10 the Stage 5 review narrowed the contract to JSON Schema 2020-12 and local JSON Pointer `$ref` values, then the implementation was brought into alignment. See `SPEC.md` §1.2 and §3.5 for the rationale and supported boundary.
> **Why first:** Smallest scope, produces reusable fixtures, and doubles as an upstream open-source contribution. Its outputs feed the Large project (AgentAnvil).

---

## 1. Problem
Model Context Protocol (MCP) is becoming a standard way to expose tools to LLM agents, but schema conversion between MCP servers and orchestrators such as n8n is fragile. When a tool's JSON Schema is mangled, the agent calls the tool with invalid arguments and may fail silently. This project provides a lightweight, standalone validator for the documented schema defects in the bundled corpus.

## 2. Evidence (public, dated, cross-referenceable)
The MVP is limited to the defect classes backed by the extracted research in `PROJECT_EVIDENCE.md`.
- **n8n #25964** — `$defs`/`$ref` in MCP tool JSON Schema are discarded.
- **n8n #33864** — typed MCP schemas intermittently collapse to `{ "type": "object" }`, causing arrays and numbers to arrive as strings.

Issues #29353 and #25276 support the existence of broader AI-tool schema regressions, but they are not MVP defect classes until their exact failure modes are separately verified. Do not add other issue IDs to product claims or fixtures without adding dated evidence to `PROJECT_EVIDENCE.md`.

## 3. Users & job-to-be-done
- **Users:** automation engineers and agencies building AI agents on n8n/MCP; MCP server authors; anyone self-hosting agent tooling.
- **Job:** "Before I trust this MCP server in a workflow, tell me whether its tool schemas contain the documented defect classes and how to fix them."

## 4. Scope
**MVP (must have)**
1. Ingest an MCP `tools/list` response (JSON file or live stdio/HTTP endpoint — start with file).
2. Validate each tool `inputSchema` as **JSON Schema 2020-12 only**: resolve **local JSON Pointer** `$ref`/`$defs` and detect evidence-backed ref loss and typed-schema collapse. A declared draft-07, 2019-09 or other dialect, an external reference, and an anchor or dynamic reference each exit `2` rather than receiving a verdict.
3. Detect only the two MVP failure fingerprints from §2, through exactly three rules: `SS-REF-001`, `SS-REF-002`, `SS-TYPE-001`.
4. Emit deterministic human-readable and JSON reports with the exit-code contract defined in `SPEC.md`.
5. Ship ~15 synthetic detection fixtures (valid + each broken pattern) mirroring the issues in §2, plus a separate error corpus that pins the supported boundary and is excluded from recall.

**In scope (nice to have):** GitHub Action wrapper.
**Out of scope:** auth validation; `structuredContent` handling; node-name leakage; fixing n8n itself; a GUI; supporting every MCP transport on day one; real credentials; **broad JSON Schema conformance** — the corpus pins the documented defect classes and the supported boundary, not a compliance suite.

## 5. Tech stack
- **TypeScript** (locked): Node + a CLI framework (Commander or oclif), `ajv` for JSON Schema validation, a `$ref`/`$defs` resolver, `vitest` for tests. Publishable to npm; close to the n8n ecosystem (potential path to a community node).
- Docker optional; the tool is a CLI, not a service.

## 6. Data & APIs (interview-free)
- **Inputs:** synthetic `tools/list` JSON fixtures authored from the public issues; optionally a locally run reference MCP server.
- **No** real tokens, no personal data, no scraping. Everything reproducible from public artifacts.

## 7. Evaluation & metrics
- **Corpus:** seeded-defect set (each fixture labels the defect it contains) + valid controls.
- **Metrics:** seeded-defect detection recall, false-positive rate on valid schemas, deterministic output across runs.
- **Targets:** ≥95% detection of seeded defects, 0 false positives on the valid controls, byte-identical report on re-run.

## 8. Correctness boundary (safety analogue)
A validator must **never report a schema as safe when it is broken**. Prefer false alarms over false clears; every "pass" must be defensible against a fixture. No autonomous edits to the user's MCP server.

This is also the reason the supported surface is narrow. Every construct outside `SPEC.md` §3.4 and §3.5 — a foreign dialect, an external `$ref`, an anchor, a dynamic reference, a nested `$id` — compiles cleanly under Ajv, so tolerating it would produce a confident pass on a schema the tool never actually followed. Exiting `2` with "not analyzed" is the only honest outcome, and it costs coverage rather than trust.

## 9. Portfolio signal
- **Employer signal:** JSON Schema mastery, protocol conformance testing, CLI/DX design, CI integration, deterministic tooling, and reading real production bug reports.
- **Job alignment:** maps to German postings requiring n8n, MCP/agents, APIs, testing, and Python/TypeScript.
- **Demo artifacts:** README with before/after, 2-minute video running the CLI on a broken server, sample JSON report, GitHub Action badge, links to any upstream issues/PRs.

## 10. Open-source / contribution path
- Publish standalone repo with fixtures.
- Optionally contribute a failing test or fix to n8n issues in §2 (start by commenting a clean reproduction on #25964).
- A merged PR here is high-signal social proof.

## 11. Risks & claim discipline
- n8n internals and the MCP spec version will drift — pin versions and date fixtures and evidence.
- Do **not** claim official endorsement or "guarantees compliance." Claim: "detects the documented defect classes in the bundled corpus."
- Keep scope small; resist turning it into a full MCP client.

## 12. Interview-free validation route
1. Reproduce each evidence-backed §2 defect class as a fixture.
2. Run SchemaSentinel; confirm it flags each one with actionable output.
3. (Optional real-world signal) post the reproduction on the relevant GitHub issue — engagement, not an interview.

## 13. Implementation workflow

| Stage | Deliverable | Skill | Model | Session |
| --- | --- | --- | --- | --- |
| 1. Evidence | `PROJECT_EVIDENCE.md` and evidence boundary | `the-fool` | Strong/slow | Fresh; complete |
| 2. Specification | `SPEC.md`: detector rules, fixture manifest, CLI/report contracts | `mcp-developer` | Strong/slow | Fresh |
| 3. Corpus | Synthetic fixtures and evaluation harness | `test-master` | Fast | Dedicated; independent from detector work |
| 4. Implementation | Ingest, resolver, detectors, deterministic reports, CLI | `mcp-developer` + `typescript-pro` | Strong/slow | Dedicated |
| 5. Quality | Evaluation, review, debugging, docs, and CI | `code-reviewer`, then task-specific skills | Strong for review; fast for mechanical work | Fresh review session |

Implementation loop within stage 4: select one `SPEC.md` rule → add a failing unit test → implement the smallest detector change → run `npm.cmd run check` → inspect the evaluation delta → commit one defect class at a time.

The corpus session must not read detector implementation. The implementation session must not tune rules against the full corpus. `SPEC.md` is their shared contract.

Stage 5 followed the same split: the narrowing was specified independently, then implemented and reviewed in separate sessions. The narrowed implementation, regression fixes, documentation artifacts, and CI are complete; only recording the demo and publishing remain.

## 14. Cross-references (verify claims here)
- Primary project evidence: `PROJECT_EVIDENCE.md`
- Full source report, escalation only: `..\automation-engineering-pain-point-research\report.md`
- Supporting MCP research: `..\automation-engineering-pain-point-research\results\Automation_platforms_and_MCP.json`
- Supporting n8n research: `..\automation-engineering-pain-point-research\results\Institutions_and_n8n_community.json`
- Research outline: `..\automation-engineering-pain-point-research\outline.yaml`

## 15. Definition of done
- CLI runs on a broken and a valid MCP fixture set with correct pass/fail.
- ≥95% seeded-defect detection, 0 false positives on controls, deterministic output.
- README + 2-min demo + sample report published; repo public.
- (Stretch) one upstream issue reproduction or PR linked.
