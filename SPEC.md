# SchemaSentinel Specification

> **Status:** Implemented narrowed MVP contract. The fixture corpus and evaluation harness live under `fixtures/` and `eval/`; ingestion, dialect handling, resolution, detectors, reports and the CLI live under `src/`. Verified on 2026-09-11 with 136 passing tests and `npm run eval`: 15/15 seeded findings detected, 0 false positives, 0 unexpected findings, 0 misattributions, deterministic reports, and correct exit/error codes.
> **Narrowing note (2026-09-10):** this revision restricts the MVP to **JSON Schema 2020-12 only** and to **local JSON Pointer `$ref` values only**, adds `contentSchema` traversal, makes an empty `$defs` stop suppressing `SS-TYPE-001`, and replaces the Stage 4 `SS-E-INTERNAL` compilability branch with `SS-E-SCHEMA-INVALID`. The implementation now conforms to this boundary.
> **Owns:** detector rules, input/dialect handling, fixture manifest, CLI and report contracts.
> **Consumers:** the corpus session (`test-master`) and the implementation session (`mcp-developer` + `typescript-pro`), which must not read each other's work. This file is their only shared contract.
> **Authority:** `PROJECT_EVIDENCE.md` bounds every claim. `CONTEXT.md` bounds scope. Where this file conflicts with either, they win.

---

## 1. Pinned Versions

Everything below was verified on 2026-09-10 against the installed toolchain and the live MCP specification. Re-verify and re-date before changing any pin.

| Pin | Value | How it was verified |
| --- | --- | --- |
| MCP protocol revision | `2026-07-28` | MCP spec `server/tools` and `basic/index` |
| Supported JSON Schema dialect | `2020-12`, and only `2020-12` | MCP spec `basic/index`: "MCP defaults to JSON Schema 2020-12 when no dialect is specified"; implementations must support 2020-12 and handle unsupported dialects with an error |
| Missing `$schema` | Treated as `2020-12` | Same clause: 2020-12 is the default dialect |
| Any other declared dialect | `SS-E-DIALECT`, exit `2` | Graceful handling of an unsupported dialect is what the spec requires; a validator that silently reinterprets a declared dialect is not graceful |
| Validator | `ajv@8.20.0` via `ajv/dist/2020.js` -> `Ajv2020` | `node_modules/ajv/package.json` |
| Node | `>=20` (developed on v24.14.0) | `package.json` engines |

### 1.1 A single Ajv entry point (verified, not assumed)

`ajv` has no `exports` map, so the deep import needs the file extension under `NodeNext`. Ajv ships as CJS; under ESM the constructor may arrive as `mod.default.default`. Implementations must normalize with `const Ctor = Mod.default ?? Mod`.

| Supported dialect | Import | Definitions container |
| --- | --- | --- |
| 2020-12 (declared or defaulted) | `ajv/dist/2020.js` -> `Ajv2020` | `$defs` |

There is exactly one entry point because there is exactly one supported dialect. `ajv/dist/2019.js` and the draft-07 default export are deliberately unused.

Four behaviors were confirmed empirically and are load-bearing:

1. `new Ajv2020().compile()` on a schema declaring `"$schema": "http://json-schema.org/draft-07/schema#"` throws `no schema with key or ref "http://json-schema.org/draft-07/schema#"`. A declared foreign dialect therefore cannot be validated by the pinned entry point at all, which is why §3.4 makes it an error rather than a best-effort reinterpretation.
2. `new Ajv2020().compile()` on a dangling `$ref` throws `MissingRefError: can't resolve reference #/$defs/Missing from id #` — it aborts at the **first** unresolved reference.
3. `new Ajv2020().compile()` on `{"properties":{"payload":{"type":"string","contentMediaType":"application/json","contentSchema":{"$ref":"#/$defs/Missing"}}}}` returns **without error**: Ajv does not evaluate `contentSchema`, so a reference lost inside it is invisible to the gate. Traversal must cover `contentSchema` itself (§4.5).
4. `new Ajv2020().compile()` on the draft-07 tuple form `{"items":[{...},{...}]}` throws `schema is invalid: data/properties/pair/items must be object,boolean`. Draft-07-shaped syntax surviving in a 2020-12 document is an invalid schema, reported by §3.7.

Consequence for the architecture: **Ajv is a compilability gate only, never the finding enumerator.** SchemaSentinel walks the schema itself to enumerate every finding deterministically, because point 2 surfaces one defect and hides the rest and point 3 surfaces none at all. This also keeps output stable if Ajv changes its message text.

### 1.2 Why one dialect

