import { parseArgs } from "node:util";

import { FAIL_ON_VALUES, type FailOn } from "../domain/report/fail.ts";

/** Every flag accepted by the CLI; commands ignore the ones they do not use. */
export const CLI_OPTIONS = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  yes: { type: "boolean", short: "y" },
  id: { type: "string" },
  title: { type: "string" },
  domain: { type: "string" },
  "module-root": { type: "string" },
  path: { type: "string" },
  branch: { type: "string" },
  type: { type: "string" },
  label: { type: "string" },
  suggest: { type: "boolean" },
  flow: { type: "string" },
  stale: { type: "boolean" },
  "fail-on": { type: "string" },
  format: { type: "string" },
  output: { type: "string" },
  check: { type: "boolean" },
  "no-hub": { type: "boolean" },
  force: { type: "boolean" },
  template: { type: "string" },
  dir: { type: "string" },
} as const;

/** Parsed flag values, keyed by flag name. */
export type CliValues = ReturnType<
  typeof parseArgs<{ options: typeof CLI_OPTIONS; allowPositionals: true }>
>["values"];

/** Result of {@link parseCli}: the command name, its positional arguments and the flags. */
export interface ParsedCli {
  command?: string;
  args: string[];
  values: CliValues;
}

/** Output formats of `periplus check`. */
export type CheckFormat = "text" | "markdown" | "json";

const CHECK_FORMATS: readonly CheckFormat[] = ["text", "markdown", "json"];

/** Invalid invocation (unknown flag, bad value); the CLI prints it with a pointer to `--help`. */
export class UsageError extends Error {
  override readonly name = "UsageError";
}

/**
 * Parses `argv` (without the node binary and script path).
 *
 * @param argv - Raw arguments, e.g. `["check", "--fail-on", "stale"]`.
 * @returns The command, its positionals and flag values.
 * @throws {UsageError} On unknown flags or flags missing their value.
 * @example
 * parseCli(["node", "checkout", "--branch", "review"]);
 * // { command: "node", args: ["checkout"], values: { branch: "review" } }
 */
export function parseCli(argv: string[]): ParsedCli {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: CLI_OPTIONS,
    });
    const [command, ...args] = positionals;
    return { command, args, values };
  } catch (error) {
    throw new UsageError((error as Error).message, { cause: error });
  }
}

/**
 * Validates `--fail-on`.
 *
 * @param raw - Flag value; `undefined` means the default (`error`).
 * @throws {UsageError} When the value is not one of {@link FAIL_ON_VALUES}.
 */
export function parseFailOn(raw: string | undefined): FailOn {
  const value = raw ?? "error";
  if (!FAIL_ON_VALUES.includes(value as FailOn)) {
    throw new UsageError(
      `invalid --fail-on: ${value} (use ${FAIL_ON_VALUES.join(", ")})`
    );
  }
  return value as FailOn;
}

/**
 * Validates `--format`.
 *
 * @param raw - Flag value; `undefined` means the default (`text`).
 * @throws {UsageError} When the value is not `text`, `markdown` or `json`.
 */
export function parseFormat(raw: string | undefined): CheckFormat {
  const value = raw ?? "text";
  if (!CHECK_FORMATS.includes(value as CheckFormat)) {
    throw new UsageError(
      `invalid --format: ${value} (use ${CHECK_FORMATS.join(", ")})`
    );
  }
  return value as CheckFormat;
}
