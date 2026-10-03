import { z } from "zod";

import { flowIndexSchema } from "../schema.ts";

export function renderIndexJsonSchema(): string {
  const base = z.toJSONSchema(flowIndexSchema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  return `${JSON.stringify({ title: "periplus: flows/<slug>/index.mdx frontmatter", ...base }, null, 2)}\n`;
}
