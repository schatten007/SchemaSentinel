# SchemaSentinel

Validate MCP tool schemas and catch the documented n8n → MCP conversion defects
before they silently break AI-agent tool calls.

SchemaSentinel reads a `tools/list` response (as a JSON file), resolves the
references it supports, and reports three rules covering two evidence-backed
defect families. It is a focused linter for a documented corpus — not an MCP
client, a JSON Schema conformance suite, or a runtime proxy.

- **Dialect:** JSON Schema **2020-12** only.
- **References:** **local JSON Pointer** `$ref` values only.
- **Evidence:** n8n issue **#25964** (`$defs`/`$ref` discarded) and **n8n issue
  #33864** (typed schemas collapsing to `{"type":"object"}`). See
  `PROJECT_EVIDENCE.md` for the dated provenance.

## What it detects

| Rule | Family | Evidence | Fires when |
| --- | --- | --- | --- |
| `SS-REF-001` | `SS-REF` | n8n #25964 | A supported local `$ref` resolves to no node, or to a node that is not a schema. |
| `SS-REF-002` | `SS-REF` | n8n #25964 | A tool's `inputSchema` has a **non-empty** `$defs` and **zero** `$ref` occurrences anywhere in that schema. |
| `SS-TYPE-001` | `SS-TYPE` | n8n #33864 | A tool's `inputSchema` has `"type":"object"` (or no `type`) and carries **no constraining keyword**. |

Every finding is reported at the JSON Pointer of the original `$ref` site or
the collapsed root, with a remediation line. Detection is deliberately narrow:
valid JSON Schema is never treated as evidence of corruption, so intentionally
permissive schemas (nested objects without `properties`, arrays without
`items`, properties without `type`) produce **no** findings.

## Before / after

n8n #25964 — the `$defs` block is discarded, so the surviving `$ref` dangles:

```json
{
  "tools": [
    {
      "name": "get_weather",
      "inputSchema": {
        "type": "object",
        "properties": {
          "location": { "$ref": "#/$defs/Location" },
          "units": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ]
}
```

```
SS-REF-001  error  n8n#25964  tool "get_weather"
  pointer: /tools/0/inputSchema/properties/location/$ref
  message: $ref '#/$defs/Location' does not resolve within the document.
  fix:     Restore the $defs block or inline the referenced subschema.
```

**Fix:** restore the `$defs` block (or inline `Location`) so the reference
resolves. A complete before/after pair is in
`docs/sample-human-report.txt` and `docs/sample-json-report.json`.

## Install

SchemaSentinel is an ESM package that requires **Node.js >= 20**.

From a clone (verified):

```console
npm install
npm run build
node dist/cli.js --help
```

Intended published usage, once the package is on npm:

```console
npx schema-sentinel validate <file>
```

## Usage

```
schema-sentinel validate <file> [--format human|json] [--out <path>]
```

| Option | Default | Behavior |
| --- | --- | --- |
| `--format` | `human` | `json` emits only the JSON report on stdout, so it is pipeable. |
| `--out <path>` | none | Writes the full report to a file; stdout then carries only a one-line summary. |

### Exit codes

| Exit | Meaning |
| --- | --- |
| `0` | Validation completed; zero findings. |
| `1` | Validation completed; at least one finding. |
| `2` | Input, configuration, or internal error; no trustworthy verdict. |

Reports go to stdout; diagnostics go to stderr. An exit-2 run never emits a
document that can be read as a pass. See the error codes below for what maps to
exit `2`.

### Examples

```console
# Human report for a broken server
node dist/cli.js validate fixtures/defect/ref-dangling-defs-removed.json

# Machine-readable report
node dist/cli.js validate fixtures/defect/mixed-multi-tool.json --format json

# Write a report to a file and keep stdout to one line
node dist/cli.js validate fixtures/valid/minimal-typed.json --format json --out report.json

# A clean control exits 0
node dist/cli.js validate fixtures/valid/minimal-typed.json
```

## Supported input

The CLI accepts one UTF-8 JSON file in any of these shapes and normalizes it to
`{ "tools": [...] }`:

1. JSON-RPC envelope: `{"jsonrpc":"2.0","id":1,"result":{"tools":[...]}}`
2. Bare result object: `{"tools":[...]}`
3. Bare tool array: `[...]`

A `$ref` inside a tool is resolved relative to that tool's `inputSchema`.
Pointers in a report are rooted at the normalized document (for example
`/tools/0/inputSchema/properties/location`) regardless of the input envelope,
so reports are stable across shapes.

If a `nextCursor` field is present, the file is one page of a paginated
`tools/list`. Validation proceeds over the present page, the JSON report sets
`input.partialPage: true`, and the human report prints a caveat: a clean page
does not describe a clean server.

### Supported dialect

