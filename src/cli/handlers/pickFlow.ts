import type { Ctx } from "../../context.ts";
import { listFlows } from "../../use-cases/listFlows.ts";
import type { Prompter } from "../ui/prompt.ts";

/**
 * Asks the user to choose one of the project's flows.
 *
 * @param ctx - Project context.
 * @param prompter - Interactive prompter.
 * @param message - Question shown above the list.
 * @returns The chosen flow slug.
 * @throws When the project has no flows yet.
 */
export function pickFlow(
  ctx: Ctx,
  prompter: Prompter,
  message: string
): Promise<string> {
  const flows = listFlows(ctx);
  if (!flows.length) {
    throw new Error("no flows yet; create one with `periplus new`");
  }
  return prompter.select({
    message,
    options: flows.map((flow) => ({
      value: flow.slug,
      label: flow.title,
      hint: flow.flowId,
    })),
  });
}
