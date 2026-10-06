import { parseChangedFiles, runCheck } from "../../use-cases/check.ts";
import type { CommandHandler } from "../command.ts";
import { parseFailOn, parseFormat } from "../parser.ts";

/**
 * `periplus check`: validates docs and `generated/`. Only the `text` report on stdout is colored
 * and animated; `json`, `markdown` and `--output` stay plain so they can be parsed or posted.
 */
export const checkCommand: CommandHandler = async ({
  values,
  runtime,
  logger,
  prompter,
  project,
}) => {
  const failOn = parseFailOn(values["fail-on"]);
  const format = parseFormat(values.format);
  const ctx = project();
  const run = () =>
    runCheck(ctx, {
      failOn,
      format,
      output: values.output,
      changedFiles: parseChangedFiles(runtime.env.PERIPLUS_CHANGED),
      style: logger.theme,
    });

  const result =
    format === "text" && !values.output
      ? await prompter.task(
          { start: "Checking flow docs", done: () => "Checked flow docs" },
          run
        )
      : run();

  if (values.output) {
    const message = `report written to ${values.output}`;
    if (result.failed) {
      logger.error(message);
    } else {
      logger.success(message);
    }
  } else {
    runtime.stdout.write(`${result.report}\n`);
  }
  return result.failed ? 1 : 0;
};
