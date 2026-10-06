import fs from "node:fs";
import path from "node:path";

import { type Ctx, flowsDirAbs, fromRepoPath, toRepoPath } from "./context.ts";
import { parseMdx } from "./frontmatter.ts";
import type { Issue } from "./issues.ts";
import {
  type FlowIndex,
  flowIndexSchema,
  formatZodIssues,
  type ScreenDoc,
  screenDocSchema,
} from "./schema.ts";
import { BODY_SUFFIX, evaluateTsDoc } from "./tsdoc.ts";
import { walkFiles } from "./utils/fsutil.ts";

export const SCREEN_DOC_SUFFIX = ".periplus.ts";
const TRAILING_SLASHES = /\/+$/;

export interface LoadedIndex {
  slug: string;
  /** Relative to the repo root. */
  path: string;
  dir: string;
  data: FlowIndex;
  body: string;
}

export interface LoadedScreen {
  path: string;
  /** `<Folder>.periplus.mdx` with the product text, when present. */
  bodyPath?: string;
  folder: string;
  screenRef: string;
  data: ScreenDoc;
  body: string;
}

export interface Project {
  indexes: LoadedIndex[];
  screens: LoadedScreen[];
  /** Colocated docs that failed the schema (they still count for `check`). */
  invalidScreenPaths: string[];
  /** `*.periplus.mdx` files without a sibling `*.periplus.ts`. */
  orphanBodies: string[];
  issues: Issue[];
}

export function findScreenDocFiles(ctx: Ctx): string[] {
  return ctx.config.scanRoots.flatMap((root) =>
    walkFiles(fromRepoPath(ctx, root), (file) =>
      file.endsWith(SCREEN_DOC_SUFFIX)
    )
  );
}

export function bodyPathFor(docPath: string): string {
  return `${docPath.slice(0, -SCREEN_DOC_SUFFIX.length)}${BODY_SUFFIX}`;
}

export function findOrphanBodies(ctx: Ctx): string[] {
  return ctx.config.scanRoots
    .flatMap((root) =>
      walkFiles(fromRepoPath(ctx, root), (file) => file.endsWith(BODY_SUFFIX))
    )
    .filter(
      (file) =>
        !fs.existsSync(
          `${file.slice(0, -BODY_SUFFIX.length)}${SCREEN_DOC_SUFFIX}`
        )
    )
    .map((file) => toRepoPath(ctx, file));
}

export function findIndexFiles(ctx: Ctx): string[] {
  const dir = flowsDirAbs(ctx);
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "generated")
    .map((entry) => path.join(dir, entry.name, "index.mdx"))
    .filter((file) => fs.existsSync(file))
    .sort();
}

export function loadIndex(
  ctx: Ctx,
  absolute: string,
  issues: Issue[]
): LoadedIndex | undefined {
  const repoPath = toRepoPath(ctx, absolute);
  const parsed = parseMdx(fs.readFileSync(absolute, "utf8"));

  if (parsed.yamlError) {
    issues.push({
      level: "error",
      code: "invalid-doc",
      file: repoPath,
      message: parsed.yamlError,
    });
    return undefined;
  }

  const result = flowIndexSchema.safeParse(parsed.data);
  if (!result.success) {
    for (const message of formatZodIssues(result.error)) {
      issues.push({
        level: "error",
        code: "invalid-doc",
        file: repoPath,
        message,
      });
    }
    return undefined;
  }

  const dir = path.dirname(absolute);
  return {
    slug: path.basename(dir),
    path: repoPath,
    dir: toRepoPath(ctx, dir),
    data: result.data,
    body: parsed.body,
  };
}

export function loadScreen(
  ctx: Ctx,
  absolute: string,
  issues: Issue[]
): LoadedScreen | undefined {
  const repoPath = toRepoPath(ctx, absolute);
  const evaluated = evaluateTsDoc(fs.readFileSync(absolute, "utf8"), absolute);

  if (evaluated.error) {
    issues.push({
      level: "error",
      code: "invalid-doc",
      file: repoPath,
      message: evaluated.error,
    });
    return undefined;
  }

  const result = screenDocSchema.safeParse(evaluated.data);
  if (!result.success) {
    for (const message of formatZodIssues(result.error)) {
      issues.push({
        level: "error",
        code: "invalid-doc",
        file: repoPath,
        message,
      });
    }
    return undefined;
  }

  const folderAbs = path.dirname(absolute);
  const folderName = path.basename(folderAbs);
  const bodyAbs = bodyPathFor(absolute);
  const hasBody = fs.existsSync(bodyAbs);

  return {
    path: repoPath,
    bodyPath: hasBody ? toRepoPath(ctx, bodyAbs) : undefined,
    folder: toRepoPath(ctx, folderAbs),
    screenRef: result.data.screenRef ?? folderName,
    data: result.data,
    body: hasBody ? fs.readFileSync(bodyAbs, "utf8").trim() : "",
  };
}

export function loadProject(ctx: Ctx): Project {
  const issues: Issue[] = [];
  const indexes: LoadedIndex[] = [];
  const seenFlowIds = new Map<string, string>();

  for (const file of findIndexFiles(ctx)) {
    const index = loadIndex(ctx, file, issues);
    if (!index) {
      continue;
    }

    const previous = seenFlowIds.get(index.data.flowId);
    if (previous) {
      issues.push({
        level: "error",
        code: "duplicate-flow",
        file: index.path,
        flowId: index.data.flowId,
        message: `flowId "${index.data.flowId}" is already declared in ${previous}`,
      });
      continue;
    }

    seenFlowIds.set(index.data.flowId, index.path);
    indexes.push(index);
  }

  const screens: LoadedScreen[] = [];
  const invalidScreenPaths: string[] = [];

  for (const file of findScreenDocFiles(ctx)) {
    const screen = loadScreen(ctx, file, issues);
    if (screen) {
      screens.push(screen);
    } else {
      invalidScreenPaths.push(toRepoPath(ctx, file));
    }
  }

  return {
    indexes,
    screens,
    invalidScreenPaths,
    orphanBodies: findOrphanBodies(ctx),
    issues,
  };
}

export function isUnder(repoPath: string, dir: string): boolean {
  const normalized = dir.replace(TRAILING_SLASHES, "");
  return repoPath === normalized || repoPath.startsWith(`${normalized}/`);
}

export function screensOfFlow(
  index: LoadedIndex,
  screens: LoadedScreen[]
): LoadedScreen[] {
  return screens.filter((screen) => screen.data.flowId === index.data.flowId);
}

export function resolveFlow(
  project: Project,
  flowOrSlug: string
): LoadedIndex | undefined {
  return project.indexes.find(
    (index) => index.data.flowId === flowOrSlug || index.slug === flowOrSlug
  );
}
