import fs from "node:fs";
import path from "node:path";

import { CONFIG_FILE } from "../../context.ts";
import {
  DEFAULT_SITE_DIR,
  type InitResult,
  runInit,
} from "../../use-cases/init.ts";
import type { CommandHandler } from "../command.ts";
import type { FileChange, Logger } from "../ui/logger.ts";

const CONFIG_MESSAGES: Record<
  InitResult["config"],
  [change: FileChange, note: string]
> = {
  created: ["added", "created"],
  updated: ["updated", "hubDir/site updated"],
  unchanged: ["unchanged", "already pointed to this folder"],
};

function hasFiles(dir: string): boolean {
  return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
}

function printResult(logger: Logger, result: InitResult) {
  logger.file("added", `${result.written.length} file(s) in ${result.hubDir}`);
  if (result.skipped.length) {
    logger.file(
      "unchanged",
      `${result.skipped.length} already existed`,
      "(use --force to overwrite)"
    );
    for (const file of result.skipped) {
      logger.hint(`  ${file}`);
    }
  }
  const [change, note] = CONFIG_MESSAGES[result.config];
  logger.file(change, CONFIG_FILE, note);
}

function printNextSteps(logger: Logger, hubDir: string) {
  const { code, dim, bold } = logger.theme;
  logger.line();
  logger.line(bold("Next steps:"));
  logger.line(`  ${code(`npm install --prefix ${hubDir}`)}`);
  logger.line(`  ${code("periplus build")}`);
  logger.line(
    `  ${code(`npm run dev --prefix ${hubDir}`)}   ${dim("# and, in another terminal: periplus dev")}`
  );
  logger.line(
    `  ${code("periplus skill")}   ${dim("# agent skill to keep the docs up to date")}`
  );
}

/**
 * `periplus init [dir]`: installs the docs site. Without `dir` in a terminal it runs a wizard
 * (folder, theme source and overwrite confirmation).
 */
export const initCommand: CommandHandler = async ({
  args,
  values,
  runtime,
  logger,
  prompter,
}) => {
  let [dir] = args;
  let { template, force } = values;
  const wizard = prompter.interactive && dir === undefined;

  if (wizard) {
    await prompter.intro("periplus init");
    dir = await prompter.text({
      message: "Where should the docs site live?",
      placeholder: DEFAULT_SITE_DIR,
      defaultValue: DEFAULT_SITE_DIR,
    });
    if (template === undefined) {
      const source = await prompter.select({
        message: "Which site template?",
        options: [
          {
            value: "bundled",
            label: "Bundled Starlight theme",
            hint: "offline, matches this CLI version",
          },
          {
            value: "remote",
            label: "Download from a repository",
            hint: "any giget source",
          },
        ],
      });
      if (source === "remote") {
        template = await prompter.text({
          message: "Template source",
          placeholder: "gh:org/repo/templates/starlight",
          validate: (value) => (value.trim() ? undefined : "required"),
        });
      }
    }
    if (!force && hasFiles(path.resolve(runtime.cwd, dir))) {
      force = await prompter.confirm({
        message: `${dir} already has files. Overwrite them with the template?`,
        initialValue: false,
      });
    }
  }

  const result = await prompter.task(
    {
      start: template ? `Downloading ${template}` : "Copying the site template",
      done: (r) => `Site installed in ${r.hubDir}`,
    },
    () => runInit({ cwd: runtime.cwd, dir, force, template })
  );

  printResult(logger, result);
  if (wizard) {
    await prompter.outro("Docs site ready");
  }
  printNextSteps(logger, result.hubDir);
  return 0;
};
