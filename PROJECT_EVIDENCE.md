# SchemaSentinel Project Evidence

## Provenance

- Source: `../automation-engineering-pain-point-research/report.md`
- Research snapshot: 2026-09-09
- Extracted: 2026-09-10
- Excerpts below are copied verbatim. Line references identify their location in the source at extraction time.

## MVP Evidence Boundary

The MVP is limited to these evidence-backed defect classes:

1. n8n #25964: discarded MCP `$ref`/`$defs`.
2. n8n #33864: typed MCP schemas collapsing to `{type: object}`.

Issues #29353 and #25276 remain supporting evidence for broader AI-tool schema regressions, but are not MVP defect classes until their exact failure modes are separately verified. No other n8n issue is an MVP claim unless it is added here with evidence.

## Defect Evidence And Confidence

Source: `report.md:1020-1024`

> **Direct Evidence:**
> DSEE reports that more than 77% of 901 volunteer leaders rated bureaucracy high or very high and cites 6.5 hours per week for a typical association. Bürgerstiftung Würzburg reports manual Excel/PDF copying before CiviCRM and a roughly EUR 12,000 implementation, with 90% funding. Bentheim County reports reducing school-transport application processing from four to five weeks to less than one hour in a 500-student pilot. DigitalService reports 20 public-administration pilots with 19 municipalities and nine startups in 2026. n8n issue #33864 reports intermittent MCP schemas collapsing to {type: object}, causing arrays and numbers to arrive as strings; #25964 reports discarded $ref/$defs; #29353 reports an AI-tool schema regression; Community requests report missing schema triggers, missing HubSpot triggers, and enterprise IdP bearer-token support.
>
> **Source Quality:**
> High for DSEE, DigitalService, Bundestag and university/public-sector material; medium for vendor case studies and n8n community posts; high for GitHub issue reproduction details but issue resolution status varies. Some 2026 pages are recent and may describe beta or rapidly changing versions.
>
> **Confidence:**
> High for repetitive administrative pain in associations and public administration; high for the existence and reproducibility of the cited n8n defects; medium for willingness to adopt a student-built system; low for generalizing vendor-reported percentage savings.

## Open-Source Gap

Source: `report.md:1050`

> **Open Source Gap:**
> Good. Candidate contributions include an n8n JSON-Schema dereferencing utility and conformance tests for MCP tools (#25964), regression tests and guards for collapsed typed schemas (#33864), a schema contract test suite for AI tools (#29353/#25276), Data Table schema-change detection, or a German association intake template. A standalone sidecar validator/observability proxy is more contribution-sized than an n8n fork.

## Build Guidance

Source: `report.md:1056-1065`

> **Project Size:**
> Medium for a production-like association/nonprofit intake pilot; small for an n8n schema-linter, MCP proxy or community node; large for direct municipal case-management integration or autonomous eligibility decisions.
>
> **Minimum Viable Scope:**
> Choose one partner and one repetitive process, such as grant/reimbursement intake or event registration. Build: a consented or synthetic email/form input; PDF/text extraction; required-field and duplicate checks; a review queue; templated confirmation and missing-document reminders; CSV export; audit log; and a before/after measurement harness. Do not integrate with live tax, student-record or benefits systems in the first pilot.
>
> **Recommended Stack:**
> Self-hosted n8n in Docker for orchestration; Python FastAPI or TypeScript for a typed validation/extraction sidecar; PostgreSQL or SQLite for a case ledger; JSON Schema and Pydantic/Zod contracts; Tesseract or a local OCR service; optional EU-hosted LLM with redaction; MinIO/local encrypted storage for test files; OpenTelemetry-compatible logs and Prometheus-style metrics; Docker Compose; GitHub Actions; and a small React or plain HTML review UI. For n8n upstream work, use TypeScript, Vitest/Jest-style unit tests, fixture-based MCP JSON-RPC tests and release-matrix CI.
>
> **Evaluation Plan:**
> Create 50-200 synthetic or de-identified cases with complete, missing, ambiguous, duplicate, malformed and adversarial documents. Baseline manual timing with 10-20 cases and measure median handling time, completeness precision/recall, field extraction accuracy, duplicate detection, reminder correctness, reviewer override rate, end-to-end latency, workflow failure/retry rate, and cost per case. Require 100% human approval for outputs in the pilot. For n8n bugs, add minimal fixtures that assert schema type/object, nested refs, arrays/numbers, strict output schemas, retry/idempotency behavior and resumed executions across supported versions.
>
> **Contribution Path:**
> For upstream n8n: start with #25964 (MCP $ref/$defs dereferencing), #33864 (typed-parameter schema collapse), #29353 or #25276 (AI tool object-schema regressions), and the related community requests on Data Table schema triggers and HubSpot triggers. First contribution should be a minimal failing fixture, schema contract test, documentation clarification or isolated utility; confirm current state and maintainer guidance before coding. A standalone n8n sidecar can validate tools/list, reject incomplete schemas, dereference refs and emit metrics without forking n8n.

## Next Validation Action

Source: `report.md:1078`

> **Next Validation Action:**
> Within 72 hours, send a one-page offer to three accessible organizations—a university club/Fachschaft, a local nonprofit or Verein, and a university administrative unit—asking for one anonymized sample process and a 30-minute walkthrough. In parallel, reproduce one n8n issue (#25964 or #33864) with a minimal local fixture and record the expected schema, actual schema, version and test result.

## Recommended Project Sequence

Source: `report.md:1082-1085`

> **Recommended Project Tier:**
> One medium project: privacy-preserving association/nonprofit intake and review automation. Pair it with one small project: an n8n MCP/schema reliability validator or upstream-quality test contribution. Defer full municipal decision automation and a general-purpose CRM.
>
> **Project Sequence:**
> 1) Small: schema-linter/proxy with fixtures for refs, typed arrays/numbers and object roots. 2) Small: synthetic form/PDF intake workflow with audit metrics. 3) Medium: partner pilot for one association or university process with shadow mode and human review. 4) Optional large extension: reusable adapters and a second partner, only after baseline improvement and privacy approval are demonstrated.
