import { loadContext } from "../context.ts";
import { packageVersion } from "../utils/paths.ts";
import { COMMAND_NAMES, findCommand } from "./commands.ts";
import { closestCommand, renderCommandHelp, renderHelp } from "./help.ts";
import { type ParsedCli, parseCli, UsageError } from "./parser.ts";
import { type CliRuntime, processRuntime } from "./runtime.ts";
import { createLogger, type Logger } from "./ui/logger.ts";
import {
  createPrompter,
  isInteractive,
  PromptCancelledError,
} from "./ui/prompt.ts";
import { createTheme, isColorEnabled } from "./ui/theme.ts";

/** Exit code for Ctrl+C, matching shells (128 + SIGINT). */
export const EXIT_CANCELLED = 130;

function usageFailure(logger: Logger, message: string): number {
  logger.error(
    `${message}\n  ${logger.theme.dim("Run `periplus --help` for usage.")}`
  );
  return 1;
}

function unknownCommand(logger: Logger, command: string): number {
  const suggestion = closestCommand(command, COMMAND_NAMES);
  const hint = suggestion
    ? `Did you mean ${logger.theme.code(`periplus ${suggestion}`)}?`
    : "Run `periplus --help` to see all commands.";
  logger.error(`unknown command: ${command}\n  ${logger.theme.dim(hint)}`);
  return 1;
}

/**
 * Runs the CLI.
 *
 * @param argv - Arguments without the node binary and script path.
 * @param runtime - Process streams, env and cwd (inject a fake one in tests).
 * @returns The exit code; `KEEP_ALIVE` (-1) when a watcher keeps the process running.
 */
export async function main(
  argv: string[],
  runtime: CliRuntime = processRuntime()
): Promise<number> {
  const theme = createTheme(isColorEnabled(runtime.env, runtime.stdout));
  const logger = createLogger({
    stdout: runtime.stdout,
    stderr: runtime.stderr,
    theme,
  });

  let parsed: ParsedCli;
  try {
    parsed = parseCli(argv);
  } catch (error) {
    return usageFailure(logger, (error as Error).message);
  }
  const { command, args, values } = parsed;

  if (values.version) {
    logger.line(packageVersion());
    return 0;
  }
  if (command === "help") {
    logger.line(
      (args[0] && renderCommandHelp(args[0], theme)) || renderHelp(theme)
    );
    return 0;
  }
  if (!command) {
    logger.line(renderHelp(theme));
    return values.help ? 0 : 1;
  }

  const handler = findCommand(command);
  if (!handler) {
    return unknownCommand(logger, command);
  }
  if (values.help) {
    logger.line(renderCommandHelp(command, theme) ?? renderHelp(theme));
    return 0;
  }

  const prompter = createPrompter({
    interactive: isInteractive({
      env: runtime.env,
      stdin: runtime.stdin,
      stdout: runtime.stdout,
      yes: values.yes,
    }),
    stdout: runtime.stdout,
  });

  try {
    return await handler({
      args,
      values,
      runtime,
      logger,
      prompter,
      project: () => loadContext({ cwd: runtime.cwd }),
    });
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      return EXIT_CANCELLED;
    }
    if (error instanceof UsageError) {
      return usageFailure(logger, error.message);
    }
    logger.error((error as Error).message);
    return 1;
  }
}
