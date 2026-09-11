/**
 * Commander CLI (`SPEC.md` section 5).
 *
 *   schema-sentinel validate <file> [--format human|json] [--out <path>]
 *
 * Exit `0` = validated, no findings. Exit `1` = validated, findings present.
 * Exit `2` = input, configuration, or internal error; no trustworthy verdict.
 * Reports go to stdout; diagnostics and error text go to stderr.
 */

import { writeFile } from "node:fs/promises";
import { Command, CommanderError, Option } from "commander";
import { isErrorReport, renderSummaryLine } from "./report.js";
import { validateFile } from "./validate.js";
import { TOOL_NAME, TOOL_VERSION } from "./version.js";

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export const processIo: CliIo = {
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
};

interface ValidateCommandOptions {
  readonly format: "human" | "json";
  readonly out?: string;
}

export function createProgram(
  io: CliIo = processIo,
  onExitCode: (code: number) => void = () => {},
): Command {
  const program = new Command();

  program.exitOverride();
  program.configureOutput({
    writeOut: (text) => {
      io.stdout(text);
    },
    writeErr: (text) => {
      io.stderr(text);
    },
  });

  program
    .name(TOOL_NAME)
    .description(
      "Validate MCP tool schemas and n8n interoperability fingerprints",
    )
    .version(TOOL_VERSION);

  program
    .command("validate")
    .description("Validate an MCP tools/list JSON file")
    .argument("<file>", "path to the tools/list JSON file")
    .addOption(
      new Option("--format <format>", "report format")
        .choices(["human", "json"])
        .default("human"),
    )
    .option("--out <path>", "write the report to this file instead of stdout")
    .action(async (file: string, options: ValidateCommandOptions) => {
      const outcome = await validateFile(file);
      const failed = isErrorReport(outcome.report);
      const body = options.format === "json" ? outcome.json : outcome.human;

      if (options.out !== undefined) {
        try {
          await writeFile(options.out, body, "utf8");
        } catch {
          io.stderr(
            `${TOOL_NAME}: the report could not be written to ${options.out}\n`,
          );
          onExitCode(2);
          return;
        }
        const summary = renderSummaryLine(outcome.report, options.out);
        if (failed) {
          io.stderr(summary);
        } else {
          io.stdout(summary);
        }
        onExitCode(outcome.exitCode);
        return;
      }

      if (!failed) {
        io.stdout(body);
        onExitCode(outcome.exitCode);
        return;
      }

      // Exit 2 must never emit anything readable as a pass (SPEC 5). The JSON
      // error document of SPEC 6.2 is machine-readable and carries no
      // `findings` key, so it stays on stdout for pipelines; human output is a
      // diagnostic and belongs on stderr.
      if (options.format === "json") {
        io.stdout(body);
        io.stderr(renderSummaryLine(outcome.report));
      } else {
        io.stderr(body);
      }
      onExitCode(outcome.exitCode);
    });

  return program;
}

export async function runCli(
  argv?: readonly string[],
  io: CliIo = processIo,
): Promise<number> {
  let exitCode = 0;
  const program = createProgram(io, (code) => {
    exitCode = code;
  });

  try {
    if (argv === undefined) {
      await program.parseAsync();
    } else {
      await program.parseAsync([...argv], { from: "user" });
    }
  } catch (error) {
    if (error instanceof CommanderError) {
      // `--help` and `--version` exit 0; every usage error is a configuration
      // error and maps to the exit-2 branch of the CLI contract.
      return error.exitCode === 0 ? 0 : 2;
    }
    io.stderr(`${TOOL_NAME}: an internal error prevented the run\n`);
    return 2;
  }

  return exitCode;
}
