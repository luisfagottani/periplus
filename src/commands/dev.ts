import fs from "node:fs";

import { type Ctx, flowsDirAbs, fromRepoPath } from "../context.ts";
import { renderText } from "../report.ts";
import { runBuild } from "./build.ts";

function rebuild(ctx: Ctx, reason: string) {
  const started = Date.now();
  try {
    const result = runBuild(ctx, { hub: true });
    const { issues } = result.analysis;
    const changed = result.written.length + result.removed.length;
    console.log(
      `\n[periplus] ${reason} → ${changed} arquivo(s) gerado(s) em ${Date.now() - started}ms` +
        (changed
          ? `\n  ${[...result.written, ...result.removed].join("\n  ")}`
          : "")
    );
    if (issues.length) {
      console.log(renderText(issues));
    }
  } catch (error) {
    console.error(`[periplus] error: ${(error as Error).message}`);
  }
}

/** `remix dev`-style watch: saving a `.periplus.ts`/`.periplus.mdx` regenerates types, manifests, context and pages. */
export function runDev(ctx: Ctx): void {
  rebuild(ctx, "initial build");

  let timer: NodeJS.Timeout | undefined;
  const schedule = (file: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(ctx, file), 150);
  };

  const dirs = [
    ...ctx.config.scanRoots.map((root) => fromRepoPath(ctx, root)),
    flowsDirAbs(ctx),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }
    fs.watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename) {
        return;
      }
      const name = filename.toString();
      if (name.includes("generated")) {
        return;
      }
      if (
        name.endsWith(".periplus.ts") ||
        name.endsWith(".periplus.mdx") ||
        name.endsWith("index.mdx")
      ) {
        schedule(name);
      }
    });
  }

  console.log(
    `[periplus] watching ${dirs.length} director(ies). Ctrl+C to exit.`
  );
}
