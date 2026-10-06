import { runBuild } from "../../use-cases/build.ts";
import { runNode } from "../../use-cases/node.ts";
import { runSuggest } from "../../use-cases/suggest.ts";
import type { CommandHandler } from "../command.ts";
import { UsageError } from "../parser.ts";
import { pickFlow } from "./pickFlow.ts";

/**
 * `periplus node <flow>`: creates the screen doc (or adds a branch) and regenerates types.
 * In a terminal, a missing `<flow>` is picked from a list.
 */
export const nodeCommand: CommandHandler = async ({
  args,
  values,
  logger,
  prompter,
  project,
}) => {
  const ctx = project();
  let [flow] = args;
  if (!flow && prompter.interactive) {
    flow = await pickFlow(
      ctx,
      prompter,
      "Which flow does this screen belong to?"
    );
  }
  if (!flow) {
    throw new UsageError("usage: node <flow> [--path <dir>]");
  }

  const { file, created } = runNode(ctx, flow, {
    path: values.path,
    branch: values.branch,
    type: values.type,
    label: values.label,
  });
  const build = await prompter.task(
    {
      start: "Regenerating types",
      done: (result) => `${result.written.length} file(s) regenerated`,
    },
    () => runBuild(ctx)
  );

  logger.file(created ? "added" : "updated", file);
  logger.hint(`  types regenerated (${build.written.length} file(s)).`);
  if (values.suggest) {
    logger.file("added", runSuggest(ctx, values.path), "(suggestions)");
  }
  logger.hint(
    "  Fill in outgoing/incoming/rules and run `periplus stamp` once reviewed."
  );
  return 0;
};
