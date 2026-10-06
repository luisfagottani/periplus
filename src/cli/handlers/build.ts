import { renderText } from "../../domain/report/text.ts";
import { runBuild } from "../../use-cases/build.ts";
import type { CommandHandler } from "../command.ts";

/** `periplus build`: regenerates everything, or with `--check` only reports stale files. */
export const buildCommand: CommandHandler = async ({
  values,
  logger,
  prompter,
  project,
}) => {
  const ctx = project();
  const hub = !values["no-hub"];

  if (values.check) {
    const { stale } = await prompter.task(
      {
        start: "Comparing generated/ with a fresh build",
        done: (r) =>
          r.stale.length ? `${r.stale.length} stale file(s)` : "No drift",
      },
      () => runBuild(ctx, { check: true, hub })
    );
    if (!stale.length) {
      logger.success("generated/ is up to date.");
      return 0;
    }
    logger.error(
      `run \`periplus build\`; stale files:\n  ${stale.join("\n  ")}`
    );
    return 1;
  }

  const result = await prompter.task(
    {
      start: "Generating manifests, types and pages",
      done: (r) => `Built ${r.analysis.models.length} flow(s)`,
    },
    () => runBuild(ctx, { hub })
  );
  for (const file of result.written) {
    logger.file("regenerated", file);
  }
  for (const file of result.removed) {
    logger.file("removed", file);
  }
  logger.info(
    `${result.analysis.models.length} flow(s), ${result.written.length} file(s) updated.`
  );
  const errors = result.analysis.issues.filter(
    (issue) => issue.level === "error"
  );
  if (errors.length) {
    logger.line();
    logger.line(renderText(errors, logger.theme));
  }
  return 0;
};
