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

/** Options of {@link runNew}. */
export interface NewOptions {
  /** snake_case `flowId` (default: the slug with `-` replaced by `_`). */
  id?: string;
  /** Human title (default: the slug). */
  title?: string;
  /** Domain id from the config `domains`. */
  domain?: string;
  /** Repo-relative folder that holds the flow's screens. */
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

/**
 * Validates a flow slug (the folder name under `flowsDir`).
 *
 * @param slug - Candidate slug.
 * @returns An error message, or `undefined` when the slug is valid kebab-case.
 * @example
 * validateFlowSlug("checkout"); // undefined
 * validateFlowSlug("Checkout"); // 'invalid slug "Checkout"; use kebab-case (e.g. checkout)'
 */
export function validateFlowSlug(slug: string): string | undefined {
  return KEBAB_SLUG.test(slug)
    ? undefined
    : `invalid slug "${slug}"; use kebab-case (e.g. checkout)`;
}

/**
 * Creates a flow root at `flows/<slug>/index.mdx` with TODO placeholders.
 *
 * @param ctx - Project context.
 * @param slug - kebab-case folder name; the default `flowId` is its snake_case form.
 * @param options - `moduleRoot` is required; `domain` falls back to a configured domain found in that path.
 * @returns The created file, relative to the repository root.
 * @throws When the slug is invalid, the flow exists, the module root is missing or no domain can be chosen.
 */
export function runNew(ctx: Ctx, slug: string, options: NewOptions): string {
  const invalid = validateFlowSlug(slug);
  if (invalid) {
    throw new Error(invalid);
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