Supporting three dialects bought no detection power and cost trust surface. The two MVP fingerprints (§2) are dialect-independent — a discarded `$defs` block and a collapsed root look the same in every draft — while multi-dialect support added a per-tool `input.dialect` variable, two extra Ajv instances, a keyword-selection rule, and a reporting mode in which one file mixed dialects. None of that is backed by evidence in `PROJECT_EVIDENCE.md`.

Narrowing to the MCP default is also the conservative direction under `CONTEXT.md` §8: a declared draft-07 or 2019-09 schema now exits `2` with "not analyzed" instead of being analyzed under rules it did not declare. Fewer inputs get a verdict; every verdict that is issued is defensible.

---

## 2. Evidence Boundary

The MVP detects exactly two fingerprint families through exactly three rules. Adding a fourth rule or a third family requires new dated evidence in `PROJECT_EVIDENCE.md` plus fixtures.

| Family | Rules | Evidence | Observable post-conversion symptom |
| --- | --- | --- | --- |
| `SS-REF` | `SS-REF-001`, `SS-REF-002` | n8n #25964 | `$ref`/`$defs` discarded, so type information behind references is gone |
| `SS-TYPE` | `SS-TYPE-001` | n8n #33864 | The root schema collapses to `{"type":"object"}`, erasing the declared parameter set |

### 2.1 Valid JSON Schema is not evidence of corruption

This is the governing principle for every rule in §4, and the reason the SS-TYPE family is deliberately narrow.

A permissive schema and a corrupted schema can look identical in isolation. A property with no `type`, an array with no `items`, and an object with no `properties` are all legal JSON Schema that a competent author may write on purpose. Flagging them asserts a conversion defect that the artifact does not prove, which manufactures false positives on valid controls and violates the zero-false-positive target in `CONTEXT.md` §7.

A form qualifies as a fingerprint only when direct evidence ties it to an n8n conversion defect. Absent that, it is deferred (§4.3), not merely downgraded in severity.

Two consequences follow, both intentional:

- **Type widening is not detectable.** A `number` rewritten as `string` leaves no trace in a single post-conversion artifact. Do not add heuristics for it.
- **Partial collapse is not detectable.** Only the total root collapse in #33864 is evidence-backed. A nested object that lost its `properties` is indistinguishable from an intentionally open object.

The correctness boundary in `CONTEXT.md` §8 ("prefer false alarms over false clears") governs *unresolvable* inputs, which exit `2` under §3.3. It does not license guessing that valid JSON Schema is broken.

Dialect breadth and reference-resolution breadth are not evidence either. Both are trust surface, and §1.2 and §3.5 spend them down rather than up.

Out of scope per `CONTEXT.md` §4: `structuredContent`/`outputSchema`, auth and resource indicators, tool-name leakage, live transports, GUI, and modifying n8n or the user's server.

---

## 3. Input Contract

### 3.1 Accepted shapes

The CLI accepts one UTF-8 JSON file in any of these shapes and normalizes it to `{ "tools": [...] }`:

1. JSON-RPC envelope: `{"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}`
2. Bare result object: `{"tools":[...]}`
3. Bare tool array: `[...]`

**Pointer base:** after normalization, every JSON Pointer in a report is rooted at the normalized document, e.g. `/tools/0/inputSchema/properties/location`. The pointer must not vary with the input envelope shape; this is a determinism requirement, not a convenience.

Note the two distinct roots, which must not be confused. A `$ref` inside a tool is resolved **relative to that tool's `inputSchema`** (§3.6); a pointer **emitted in a report** is rooted at the normalized document.

### 3.2 Partial pages

If `nextCursor` is present, the file is one page of a paginated `tools/list`. Validation proceeds over the present page, the JSON report sets `input.partialPage: true`, and the human report prints a caveat line. A clean result on a partial page must never be described as a clean server.

### 3.3 Conditions that produce exit 2

These prevent a trustworthy verdict. They are **errors, not findings**, and must never be counted as detections.

| Code | Condition |
| --- | --- |
| `SS-E-IO` | File missing or unreadable |
| `SS-E-PARSE` | Not valid JSON |
| `SS-E-SHAPE` | None of the three accepted shapes; or a JSON-RPC `error` envelope; or a tool missing `name`/`inputSchema` |
| `SS-E-SCHEMA-TYPE` | `inputSchema` is present but is not a JSON object |
| `SS-E-DIALECT` | `$schema` declares any dialect other than 2020-12, or is not a string (§3.4) |
| `SS-E-REF-EXTERNAL` | A `$ref` targets another document (§3.5) and cannot be resolved offline |
| `SS-E-REF-UNSUPPORTED` | A reference construct outside the supported local-pointer subset is present (§3.5) |
| `SS-E-SCHEMA-INVALID` | The tool schema is still not a valid 2020-12 schema after every reported dangling reference is neutralized (§3.7) |
| `SS-E-INTERNAL` | An unexpected implementation failure (§3.7) |

