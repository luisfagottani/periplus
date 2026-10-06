import fs from "node:fs";
import path from "node:path";

import { type Analysis, analyze } from "../analyze.ts";
import { generateArtifacts, globalGeneratedDir } from "../codegen/index.ts";
import { type Ctx, flowsDirAbs, fromRepoPath, toRepoPath } from "../context.ts";
import { syncHubPages } from "../hub.ts";
import { walkFiles, writeIfChanged } from "../utils/fsutil.ts";

/** Outcome of {@link runBuild}. Paths are relative to the repository root. */
export interface BuildResult {
  analysis: Analysis;
  /** Files created or rewritten (always empty in `check` mode). */
  written: string[];
  /** Orphan generated files deleted (always empty in `check` mode). */
  removed: string[];
  /** Only in `check` mode: files that would change if the build ran. */
  stale: string[];
}

function existingGeneratedFiles(ctx: Ctx): string[] {
  const flowsDir = flowsDirAbs(ctx);
  if (!fs.existsSync(flowsDir)) {
    return [];
  }

  const dirs = [
    fromRepoPath(ctx, globalGeneratedDir(ctx)),
    ...fs
      .readdirSync(flowsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "generated")
      .map((entry) => path.join(flowsDir, entry.name, "generated")),
  ];

  return dirs
    .flatMap((dir) => walkFiles(dir))
    .map((file) => toRepoPath(ctx, file));
}

/**
 * Generates manifests, types, catalog, `flow.context.md`, Mermaid diagrams and, unless
 * `hub` is `false`, the site pages. Only files whose content changed are written.
 *
 * @param ctx - Project context.
 * @param options.check - Compare with a fresh build without writing; fills `stale`.
 * @param options.hub - Also sync the site pages (default `true` when the config has `hubDir`).
 * @returns What was written, removed or would change.
 */
export function runBuild(
  ctx: Ctx,
  options: { check?: boolean; hub?: boolean } = {}
): BuildResult {
  const analysis = analyze(ctx, { skipFingerprint: true });
  const artifacts = generateArtifacts(ctx, analysis);
  const orphans = existingGeneratedFiles(ctx).filter(
    (file) => !artifacts.has(file)
  );

  if (options.check) {
    const stale = [...artifacts.entries()]
      .filter(([file, content]) => {
        const absolute = fromRepoPath(ctx, file);
        return (
          !fs.existsSync(absolute) ||
          fs.readFileSync(absolute, "utf8") !== content
        );
      })
      .map(([file]) => file);
    return {
      analysis,
      written: [],
      removed: [],
      stale: [...stale, ...orphans].sort(),
    };
  }

  const written = [...artifacts.entries()]
    .filter(([file, content]) =>
      writeIfChanged(fromRepoPath(ctx, file), content)
    )
    .map(([file]) => file);

  for (const file of orphans) {
    fs.rmSync(fromRepoPath(ctx, file));
  }

  if (options.hub !== false) {
    const hub = syncHubPages(
      ctx,
      analysis.models.map((model) => model.manifest)
    );
    written.push(...hub.written);
    orphans.push(...hub.removed);
  }

  return { analysis, written, removed: orphans, stale: [] };
}
