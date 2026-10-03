import fs from "node:fs";
import path from "node:path";

import micromatch from "micromatch";

import { type Ctx, fromRepoPath } from "./context.ts";
import {
  isUnder,
  type LoadedIndex,
  type LoadedScreen,
  loadProject,
  type Project,
  screensOfFlow,
} from "./discover.ts";
import { codeFilesFor, computeFingerprint } from "./fingerprint.ts";
import { buildFlowModel, type FlowModel, knownFlows } from "./graph.ts";
import type { Issue } from "./issues.ts";
import type { CodeRef } from "./schema.ts";

const BODY_FILE = /\.periplus\.mdx$/;

export interface AnalyzeOptions {
  /** Files changed in the PR (relative to the root); enables the watchPaths-without-doc warning. */
  changedFiles?: string[];
  /** Skips hashing the code (used by `dev`, which only needs types and manifests). */
  skipFingerprint?: boolean;
}

export interface Analysis {
  project: Project;
  models: FlowModel[];
  issues: Issue[];
}

function checkCodeRefs(
  ctx: Ctx,
  refs: CodeRef[],
  file: string,
  flowId: string,
  nodeId: string | undefined
): Issue[] {
  return refs
    .filter((ref) => !fs.existsSync(fromRepoPath(ctx, ref.file)))
    .map((ref) => ({
      level: "error" as const,
      code: "missing-file" as const,
      file,
      flowId,
      nodeId,
      message: `referenced file does not exist: ${ref.file}`,
    }));
}

function checkTests(
  ctx: Ctx,
  tests: string[],
  file: string,
  flowId: string,
  nodeId: string
): Issue[] {
  return checkCodeRefs(
    ctx,
    tests.map((test) => ({ file: test })),
    file,
    flowId,
    nodeId
  );
}

function screenIssues(
  ctx: Ctx,
  screen: LoadedScreen,
  index: LoadedIndex,
  options: AnalyzeOptions
): Issue[] {
  const issues: Issue[] = [];
  const { flowId } = index.data;
  const folderName = path.basename(screen.folder);
  const fileName = path.basename(screen.path);

  if (fileName !== `${folderName}.periplus.ts`) {
    issues.push({
      level: "warning",
      code: "file-name",
      file: screen.path,
      flowId,
      message: `convention: the file should be named ${folderName}.periplus.ts`,
    });
  }

  const roots = [index.data.moduleRoot, ...index.data.include];
  if (!roots.some((root) => isUnder(screen.path, root))) {
    issues.push({
      level: "error",
      code: "outside-module-root",
      file: screen.path,
      flowId,
      message: `doc is outside the flow moduleRoot/include (${roots.join(", ")})`,
    });
  }

  const ownCode = codeFilesFor(ctx, {
    folder: screen.folder,
    data: { ...screen.data, codePaths: [] },
  });
  if (ownCode.length === 0) {
    issues.push({
      level: "error",
      code: "missing-component",
      file: screen.path,
      flowId,
      message: `no code files found in ${screen.folder}; the doc must live in the component folder`,
    });
  }

  for (const branch of screen.data.branches) {
    const nodeId = `${screen.screenRef}:${branch.branchId}`;
    for (const rule of branch.rules) {
      issues.push(
        ...checkCodeRefs(ctx, rule.where, screen.path, flowId, nodeId)
      );
      issues.push(
        ...checkTests(
          ctx,
          rule.verify.map((v) => v.test),
          screen.path,
          flowId,
          nodeId
        )
      );
    }
    for (const api of branch.apis) {
      issues.push(
        ...checkCodeRefs(ctx, api.where, screen.path, flowId, nodeId)
      );
    }
  }

  if (!options.skipFingerprint) {
    const current = computeFingerprint(ctx, codeFilesFor(ctx, screen));
    if (!screen.data.codeFingerprint) {
      issues.push({
        level: "warning",
        code: "missing-fingerprint",
        file: screen.path,
        flowId,
        message:
          "doc was never stamped; run `periplus stamp` after reviewing it",
      });
    } else if (screen.data.codeFingerprint !== current) {
      issues.push({
        level: "warning",
        code: "stale",
        file: screen.path,
        flowId,
        message: `code in ${screen.folder} changed since the last review${screen.data.lastReviewed ? ` (${screen.data.lastReviewed})` : ""}; review the doc and run \`periplus stamp ${screen.path}\``,
      });
    }
  }

  return issues;
}

function watchPathIssues(
  index: LoadedIndex,
  screens: LoadedScreen[],
  changedFiles: string[]
): Issue[] {
  if (!index.data.watchPaths.length) {
    return [];
  }

  const touchedCode = changedFiles.filter((file) =>
    micromatch.isMatch(file, index.data.watchPaths, { dot: true })
  );
  if (!touchedCode.length) {
    return [];
  }

  const docPaths = new Set([
    index.path,
    ...screens.map((screen) => screen.path),
  ]);
  if (changedFiles.some((file) => docPaths.has(file))) {
    return [];
  }

  return [
    {
      level: "warning",
      code: "watchpaths-without-doc",
      file: index.path,
      flowId: index.data.flowId,
      message: `PR changes ${touchedCode.length} file(s) in watchPaths (${touchedCode.slice(0, 3).join(", ")}${touchedCode.length > 3 ? ", …" : ""}) without touching any doc of the flow`,
    },
  ];
}

export function analyze(ctx: Ctx, options: AnalyzeOptions = {}): Analysis {
  const project = loadProject(ctx);
  const issues: Issue[] = [...project.issues];
  const flows = knownFlows(ctx, project.indexes);
  const models: FlowModel[] = [];

  for (const file of project.orphanBodies) {
    issues.push({
      level: "warning",
      code: "orphan-body",
      file,
      message: `product text without a sibling ${path.basename(file).replace(BODY_FILE, ".periplus.ts")}; create the doc with \`periplus node\``,
    });
  }

  const flowIds = new Set(project.indexes.map((index) => index.data.flowId));
  for (const screen of project.screens) {
    if (!flowIds.has(screen.data.flowId)) {
      issues.push({
        level: "error",
        code: "unknown-flow",
        file: screen.path,
        flowId: screen.data.flowId,
        message: `flowId "${screen.data.flowId}" has no ${ctx.config.flowsDir}/<slug>/index.mdx; run \`periplus new\``,
      });
    }
  }

  const domains = Object.keys(ctx.config.domains);
  for (const index of project.indexes) {
    if (domains.length && !domains.includes(index.data.domain)) {
      issues.push({
        level: "error",
        code: "unknown-domain",
        file: index.path,
        flowId: index.data.flowId,
        message: `domain "${index.data.domain}" is not listed in domains of periplus.config.json (${domains.join(", ")})`,
      });
    }

    const screens = screensOfFlow(index, project.screens);
    const model = buildFlowModel(
      ctx,
      index,
      screens,
      flows,
      ctx.config.check.symmetry
    );
    models.push(model);
    issues.push(...model.issues);

    issues.push(
      ...checkCodeRefs(
        ctx,
        index.data.entry.triggers,
        index.path,
        index.data.flowId,
        undefined
      )
    );
    for (const screen of screens) {
      issues.push(...screenIssues(ctx, screen, index, options));
    }
    if (options.changedFiles?.length) {
      issues.push(...watchPathIssues(index, screens, options.changedFiles));
    }
  }

  return { project, models, issues };
}
