import type { Ctx } from "../context.ts";
import type { CliValues } from "./parser.ts";
import type { CliRuntime } from "./runtime.ts";
import type { Logger } from "./ui/logger.ts";
import type { Prompter } from "./ui/prompt.ts";

/** Everything a command handler receives. */
export interface CommandContext {
  /** Positional arguments after the command name. */
  args: string[];
  values: CliValues;
  runtime: CliRuntime;
  logger: Logger;
  prompter: Prompter;
  /** Loads `periplus.config.json` from the invocation directory (throws when missing). */
  project: () => Ctx;
}

/**
 * A CLI command. Returns the process exit code, or {@link KEEP_ALIVE} for long-running commands.
 * Handlers translate flags into a use-case call and render its result; they hold no business logic.
 */
export type CommandHandler = (
  context: CommandContext
) => number | Promise<number>;

/** Exit code sentinel for watch mode: leave the process running. */
export const KEEP_ALIVE = -1;
