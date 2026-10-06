import { runStamp } from "../../use-cases/stamp.ts";
import type { CommandHandler } from "../command.ts";
import { pickFlow } from "./pickFlow.ts";

/**
 * `periplus stamp`: marks docs as reviewed. In a terminal, running it without files or
 * `--flow`/`--stale` asks what to stamp.
 */
export const stampCommand: CommandHandler = async ({
  args,
  values,
  logger,
  prompter,
  project,
}) => {
  const ctx = project();
  let { flow, stale } = values;

  if (!(args.length || flow || stale) && prompter.interactive) {
    const mode = await prompter.select({
      message: "What do you want to mark as reviewed?",
      options: [
        {
          value: "stale",
          label: "Every stale doc",
          hint: "code changed since the last review",
        },
        { value: "flow", label: "All docs of a flow" },
      ],
    });
    if (mode === "stale") {
      stale = true;
    } else {
      flow = await pickFlow(ctx, prompter, "Which flow?");
    }
  }

  const stamped = runStamp(ctx, { files: args, flow, stale });
  if (!stamped.length) {
    logger.info("Nothing to stamp.");
  }
  for (const file of stamped) {
    logger.success(file);
  }
  return 0;
};
