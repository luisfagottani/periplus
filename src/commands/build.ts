import fs from "node:fs";
import path from "node:path";

import { type Analysis, analyze } from "../analyze.ts";
import { generateArtifacts, globalGeneratedDir } from "../codegen/index.ts";
import { type Ctx, flowsDirAbs, fromRepoPath, toRepoPath } from "../context.ts";
import { walkFiles, writeIfChanged } from "../fsutil.ts";
import { syncHubPages } from "../hub.ts";

export interface BuildResult {
  analysis: Analysis;
  written: string[];
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