`SS-E-REF-EXTERNAL` and `SS-E-REF-UNSUPPORTED` are deliberately errors rather than defect classes: `CONTEXT.md` §4 permits only two fingerprints, and a reference the tool cannot follow means the verdict cannot be trusted in either direction.

### 3.4 Dialect handling

- `$schema` absent anywhere in the tool schema -> the tool is validated as 2020-12.
- `$schema` present at the tool's `inputSchema` root and equal to the 2020-12 dialect URI -> validated as 2020-12. Both the `http` and `https` spellings and an optional trailing `#` are accepted, i.e. `https://json-schema.org/draft/2020-12/schema` and `https://json-schema.org/draft/2020-12/schema#`.
- `$schema` present with any other value, including `http://json-schema.org/draft-07/schema#`, `https://json-schema.org/draft/2019-09/schema`, `http://json-schema.org/draft-06/schema#`, or a non-string -> `SS-E-DIALECT`, pointer `/tools/<i>/inputSchema/$schema`.
- `$schema` in a **subschema** is not a dialect declaration in 2020-12 outside of an embedded resource; embedded resources require `$id`, which is unsupported (§3.5), so this cannot arise in an accepted input.

`input.dialect` in the report is the constant string `"2020-12"` (§6.1). It is kept so the report shape does not vary, not because it varies.

### 3.5 Supported reference forms

Only local JSON Pointer references are supported.

| `$ref` value | Handling |
| --- | --- |
| `"#"` | Supported — the tool's `inputSchema` root |
| `"#/..."` | Supported — an RFC 6901 pointer rooted at the tool's `inputSchema` |
| `""` | `SS-E-REF-UNSUPPORTED` — an empty reference resolves against the current base URI, which depends on `$id` |
| `"#name"` (plain-name fragment) | `SS-E-REF-UNSUPPORTED` — an anchor reference |
| Any other non-empty string | `SS-E-REF-EXTERNAL` — absolute URI, `file:`, `urn:`, or a relative document reference such as `shared.json#/$defs/T` |
| A non-string value | `SS-E-REF-UNSUPPORTED` — not interpretable as a reference |

These keywords are unsupported wherever they appear inside a tool schema, and each produces `SS-E-REF-UNSUPPORTED` at its own pointer:

| Keyword | Why unsupported |
| --- | --- |
| `$anchor`, `$dynamicAnchor`, `$recursiveAnchor` | Declare plain-name targets that the supported pointer subset cannot address |
| `$dynamicRef`, `$recursiveRef` | Resolve against a dynamic scope built at validation time, not against the document tree |
| `$id` anywhere other than the tool's `inputSchema` root | Changes the base URI mid-document, so a pointer no longer means what its text says |

A `$id` **at the tool's `inputSchema` root** is accepted and ignored: because only `#` and `#/...` are supported, the base URI never affects resolution.

Nothing here is a silent tolerance. Ajv compiles all of these constructs without complaint (verified 2026-09-10), so a validator that merely handed them to Ajv would report a clean pass on a schema it never actually followed. Exiting `2` is the only outcome consistent with `CONTEXT.md` §8.

### 3.6 Reference resolution

- Resolve `#` to the tool's `inputSchema` and `#/...` with RFC 6901 semantics, including `~0`/`~1` unescaping.
- Resolution is **structural**, following the pointer path through the tool schema. The pointer does not have to land inside a recognized keyword: `#/definitions/Location` resolves in a 2020-12 document if that node exists, exactly as Ajv resolves it, even though `definitions` is not a 2020-12 keyword. A `$ref` is dangling only when the pointer's target node is absent or is not a schema (not an object and not a boolean).
- **Cycles are legal.** Track visited pointers and stop; a cycle is never a finding.
- Resolution must not mutate the input document. Findings report the pointer of the original `$ref` site, not the expanded location.

### 3.7 Schema validity gate and internal errors

After the detectors have enumerated their findings for a tool, SchemaSentinel builds a **neutralized copy** of that tool's `inputSchema` in which every `$ref` object reported as `SS-REF-001` is replaced by the always-true schema `true`, and compiles the copy with `Ajv2020`.

