import fs from "node:fs";
import path from "node:path";

import { type Ctx, flowsDirAbs, toRepoPath } from "../context.ts";
import {
  bodyPathFor,
  isUnder,
  loadProject,
  resolveFlow,
  SCREEN_DOC_SUFFIX,
} from "../discover.ts";
import {
  BRANCH_ID_PATTERN,
  SCREEN_TYPES,
  type ScreenType,
  screenDocSchema,
} from "../schema.ts";
import {
  appendBranch,
  evaluateTsDoc,
  relativeImport,
  renderTsDoc,
} from "../tsdoc.ts";

/** Options of {@link runNode}. */
export interface NodeOptions {
  /** Screen folder relative to `ctx.cwd` (default: `ctx.cwd`). */
  path?: string;
  /** Adds this branch to an existing doc instead of creating one. */
  branch?: string;
  /** Screen type (`loading`, `form`…). */
  type?: string;
  /** Branch label (default: the humanized folder name). */
  label?: string;
}

const SCREEN_SUFFIX = /Screen$/;
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;
const FIRST_CHAR = /^./;

const BODY = `## What happens here

TODO: describe in product language what the user sees and decides on this screen.

## Situations

- **Success:** TODO
- **Loading:** TODO
- **Error:** TODO
- **Empty:** TODO (remove if it does not apply)
`;

function humanize(folder: string): string {
  return folder
    .replace(SCREEN_SUFFIX, "")
    .replace(CAMEL_BOUNDARY, "$1 $2")
    .replace(FIRST_CHAR, (c) => c.toUpperCase());
}

function emptyBranch(branchId: string, label: string, type?: ScreenType) {
  return {
    branchId,
    label,
    ...(type ? { type } : {}),
    incoming: [],
    outgoing: [],
    rules: [],
    apis: [],
  };
}

/**
 * Creates `<Folder>.periplus.ts` (+ `.periplus.mdx` body) for a screen, or adds a branch to it.
 *
 * @param ctx - Project context.
 * @param flow - Flow slug or `flowId`.
 * @param options - Screen folder, branch, type and label.
 * @returns The doc file (repo-relative) and whether it was created (`false` = branch added).
 * @throws When the flow is unknown, or the doc exists and no `branch` was given.
 */
export function runNode(
  ctx: Ctx,
  flow: string,
  options: NodeOptions
): { file: string; created: boolean } {
  const project = loadProject(ctx);
  const index = resolveFlow(project, flow);
  if (!index) {
    throw new Error(
      `flow "${flow}" not found; create it with \`periplus new\``
    );
  }

  if (options.type && !SCREEN_TYPES.includes(options.type as ScreenType)) {
    throw new Error(
      `invalid --type "${options.type}" (use ${SCREEN_TYPES.join(", ")})`
    );
  }
  const type = options.type as ScreenType | undefined;

  const folderAbs = path.resolve(ctx.cwd, options.path ?? ".");
  if (!(fs.existsSync(folderAbs) && fs.statSync(folderAbs).isDirectory())) {
    throw new Error(`folder not found: ${folderAbs}`);
  }

  const folder = toRepoPath(ctx, folderAbs);
  const roots = [index.data.moduleRoot, ...index.data.include];
  if (!roots.some((root) => isUnder(folder, root))) {
    throw new Error(
      `${folder} is outside the flow moduleRoot/include (${roots.join(", ")})`
    );
  }

  const folderName = path.basename(folderAbs);
  const file = path.join(folderAbs, `${folderName}${SCREEN_DOC_SUFFIX}`);
  const branchId = options.branch ?? "default";
  if (!BRANCH_ID_PATTERN.test(branchId)) {
    throw new Error(`invalid --branch "${branchId}" (camelCase)`);
  }

  if (fs.existsSync(file)) {
    if (!options.branch) {
      throw new Error(
        `${toRepoPath(ctx, file)} already exists; use --branch <id> to add another role for this screen`
      );
    }

    const source = fs.readFileSync(file, "utf8");
    const current = screenDocSchema.safeParse(evaluateTsDoc(source, file).data);
    if (
      current.success &&
      current.data.branches.some((b) => b.branchId === branchId)
    ) {
      throw new Error(
        `branch "${branchId}" already exists in ${toRepoPath(ctx, file)}`
      );
    }
    fs.writeFileSync(
      file,
      appendBranch(
        source,
        emptyBranch(branchId, options.label ?? branchId, type)
      )
    );
    return { file: toRepoPath(ctx, file), created: false };
  }

  const typesFile = path.join(
    flowsDirAbs(ctx),
    index.slug,
    "generated",
    "+flow.types.ts"
  );
  const data = {
    flowId: index.data.flowId,
    type: type ?? "screen",
    branches: [emptyBranch(branchId, options.label ?? humanize(folderName))],
  };
  fs.writeFileSync(
    file,
    renderTsDoc(data, relativeImport(folderAbs, typesFile))
  );

  const bodyFile = bodyPathFor(file);
  if (!fs.existsSync(bodyFile)) {
    fs.writeFileSync(bodyFile, BODY);
  }
  return { file: toRepoPath(ctx, file), created: true };
}
