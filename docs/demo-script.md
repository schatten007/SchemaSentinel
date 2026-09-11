# SchemaSentinel — 2-Minute Demo Script

Target length: **2:00**. Record from the repository root after a one-time
`npm.cmd install` and `npm.cmd run build`. All commands below are verified
against the built CLI at `node dist/cli.js`.

| Time | Cue | Action / narration |
| --- | --- | --- |
| 0:00–0:15 | Hook | "MCP is how agents discover tools, and n8n's conversion has silently dropped parts of tool schemas. SchemaSentinel catches the two documented defect classes before your agent calls the wrong tool." |
| 0:15–0:45 | Broken server | Run `node dist/cli.js validate fixtures/defect/mixed-multi-tool.json`. Narrate the output: "Four tools, both evidence families. `SS-REF-001` marks dangling `$ref`s, `SS-TYPE-001` marks a root collapsed to `{"type":"object"}`, and `SS-REF-002` marks a `$defs` block that lost its reference sites." Point at the pointer and `fix:` lines. Exit code `1`. |
| 0:45–1:10 | Machine report | Run `node dist/cli.js validate fixtures/defect/ref-dangling-defs-removed.json --format json`. "The JSON report is sorted, has no timestamps or absolute paths, and is byte-identical on re-run, so it drops straight into CI." Mention exit codes: `0` clean, `1` findings, `2` no trustworthy verdict. |
| 1:10–1:30 | Boundary | Run `node dist/cli.js validate fixtures/error/ref-external-relative.json`. "A reference to another document cannot be followed offline, so instead of guessing it exits `2` and says the input was not validated. The tool prefers no verdict over a false pass." |
| 1:30–1:50 | Clean control + proof | Run `node dist/cli.js validate fixtures/valid/minimal-typed.json` (exit `0`), then `npm.cmd run eval`. "On the bundled corpus: 15 of 15 seeded defects, zero false positives on the valid controls, zero misattributions, and deterministic output." |
| 1:50–2:00 | Close | "SchemaSentinel is a focused linter for JSON Schema 2020-12 with local references — it detects the documented defect classes in the bundled corpus and claims nothing more. Sample reports and the evaluation are in the README." |

## Exact command block

```console
node dist/cli.js validate fixtures/defect/mixed-multi-tool.json
node dist/cli.js validate fixtures/defect/ref-dangling-defs-removed.json --format json
node dist/cli.js validate fixtures/error/ref-external-relative.json
node dist/cli.js validate fixtures/valid/minimal-typed.json
npm.cmd run eval
```

## Do not claim

- MCP compliance or official endorsement.
- Detection of defects outside n8n #25964 and #33864.
- Support for dialects other than 2020-12 or reference forms beyond local JSON
  Pointers.
