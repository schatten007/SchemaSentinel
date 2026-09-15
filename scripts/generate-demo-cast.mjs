/**
 * Generates `docs/demo.cast`, an asciinema v2 recording of the SchemaSentinel
 * demo, from the real CLI outputs. Deterministic: fixed typing and line
 * timings, no timestamps in the rendered content. Render with:
 *
 *   agg --theme monokai --font-size 15 docs/demo.cast docs/demo.gif
 *
 * See docs/demo-script.md for the narrated version of the same commands.
 */

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const TYPE_SECONDS_PER_CHAR = 0.045;
const LINE_SECONDS = 0.03;
const PAUSE_AFTER_COMMAND = 1.4;
const CLEAR_PAUSE = 0.5;

const COMMANDS = [
  "node dist/cli.js validate fixtures/defect/mixed-multi-tool.json",
  "node dist/cli.js validate fixtures/defect/ref-dangling-defs-removed.json --format json",
  "node dist/cli.js validate fixtures/error/ref-external-relative.json",
  "node dist/cli.js validate fixtures/valid/minimal-typed.json",
  "npm.cmd run eval",
];

const events = [];
let elapsed = 0;

function emit(text) {
  if (text.length === 0) {
    return;
  }
  events.push([Math.round(elapsed * 1000) / 1000, "o", text]);
}

function advance(seconds) {
  elapsed += seconds;
}

function typeCommand(command) {
  const prompt = "PS> ";
  emit(prompt);
  advance(TYPE_SECONDS_PER_CHAR * prompt.length);
  for (const char of command) {
    emit(char);
    advance(TYPE_SECONDS_PER_CHAR);
  }
  emit("\r\n");
  advance(TYPE_SECONDS_PER_CHAR * 2);
}

function runCommand(command) {
  const result = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const lines = output.split("\n");
  for (const [index, line] of lines.entries()) {
    const isLast = index === lines.length - 1;
    emit(isLast ? "" : `${line}\r\n`);
    advance(LINE_SECONDS);
  }
}

function clearScreen() {
  emit("\u001b[2J\u001b[1;1H");
  advance(CLEAR_PAUSE);
}

for (const [index, command] of COMMANDS.entries()) {
  typeCommand(command);
  runCommand(command);
  advance(PAUSE_AFTER_COMMAND);
  if (index < COMMANDS.length - 1) {
    clearScreen();
  }
}

const header = {
  version: 2,
  width: 100,
  height: 30,
  timestamp: 0,
  env: { SHELL: "powershell", TERM: "xterm-256color" },
};

const cast = [
  JSON.stringify(header),
  ...events.map((event) => JSON.stringify(event)),
].join("\n");

await writeFile("docs/demo.cast", `${cast}\n`, "utf8");
console.log(
  `docs/demo.cast: ${events.length} events, ${(Math.round(elapsed * 10) / 10).toFixed(1)}s`,
);
