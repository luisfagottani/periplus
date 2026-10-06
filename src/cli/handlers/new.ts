import fs from "node:fs";

import { fromRepoPath } from "../../context.ts";
import { runBuild } from "../../use-cases/build.ts";
import { runNew, validateFlowSlug } from "../../use-cases/new.ts";
import type { CommandHandler } from "../command.ts";
import { UsageError } from "../parser.ts";

const USAGE = "usage: new <slug> --module-root <dir>";

/**
 * `periplus new <slug>`: creates a flow root and regenerates types. In a terminal, missing
 * arguments (slug, module root, title, domain) are asked for.
 */
export const newCommand: CommandHandler = async ({
  args,
  values,
  logger,
  prompter,
  project,
}) => {
  const ctx = project();
  let [slug] = args;
  let { title, domain, "module-root": moduleRoot } = values;
  const wizard = prompter.interactive && !(slug && moduleRoot);

  if (wizard) {
    await prompter.intro("periplus new");
    slug ??= await prompter.text({
      message: "Flow slug (folder under flows/)",
      placeholder: "checkout",
      validate: validateFlowSlug,
    });
    moduleRoot ??= await prompter.text({
      message: "Module root (folder with the flow's screens)",
      placeholder: "src/modules/checkout",
      validate: (value) =>
        fs.existsSync(fromRepoPath(ctx, value.trim()))
          ? undefined
          : `${value} does not exist`,
    });
    title ??= await prompter.text({
      message: "Title",
      placeholder: slug,
      defaultValue: slug,
    });
    const domains = Object.entries(ctx.config.domains);
    if (!domain && domains.length > 1) {
      domain = await prompter.select({
        message: "Domain",
        options: domains.map(([id, label]) => ({
          value: id,
          label: String(label),
          hint: id,
        })),
      });
    } else if (!domain && domains.length === 0) {
      domain = await prompter.text({
        message: "Domain id",
        placeholder: "checkout",
        validate: (value) => (value.trim() ? undefined : "required"),
      });
    }
  }

  if (!slug) {
    throw new UsageError(USAGE);
  }

  const file = runNew(ctx, slug, {
    id: values.id,
    title,
    domain,
    moduleRoot,
  });
  await prompter.task(
    {
      start: "Regenerating types",
      done: (build) => `${build.written.length} file(s) regenerated`,
    },
    () => runBuild(ctx)
  );

  logger.file("added", file);
  if (wizard) {
    await prompter.outro("Flow created");
  }
  logger.hint(`Next: in each screen folder, run \`periplus node ${slug}\`.`);
  return 0;
};