- The copy compiles -> the findings stand and the run completes with exit `0` or `1`.
- The copy still throws -> exit `2` with `SS-E-SCHEMA-INVALID`, pointer `/tools/<i>/inputSchema`. The artifact is not a valid 2020-12 schema for a reason the detectors did not explain, so neither the pass nor the finding list can be trusted.

Neutralization applies to the copy only. The input document is never mutated and findings keep their original pointers.

The gate checks schema **validity**, not style. Unknown keywords, unknown formats and vendor extensions such as `x-n8n-origin` are legal JSON Schema annotations and must never raise `SS-E-SCHEMA-INVALID`; Ajv's strict mode must be disabled for the gate so that `strict mode: unknown keyword` cannot become a verdict. Only a schema the 2020-12 meta-schema rejects, or one Ajv cannot compile for a reason no finding explains, reaches this code.

This replaces the Stage 4 behavior in which an unexplained compilation failure was reported as `SS-E-INTERNAL`. The distinction is now explicit: a reference we already reported is an **explained** compilation failure and stays a finding; anything else is an **unexplained** one and stays an error.

`SS-E-INTERNAL` is reserved for unexpected implementation failures — anything thrown that is not a `ValidationInputError`. No input is specified to produce it and it has no fixture. If a corpus fixture ever produces `SS-E-INTERNAL`, that is a bug in `src/`, not a label to change.

### 3.8 Precedence

Several exit-2 conditions can hold at once. The reported code must not depend on traversal order, so the phases below are evaluated in order and the first phase that fires wins.

1. `SS-E-IO`, then `SS-E-PARSE` — whole-file conditions.
2. `SS-E-SHAPE`, then `SS-E-SCHEMA-TYPE` — normalization, lowest tool index first.
3. `SS-E-DIALECT` — lowest tool index first.
4. `SS-E-REF-EXTERNAL`, then `SS-E-REF-UNSUPPORTED` — lowest tool index first; within one tool, the smallest JSON Pointer compared as an ASCII string.
5. Detection (§4).
6. `SS-E-SCHEMA-INVALID` — lowest tool index first.
7. `SS-E-INTERNAL` — only if an unexpected failure escapes any phase.

---

## 4. Detector Rules

Severity is `error` for all MVP rules; the MVP ships no severity gating flags. Each rule fires at most once per JSON Pointer.

### 4.1 Family `SS-REF` — reference loss (n8n #25964)

**`SS-REF-001` — dangling local reference**
Fires when a supported local `$ref` (§3.5) resolves to no node in the tool schema, or resolves to a node that is not a schema (not an object or boolean).
Pointer: the `$ref` site.
Message: names the unresolved pointer.
Remediation: restore the `$defs` block, or inline the referenced subschema before conversion.

**`SS-REF-002` — orphan definitions container**
Fires when the tool's `inputSchema` contains a **non-empty** `$defs` and **zero** `$ref` occurrences anywhere in that tool's `inputSchema`.
Rationale: #25964 loses references in both directions. Dangling refs mean the definitions were dropped; surviving definitions with no references mean the reference sites were stripped.
Pointer: `/tools/<i>/inputSchema/$defs`.
`$defs` is the only container this rule inspects. A legacy `definitions` object in a 2020-12 document asserts nothing and declares nothing, so its presence is not evidence of anything (§4.2.1).

### 4.2 Family `SS-TYPE` — root schema collapse (n8n #33864)

This family contains exactly one active rule. #33864 documents the schema collapsing to `{"type":"object"}`; it does not document partial or nested degradation, so nothing beyond the total root collapse is claimed.

**`SS-TYPE-001` — collapsed root schema**
Fires when a tool's `inputSchema` has `"type": "object"` (or no `type` at all) and carries **no constraining keyword**.
Pointer: the tool's `inputSchema`.
Remediation: restore the declared parameter set, or declare the empty parameter set explicitly with `properties: {}` or `additionalProperties: false`.

**Constraining keywords** — any one of these means the schema says something about its input, so the rule does not fire:

| Group | Keywords |
| --- | --- |
| Property structure | `properties`, `additionalProperties`, `patternProperties`, `propertyNames`, `unevaluatedProperties` |
| Presence and size | `required`, `minProperties`, `maxProperties` |
| Conditional presence | `dependentRequired`, `dependentSchemas` |
| Value enumeration | `enum`, `const` |
| Composition and reference | `$ref`, `allOf`, `anyOf`, `oneOf`, `not`, `if` |
| Array shape | `items`, `prefixItems`, `contains` |
| Definitions container | `$defs`, **only when it is a non-empty object** |

This table is closed. It is a guard list, not a JSON Schema keyword census, and every entry is pinned by a control fixture (§7.1 fixture 6). Adding or removing an entry requires adding or moving that control.

