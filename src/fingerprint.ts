import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import micromatch from "micromatch";

import { type Ctx, fromRepoPath, toRepoPath } from "./context.ts";
import { type LoadedScreen, SCREEN_DOC_SUFFIX } from "./discover.ts";
import { walkFiles } from "./fsutil.ts";
import { BODY_SUFFIX } from "./tsdoc.ts";

/**
 * Code files that "belong" to a doc: the screen folder (recursive, without tests/styles)
 * plus `codePaths`. Subfolders with their own `*.periplus.ts` are excluded (they are another node),
 * and so are the docs themselves, otherwise `stamp` would change the hash it just wrote.
 */
export function codeFilesFor(
  ctx: Ctx,
  screen: Pick<LoadedScreen, "folder" | "data">
): string[] {
  const { include, exclude } = ctx.config.fingerprint;
  const folderAbs = fromRepoPath(ctx, screen.folder);

  const nestedDocFolders = walkFiles(folderAbs, (file) =>
    file.endsWith(SCREEN_DOC_SUFFIX)
  )
    .map((file) => path.dirname(file))
    .filter((dir) => dir !== folderAbs);

  const fromFolder = walkFiles(folderAbs, (file) => {
    if (nestedDocFolders.some((dir) => file.startsWith(`${dir}${path.sep}`))) {
      return false;
    }
    if (file.endsWith(SCREEN_DOC_SUFFIX) || file.endsWith(BODY_SUFFIX)) {
      return false;
    }
    const relative = path.relative(folderAbs, file).split(path.sep).join("/");
    return (
      micromatch.isMatch(relative, include) &&
      !micromatch.isMatch(relative, exclude)
    );
  }).map((file) => toRepoPath(ctx, file));

  const extra = screen.data.codePaths.flatMap((pattern) => {
    if (!micromatch.scan(pattern).isGlob) {
      return fs.existsSync(fromRepoPath(ctx, pattern)) ? [pattern] : [];
    }
    const base = micromatch.scan(pattern).base || ".";
    return walkFiles(fromRepoPath(ctx, base))
      .map((file) => toRepoPath(ctx, file))
      .filter((file) => micromatch.isMatch(file, pattern));
  });

  return [...new Set([...fromFolder, ...extra])].sort();
}

export function computeFingerprint(ctx: Ctx, files: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort()) {
    const content = fs
      .readFileSync(fromRepoPath(ctx, file), "utf8")
      .replace(/\r\n/g, "\n");
    hash.update(`${file}\n${content}\n\0`);
  }
  return `sha256:${hash.digest("hex").slice(0, 16)}`;
}

export function fingerprintOf(
  ctx: Ctx,
  screen: Pick<LoadedScreen, "folder" | "data">
): string {
  return computeFingerprint(ctx, codeFilesFor(ctx, screen));
}
