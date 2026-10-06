import type { Ctx } from "../context.ts";
import { loadProject } from "../discover.ts";

/** What the CLI needs to offer a flow in a picker. */
export interface FlowSummary {
  /** Folder name under `flowsDir` (accepted wherever `<flow>` is). */
  slug: string;
  flowId: string;
  title: string;
}

/**
 * Lists the valid flow roots (`flows/<slug>/index.mdx`), sorted by title.
 *
 * @param ctx - Project context.
 * @returns One entry per flow; invalid indexes are skipped.
 */
export function listFlows(ctx: Ctx): FlowSummary[] {
  return loadProject(ctx)
    .indexes.map((index) => ({
      slug: index.slug,
      flowId: index.data.flowId,
      title: index.data.title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