**Non-constraining keywords** — these never suppress the rule, because they carry no assertion about the input: `$schema`, `$id`, `$comment`, `title`, `description`, `default`, `examples`, `deprecated`, `readOnly`, `writeOnly`, `contentEncoding`, `contentMediaType`, `contentSchema`, `definitions`, and an **empty** `$defs`.

`$defs` guards the rule for **attribution** reasons rather than validation reasons. A definitions container asserts nothing about the input, so on validation grounds alone it would not suppress `SS-TYPE-001`. It suppresses the rule anyway because a root holding surviving definitions is the signature of reference loss (#25964, `SS-REF-002`), not of the root collapse in #33864. Firing both rules would attribute one observable defect to two evidence families and count it twice in recall. See §4.4.

That argument only holds while the container actually holds something. `{"type":"object","$defs":{}}` has no surviving definitions to attribute to #25964, `SS-REF-002` does not fire on it, and the root still declares no parameter set — so it is a `SS-TYPE-001` collapse and the guard must not apply. An unconditional guard here was a silent hole: a collapsed root escaped detection because an empty container survived beside it.

Confirmed non-findings, taken from the MCP specification's own parameterless examples and from ordinary valid authorship:

- `{"type":"object","additionalProperties":false}` — the canonical zero-argument tool
- `{"type":"object","properties":{}}` — an explicit empty parameter set
- `{"type":"object","required":["a"]}` — constrains presence without listing properties
- `{"type":"object","minProperties":1}` — constrains size only
- `{"type":"object","$defs":{"T":{"type":"string"}}}` — reported as `SS-REF-002` only

#### 4.2.1 `$defs`, `definitions` and `contentSchema`

Three keywords behave differently under the narrowed contract and are easy to conflate. This table is normative.

| Keyword | Traversed for `$ref` (§4.5) | Suppresses `SS-TYPE-001` | Container for `SS-REF-002` | Reachable by a `#/...` pointer (§3.6) |
| --- | --- | --- | --- | --- |
| `$defs` | yes | only when non-empty | yes, when non-empty | yes |
| `definitions` | no | no | no | yes |
| `contentSchema` | yes | no | no | yes |

`definitions` is not a 2020-12 keyword, so its members are not schemas and a `$ref` written inside it is not a reference site. It remains addressable by pointer because RFC 6901 addresses the document tree, not the vocabulary — which is exactly what Ajv does (verified 2026-09-10). `contentSchema` is the mirror image: it is a real 2020-12 keyword holding a real schema, so references inside it are real reference sites, but it is annotation-only and asserts nothing about the input.

### 4.3 Deferred rules

These IDs are **reserved and unimplemented**. Do not reuse the numbers; activating one is a specification change requiring dated evidence in `PROJECT_EVIDENCE.md` that n8n conversion actually produces the form, plus fixtures.

| Reserved ID | Form | Why deferred |
| --- | --- | --- |
| `SS-TYPE-002` | Nested object with no `properties` | Valid JSON Schema for an intentionally open object; #33864 documents only root collapse |
| `SS-TYPE-003` | Property schema with no `type` | Valid JSON Schema for an intentionally permissive value; no evidence links it to conversion |
| `SS-TYPE-004` | `"type": "array"` with no `items` | Valid JSON Schema for a heterogeneous array; the "arrays arrive as strings" symptom in #33864 is a runtime observation, not this static form |

Fixtures 7 and 8 in §7.1 are valid controls containing exactly these three forms. They must produce **zero** findings, which turns each deferral into an enforced test rather than a comment.

### 4.4 Rule interaction and attribution

**One observable defect maps to exactly one evidence family.** Each finding is a claim that a specific documented n8n defect occurred, so the same corruption must not be reported under both #25964 and #33864. Double-reporting would misattribute a reference-loss defect to type-collapse evidence that does not document it, and would count one defect twice in recall.

The single overlap in the MVP is a root holding surviving definitions with no references. It is attributed to `SS-REF-002` alone; the non-empty `$defs` guard in §4.2 suppresses `SS-TYPE-001` there. An empty `$defs` is not that overlap and is attributed to `SS-TYPE-001` alone.

Beyond that overlap the rules remain independent, and one tool may still produce several findings:

- Several dangling references in one schema each yield their own `SS-REF-001` at their own pointer.
- Distinct tools in one file are evaluated separately and their findings are attributed per tool.

Fixture labels in §7.3 must list every expected finding, or recall in §8 is measured against an incomplete key.

### 4.5 Traversal

`$ref` discovery must be total across the 2020-12 subschema keywords. Walk:

| Shape | Keywords |
| --- | --- |
| A schema | `additionalProperties`, `propertyNames`, `unevaluatedProperties`, `items`, `contains`, `not`, `if`, `then`, `else`, `contentSchema` |
| A map of schemas | `properties`, `patternProperties`, `dependentSchemas`, `$defs` |
| An array of schemas | `allOf`, `anyOf`, `oneOf`, `prefixItems` |

`contentSchema` is in this list because Ajv does not compile it (§1.1 point 3): a reference lost inside `contentSchema` produces no Ajv error and no `SS-E-SCHEMA-INVALID`, so only traversal can find it. It is traversed but never constraining (§4.2.1).

A keyword is traversed only when its value has the shape the table requires. A mis-shaped value — most importantly the draft-07 tuple form `"items": [ ... ]` in a 2020-12 document — is **not** traversed and **not** guessed at; the §3.7 gate reports it as `SS-E-SCHEMA-INVALID`. `definitions` is not traversed at all (§4.2.1).

A dangling `$ref` nested three levels deep is still `SS-REF-001`, and `SS-REF-002` requires counting `$ref` occurrences across the whole tool schema, including inside `contentSchema` and `$defs`.

`SS-TYPE-001` is evaluated **only** at the tool's `inputSchema` root and is never applied to a nested node.

Traversal order does not affect output because findings are sorted before emission (§6.3).

---

## 5. CLI Contract

```
schema-sentinel validate <file> [--format human|json] [--out <path>]
```

| Option | Default | Behavior |
| --- | --- | --- |
| `--format` | `human` | `json` emits only the §6 document on stdout, making it pipeable |
| `--out <path>` | none | Writes the report to a file; stdout then carries only the human summary |

| Exit | Meaning |
| --- | --- |
| `0` | Validation completed; zero findings |
| `1` | Validation completed; at least one finding |
| `2` | Input, configuration, or internal error; no trustworthy verdict |

Rules:
- Reports go to stdout; diagnostics and error text go to stderr.
- Exit `2` must never emit a findings report that could be read as a pass.
- Every §3.3 code, including `SS-E-SCHEMA-INVALID` and `SS-E-INTERNAL`, exits `2` and emits the §6.2 error report.

---

## 6. Report Contract

### 6.1 JSON report

```json
{
  "findings": [
    {
      "evidence": "n8n#25964",
      "id": "SS-REF-001",
      "message": "$ref '#/$defs/Location' does not resolve within the document.",
      "pointer": "/tools/0/inputSchema/properties/location/$ref",
      "remediation": "Restore the $defs block or inline the referenced subschema.",
      "rule": "ref.dangling",
      "severity": "error",
      "toolIndex": 0,
      "toolName": "get_weather"
    }
  ],
  "input": {
    "dialect": "2020-12",
    "partialPage": false,
    "path": "fixtures/defect/ref-dangling-defs-removed.json",
    "toolCount": 1
  },
  "reportVersion": 1,
  "summary": {
    "byFingerprint": { "n8n#25964": 1, "n8n#33864": 0 },
    "findingCount": 1
  },
  "tool": { "name": "schema-sentinel", "version": "0.1.0" }
}
```

`input.dialect` is always `"2020-12"` (§3.4). There is no per-tool dialect field and no mixed-dialect reporting mode.

### 6.2 Error report (exit 2)

```json
{
  "error": { "code": "SS-E-DIALECT", "message": "...", "pointer": "/tools/0/inputSchema/$schema" },
  "input": { "path": "fixtures/error/dialect-unknown.json" },
  "reportVersion": 1,
  "tool": { "name": "schema-sentinel", "version": "0.1.0" }
}
```

`error.pointer` is omitted when the condition is not attributable to a location (`SS-E-IO`, `SS-E-PARSE`, `SS-E-INTERNAL`).

### 6.3 Determinism rules

These are contractual; a byte-identical re-run is a Definition-of-Done item.

1. Sort findings by `(input.path, pointer, id)`, compared as ASCII strings.
2. Serialize every object with keys sorted ASCII-ascending at every depth, 2-space indent, one trailing newline, LF endings.
3. `input.path` is POSIX-separated and relative to the current working directory; if the input is outside the CWD, emit only its basename. Never emit an absolute machine path.
4. No timestamps, durations, hostnames, usernames, locale-dependent formatting, or PRNG anywhere in a report.
5. `summary.byFingerprint` always lists both fingerprint keys, including zero counts, so the shape never varies.
6. Messages are static templates plus values taken from the input. Never interpolate an Ajv message; Ajv wording is not a stable contract. This matters most for `SS-E-SCHEMA-INVALID`, whose underlying Ajv text is explicitly not part of this contract.
7. The human format is also fully deterministic and derived from the same sorted finding list.

---

## 7. Fixture Manifest

The corpus session authors these files; the implementation session must not tune rules against them. Paths are relative to `fixtures/`.

### 7.1 Detection corpus (16 files, drives the metrics)

Eight valid controls to eight defect fixtures is deliberate. With only three evidence-backed rules, the harder claim is the absence of false positives on legal schemas, so the corpus weights controls accordingly. The corpus is held at roughly this size on purpose: it exists to pin the documented defect classes and the supported boundary, not to approximate a JSON Schema compliance suite.

| # | Path | Kind | Exit | Expected |
| --- | --- | --- | --- | --- |
| 1 | `valid/minimal-typed.json` | valid | 0 | none — ordinary typed parameters |
| 2 | `valid/parameterless-additional-false.json` | valid | 0 | none — canonical zero-argument tool |
| 3 | `valid/empty-properties.json` | valid | 0 | none — explicit empty parameter set |
| 4 | `valid/resolvable-defs-2020.json` | valid | 0 | none — two tools: `$ref` + `$defs` resolve, and a `$ref` whose only occurrence is inside `contentSchema`. The second tool is the `SS-REF-002` control for §4.5: if `contentSchema` is not traversed, its `$defs` looks orphaned and a false positive appears |
| 5 | `valid/resolvable-legacy-definitions.json` | valid | 0 | none — a 2020-12 tool whose `$ref` points into a legacy `definitions` object; pins that resolution is structural (§3.6) and that `definitions` is neither a `SS-REF-002` container nor a `SS-TYPE-001` guard (§4.2.1) |
| 6 | `valid/root-constraint-guards.json` | valid | 0 | none — one tool per guard keyword: `required`, `minProperties`, `maxProperties`, `propertyNames`, `dependentRequired`, `dependentSchemas`, `unevaluatedProperties` |
| 7 | `valid/deferred-forms-nested.json` | valid | 0 | none — nested object without `properties`, and a property without `type`; enforces `SS-TYPE-002`/`SS-TYPE-003` deferral |
| 8 | `valid/deferred-forms-array.json` | valid | 0 | none — `"type":"array"` without `items`, including nested; enforces `SS-TYPE-004` deferral |
| 9 | `defect/ref-dangling-defs-removed.json` | defect | 1 | `SS-REF-001` — baseline #25964: `$defs` deleted, `$ref` survives |
| 10 | `defect/ref-dangling-nested.json` | defect | 1 | `SS-REF-001` at depth, inside array `items` |
| 11 | `defect/ref-dangling-multiple.json` | defect | 1 | `SS-REF-001` x3 in one tool; proves enumeration does not stop at the first unresolved ref |
| 12 | `defect/ref-dangling-content-schema.json` | defect | 1 | `SS-REF-001` inside `contentSchema`; Ajv compiles this input without error (§1.1 point 3), so a miss here means traversal, not the gate, is the thing that is broken |
| 13 | `defect/ref-orphan-defs.json` | defect | 1 | `SS-REF-002` **only** — populated `$defs`, zero `$ref`, bare `{"type":"object"}` root; a `SS-TYPE-001` here means the §4.2 definitions guard is missing |
| 14 | `defect/type-root-collapsed.json` | defect | 1 | `SS-TYPE-001` x2 — one bare `{"type":"object"}`, one carrying only `title`/`description`; neither tool declares `$defs` |
| 15 | `defect/type-empty-defs.json` | defect | 1 | `SS-TYPE-001` **only** — `{"type":"object","$defs":{}}`; an empty container neither suppresses the collapse nor raises `SS-REF-002` (§4.2). Zero findings here means the guard is still unconditional |
| 16 | `defect/mixed-multi-tool.json` | defect | 1 | both families across several tools, each defect attributed to one family only; pins per-tool attribution, cross-family ordering, and sort stability |

Coverage: `SS-REF-001` in 9, 10, 11, 12, 16; `SS-REF-002` in 13, 16; `SS-TYPE-001` in 14, 15, 16. Total expected findings: 15.

Fixtures 4, 6, 7 and 8 exist specifically to fail loudly if a deferred rule is implemented, a guard keyword is forgotten, or `contentSchema` is dropped from traversal. Fixtures 13 and 15 are the attribution controls: they are the two inputs where both families could plausibly fire, and exactly one family is correct in each.

### 7.2 Error corpus (14 files, excluded from recall)

All exit `2` and are scored only on exit code and error code.

| Path | Code | Pins |
| --- | --- | --- |
| `error/malformed.json` | `SS-E-PARSE` | Truncated JSON |
| `error/not-tools-list.json` | `SS-E-SHAPE` | None of the three accepted shapes |
| `error/inputschema-not-object.json` | `SS-E-SCHEMA-TYPE` | `inputSchema` present but a string |
| `error/dialect-draft-07.json` | `SS-E-DIALECT` | A declared draft-07 dialect is no longer analyzed (§1.2) |
| `error/dialect-2019-09.json` | `SS-E-DIALECT` | A declared 2019-09 dialect is no longer analyzed |
| `error/dialect-unknown.json` | `SS-E-DIALECT` | Any other declared dialect (draft-06) |
| `error/ref-external-absolute.json` | `SS-E-REF-EXTERNAL` | `https://` target |
| `error/ref-external-relative.json` | `SS-E-REF-EXTERNAL` | `shared.json#/$defs/T` — another document, not a local pointer |
| `error/ref-anchor.json` | `SS-E-REF-UNSUPPORTED` | `$anchor` plus a `#Location` plain-name fragment |
| `error/ref-empty.json` | `SS-E-REF-UNSUPPORTED` | `"$ref": ""` |
| `error/ref-dynamic.json` | `SS-E-REF-UNSUPPORTED` | `$dynamicAnchor` / `$dynamicRef` |
| `error/ref-recursive.json` | `SS-E-REF-UNSUPPORTED` | `$recursiveAnchor` / `$recursiveRef` |
| `error/ref-nested-id.json` | `SS-E-REF-UNSUPPORTED` | `$id` in a subschema changing the base |
| `error/schema-invalid-tuple-items.json` | `SS-E-SCHEMA-INVALID` | Draft-07 tuple `items` surviving in a 2020-12 document (§1.1 point 4) |

Every one of the seven reference fixtures compiles cleanly under Ajv (verified 2026-09-10). They are the reason §3.5 is an error boundary rather than a tolerance: without it each of these would be reported as a clean pass.

`SS-E-IO` has no committed fixture because a missing file cannot be represented on disk; it is covered by a unit test using a uniquely named path under the OS temp directory that is never created. `SS-E-INTERNAL` has no fixture by definition (§3.7).

### 7.3 Manifest format

`fixtures/manifest.json` is the machine-readable label set:

```json
{
  "fixtures": [
    {
      "evidence": "n8n#25964",
      "expectedExitCode": 1,
      "expectedFindings": [
        { "id": "SS-REF-001", "pointer": "/tools/0/inputSchema/properties/location/$ref", "toolName": "get_weather" }
      ],
      "kind": "defect",
      "path": "defect/ref-dangling-defs-removed.json"
    }
  ],
  "manifestVersion": 1
}
```

`kind: "error"` entries carry `expectedErrorCode` instead of `expectedFindings`. `evidence` is a string for a single-family fixture and an array of family strings when a fixture spans both evidence families (fixture 16). Entries are sorted by `path` as ASCII strings. Every fixture is synthetic, authored from the public issues, and contains no tokens or personal data.

---

## 8. Evaluation

- **Recall** = matched expected findings / all expected findings across `kind: "defect"` fixtures. A match requires identical `(id, toolName, pointer)`. **Target: >=95%.**
- **False positives** = any finding on a `kind: "valid"` fixture. **Target: 0.**
- A finding on fixtures 4, 6, 7 or 8 is not an ordinary false positive: it means a guard keyword from §4.2 was omitted, a rule deferred in §4.3 was implemented, or `contentSchema` was dropped from §4.5 traversal. Fix the detector; do not relabel the control.
- **Misattribution** = a finding whose `(toolName, pointer)` is expected but whose `id` belongs to the other evidence family. It scores as both a miss and a false positive, and it is what fixtures 13 and 15 exist to catch. Recall alone would hide it, since a double-firing detector can reach 100% recall while over-reporting.
- **Determinism** = two consecutive runs over the whole corpus produce byte-identical JSON reports. **Target: exact match.**
- Error-corpus fixtures are scored only on exit code and error code; they never count toward recall.
- Relabeling or weakening a fixture to make a detector pass is a specification change requiring explicit approval (`AGENTS.md` Corpus Independence).

---

## 9. Claim Discipline

Supportable: "detects the documented defect classes in the bundled corpus, for MCP tool schemas in JSON Schema 2020-12 with local references."
Not supportable: MCP compliance guarantees, official endorsement, detection of defects outside §2, or support for dialects and reference forms outside §3.4 and §3.5. Version pins and evidence dates travel with every published claim.
