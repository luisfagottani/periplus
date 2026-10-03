import fs from "node:fs";
import path from "node:path";

import { analyze } from "../analyze.ts";
import { type Ctx, toRepoPath } from "../context.ts";
import { extractSuggestions, renderSuggestions } from "../suggest.ts";

export function runSuggest(ctx: Ctx, target: string | undefined): string {
  const folderAbs = path.resolve(ctx.cwd, target ?? ".");
  const resolvedFolder = fs.statSync(folderAbs).isDirectory()
    ? folderAbs
    : path.dirname(folderAbs);
  const folder = toRepoPath(ctx, resolvedFolder);
  const folderName = path.basename(resolvedFolder);
  const docPath = `${folder}/${folderName}.periplus.ts`;

  const analysis = analyze(ctx, { skipFingerprint: true });
  const screen = analysis.project.screens.find((s) => s.folder === folder);
  const model = screen
    ? analysis.models.find((m) => m.manifest.flow.flowId === screen.data.flowId)
    : undefined;

  const suggestions = extractSuggestions(ctx, folder, model?.manifest);
  const output = path.join(resolvedFolder, `${folderName}.periplus.suggest.md`);
  fs.writeFileSync(
    output,
    renderSuggestions(suggestions, model?.manifest, docPath)
  );
  return toRepoPath(ctx, output);
}
