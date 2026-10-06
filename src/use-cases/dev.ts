import fs from "node:fs";

import { type Ctx, flowsDirAbs, fromRepoPath } from "../context.ts";
import type { Issue } from "../issues.ts";
import { runBuild } from "./build.ts";

const REBUILD_DEBOUNCE_MS = 150;

/** Result of one rebuild triggered by `periplus dev`. */
export interface DevRebuild {
  /** What triggered it: `"initial build"` or the saved file name. */
  reason: string;
  durationMs: number;
  /** Files written or removed. */
  changed: string[];
  issues: Issue[];
  /** Set when the build threw (e.g. invalid config); the watcher keeps running. */
  error?: Error;
}

/** Callbacks and timing of {@link runDev}. */
export interface DevOptions {
  onRebuild: (rebuild: DevRebuild) => void;
  /** Quiet period before rebuilding after a save (default 150 ms). */
  debounceMs?: number;
}

/** Handle returned by {@link runDev}. */
export interface DevWatcher {
  /** Absolute directories being watched. */
  dirs: string[];
  /** Stops watching. */
  close: () => void;
}

/**
 * Whether a changed file should trigger a rebuild: docs and flow roots, never generated output.
 *
 * @param name - Path relative to the watched directory.
 */
export function isWatchedDocFile(name: string): boolean {
  if (name.includes("generated")) {
    return false;
  }
  return (
    name.endsWith(".periplus.ts") ||
    name.endsWith(".periplus.mdx") ||
    name.endsWith("index.mdx")
  );
}

/**
 * Runs one full build (including site pages) and reports what changed, without throwing.
 *
 * @param ctx - Project context.
 * @param reason - Label for the trigger, echoed back in the result.
 */
export function rebuildOnce(ctx: Ctx, reason: string): DevRebuild {
  const started = Date.now();
  try {
    const result = runBuild(ctx, { hub: true });
    return {
      reason,
      durationMs: Date.now() - started,
      changed: [...result.written, ...result.removed],
      issues: result.analysis.issues,
    };
  } catch (error) {
    return {
      reason,
      durationMs: Date.now() - started,
      changed: [],
      issues: [],
      error: error as Error,
    };
  }
}

/**
 * `remix dev`-style watch: builds once, then rebuilds whenever a `.periplus.ts`, `.periplus.mdx`
 * or `index.mdx` is saved under the scan roots or the flows folder.
 *
 * @param ctx - Project context.
 * @param options - Rebuild callback and debounce.
 * @returns The watched directories and a `close` function.
 */
export function runDev(ctx: Ctx, options: DevOptions): DevWatcher {
  options.onRebuild(rebuildOnce(ctx, "initial build"));

  let timer: NodeJS.Timeout | undefined;
  const schedule = (file: string) => {
    clearTimeout(timer);
    timer = setTimeout(
      () => options.onRebuild(rebuildOnce(ctx, file)),
      options.debounceMs ?? REBUILD_DEBOUNCE_MS
    );
  };

  const dirs = [
    ...ctx.config.scanRoots.map((root) => fromRepoPath(ctx, root)),
    flowsDirAbs(ctx),
  ].filter((dir) => fs.existsSync(dir));

  const watchers = dirs.map((dir) =>
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (filename && isWatchedDocFile(filename.toString())) {
        schedule(filename.toString());
      }
    })
  );

  return {
    dirs,
    close: () => {
      clearTimeout(timer);
      for (const watcher of watchers) {
        watcher.close();
      }
    },
  };
}
