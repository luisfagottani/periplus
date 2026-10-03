import fs from "node:fs";
import path from "node:path";

import { type Ctx, fromRepoPath, today, toRepoPath } from "../context.ts";
import { type LoadedScreen, loadProject, resolveFlow } from "../discover.ts";
import { fingerprintOf } from "../fingerprint.ts";
import { setTopLevelStrings } from "../tsdoc.ts";

export interface StampOptions {
  files: string[];
  flow?: string;
  stale?: boolean;
}

/** Marks the doc as reviewed against the current code (`codeFingerprint` + `lastReviewed`). */
export function runStamp(ctx: Ctx, options: StampOptions): string[] {
  const project = loadProject(ctx);
  let targets: LoadedScreen[];

  if (options.files.length) {
    const wanted = new Set(
      options.files.map((file) => toRepoPath(ctx, path.resolve(ctx.cwd, file)))
    );
    targets = project.screens.filter(
      (screen) => wanted.has(screen.path) || wanted.has(screen.folder)
    );
    const found = new Set(targets.flatMap((t) => [t.path, t.folder]));
    const missing = [...wanted].filter((file) => !found.has(file));
    if (missing.length) {
      throw new Error(`doc(s) not found or invalid: ${missing.join(", ")}`);
    }
  } else if (options.flow) {
    const index = resolveFlow(project, options.flow);
    if (!index) {
      throw new Error(`flow "${options.flow}" not found`);
    }
    targets = project.screens.filter(
      (screen) => screen.data.flowId === index.data.flowId
    );
  } else if (options.stale) {
    targets = project.screens;
  } else {
    throw new Error("pass files, --flow <flow> or --stale");
  }

  const stamped: string[] = [];
  for (const screen of targets) {
    const fingerprint = fingerprintOf(ctx, screen);
    if (options.stale && screen.data.codeFingerprint === fingerprint) {
      continue;
    }

    const absolute = fromRepoPath(ctx, screen.path);
    const updated = setTopLevelStrings(fs.readFileSync(absolute, "utf8"), {
      lastReviewed: today(),
      codeFingerprint: fingerprint,
    });
    fs.writeFileSync(absolute, updated);
    stamped.push(screen.path);
  }

  return stamped;
}
