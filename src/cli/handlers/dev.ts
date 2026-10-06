import { renderText } from "../../domain/report/text.ts";
import { type DevRebuild, runDev } from "../../use-cases/dev.ts";
import { type CommandHandler, KEEP_ALIVE } from "../command.ts";
import type { Logger } from "../ui/logger.ts";

/**
 * Prints one rebuild as a single status line plus touched files. No spinners: rebuild output
 * interleaves with editor saves and would leave stray frames in the terminal.
 */
export function printRebuild(logger: Logger, rebuild: DevRebuild): void {
  const { dim, info, symbols } = logger.theme;
  const prefix = info("periplus");
  if (rebuild.error) {
    logger.error(`${prefix} ${rebuild.reason}: ${rebuild.error.message}`);
    return;
  }
  logger.line(
    `${prefix} ${rebuild.reason} ${symbols.arrow} ${rebuild.changed.length} file(s) generated ${dim(`in ${rebuild.durationMs}ms`)}`
  );
  for (const file of rebuild.changed) {
    logger.file("regenerated", file);
  }
  if (rebuild.issues.length) {
    logger.line(renderText(rebuild.issues, logger.theme));
  }
}

/** `periplus dev`: builds, then rebuilds on every doc save until Ctrl+C. */
export const devCommand: CommandHandler = ({ logger, project }) => {
  const watcher = runDev(project(), {
    onRebuild: (rebuild) => printRebuild(logger, rebuild),
  });
  logger.hint(
    `watching ${watcher.dirs.length} folder(s) for doc changes. Ctrl+C to exit.`
  );
  return KEEP_ALIVE;
};