- `$schema` absent → validated as 2020-12 (the MCP default).
- `$schema` equal to the 2020-12 dialect URI (http or https, optional trailing
  `#`) → validated as 2020-12.
- Any other declared dialect, or a non-string `$schema` → `SS-E-DIALECT`,
  exit `2`.

### Supported references

| `$ref` value | Handling |
| --- | --- |
| `"#"` | Supported — the tool's `inputSchema` root. |
| `"#/..."` | Supported — RFC 6901 pointer rooted at the tool's `inputSchema` (`~0`/`~1` unescaped). |
| `""` | `SS-E-REF-UNSUPPORTED` — empty reference resolves against a base URI. |
| `"#name"` | `SS-E-REF-UNSUPPORTED` — plain-name anchor reference. |
| Non-empty non-local string | `SS-E-REF-EXTERNAL` — absolute URI, `file:`, `urn:`, or a relative document such as `shared.json#/$defs/T`. |
| Non-string value | `SS-E-REF-UNSUPPORTED`. |

Cycles are legal and are never reported. A `$id` at the `inputSchema` root is
accepted and ignored.

## Unsupported-feature boundaries

SchemaSentinel exits `2` (no verdict) rather than guessing whenever it cannot
follow the input. This is intentional: Ajv compiles all of the constructs below
without complaint, so tolerating them would produce a confident pass on a
schema the tool never actually followed.

| Boundary | Error code |
| --- | --- |
| Declared dialect other than 2020-12 | `SS-E-DIALECT` |
| External or relative-document `$ref` | `SS-E-REF-EXTERNAL` |
| `$anchor`, `$dynamicAnchor`, `$recursiveAnchor` | `SS-E-REF-UNSUPPORTED` |
| `$dynamicRef`, `$recursiveRef` | `SS-E-REF-UNSUPPORTED` |
| `$id` anywhere other than the `inputSchema` root | `SS-E-REF-UNSUPPORTED` |
| Empty `$ref` (`""`) or a non-string `$ref` | `SS-E-REF-UNSUPPORTED` |
| Schema still invalid after neutralization | `SS-E-SCHEMA-INVALID` |

Other exit-2 conditions:

| Code | Condition |
| --- | --- |
| `SS-E-IO` | File missing or unreadable. |
| `SS-E-PARSE` | Not valid JSON. |
| `SS-E-SHAPE` | None of the three accepted shapes, a JSON-RPC `error` envelope, or a tool missing `name`/`inputSchema`. |
| `SS-E-SCHEMA-TYPE` | `inputSchema` is present but is not a JSON object. |
| `SS-E-INTERNAL` | An unexpected implementation failure. |

Out of scope by design: `structuredContent`/`outputSchema`, auth or resource
indicators, tool-name leakage, live stdio/HTTP transports, a GUI, and modifying
n8n or the user's server.

## Sample reports

- `docs/sample-human-report.txt` — a broken four-tool server with both defect
  families (sorted, deterministic).
- `docs/sample-json-report.json` — the JSON report for a single dangling `$ref`.

Both files were generated by the built CLI, not written by hand.

## Evaluation results

The bundled corpus (`fixtures/`) is run through the real CLI by the eval
harness. Verified on 2026-09-11:

```console
$ npm.cmd run eval
...
recall:          15/15 (100.00%)
false positives: 0
unexpected:      0
misattributions: 0
deterministic:   true
exit codes ok:   true
error codes ok:  true
```

- 15/15 seeded defects detected (target ≥ 95%).
- 0 false positives on the 8 valid controls.
- 0 unexpected findings and 0 misattributions.
- Byte-identical reports across consecutive runs.
- 136 tests pass under `npm run check`.

The corpus is 8 valid controls, 8 defect fixtures (15 expected findings), and 14
error fixtures scored only on exit and error code. It pins the documented defect
classes and the supported boundary — it is not a JSON Schema compliance suite.

## Development

On Windows PowerShell the execution policy blocks bare `npm`/`npx` shims; use
the `.cmd` variants at the prompt.

```console
npm.cmd install
npm.cmd run check       # lint -> typecheck -> test
npm.cmd run build
npm.cmd run eval        # evaluate against the real validator
npm.cmd run format      # biome format --write
```

## Determinism and claim discipline

Reports are contractual and replay byte-for-byte: findings are sorted by
`(path, pointer, id)`, every object is serialized with ASCII-sorted keys and LF
endings, input paths are CWD-relative POSIX paths, and messages are static
templates. No timestamps, random ordering, hostnames, or absolute machine paths
appear in output.

SchemaSentinel claims only that it detects the documented defect classes in the
bundled corpus, for MCP tool schemas in JSON Schema 2020-12 with local
references. It does **not** claim MCP compliance, official endorsement, or
detection of defects outside the two evidence-backed fingerprints. Version pins
and evidence dates travel with every claim.
