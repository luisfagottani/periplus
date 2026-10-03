import fs from "node:fs";
import path from "node:path";

import {
  type Ctx,
  flowsDirAbs,
  fromRepoPath,
  today,
  toRepoPath,
} from "../context.ts";
import { stringifyMdx } from "../frontmatter.ts";
import { flowIndexSchema, formatZodIssues } from "../schema.ts";

export interface NewOptions {
  id?: string;
  title?: string;
  domain?: string;
  moduleRoot?: string;
}

const KEBAB_SLUG = /^[a-z][a-z0-9-]*$/;
const TRAILING_SLASHES = /\/+$/;

const BODY = `## Goal

TODO: what the user can do in this flow and why it exists.

## How it works (product view)

TODO: summary of the main path and the most important branches.
Screens, rules and links live in the \`*.periplus.ts\` files colocated with each screen folder.
`;

export function runNew(ctx: Ctx, slug: string, options: NewOptions): string {
  if (!KEBAB_SLUG.test(slug)) {
    throw new Error(`invalid slug "${slug}"; use kebab-case (e.g. checkout)`);
  }

  const file = path.join(flowsDirAbs(ctx), slug, "index.mdx");
  if (fs.existsSync(file)) {
    throw new Error(`${toRepoPath(ctx, file)} already exists`);
  }

  if (!options.moduleRoot) {
    throw new Error("--module-root is required (e.g. src/modules/checkout)");
  }
  const moduleRoot = options.moduleRoot.replace(TRAILING_SLASHES, "");
  if (!fs.existsSync(fromRepoPath(ctx, moduleRoot))) {
    throw new Error(`--module-root does not exist: ${moduleRoot}`);
  }

  const configured = Object.keys(ctx.config.domains);
  const segments = moduleRoot.split("/");
  const domain =
    options.domain ??
    configured.find((id) => segments.includes(id)) ??
    configured[0];
  if (!domain) {
    throw new Error(
      "--domain is required when periplus.config.json has no `domains`"
    );
  }

  const data = {
    flowId: options.id ?? slug.replace(/-/g, "_"),
    title: options.title ?? slug,
    domain,
    moduleRoot,
    status: "wip",
    lastReviewed: today(),
    owners: [],
    watchPaths: [`${moduleRoot}/**`],
    entry: {
      summary:
        "TODO: where the user comes from and which parameters start the flow.",
      productSummary: "TODO: one sentence for product.",
      triggers: [],
    },
  };

  const parsed = flowIndexSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(formatZodIssues(parsed.error).join("\n"));
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringifyMdx(data, BODY));
  return toRepoPath(ctx, file);
}
