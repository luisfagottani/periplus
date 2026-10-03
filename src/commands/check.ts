import fs from "node:fs";
import path from "node:path";

import { analyze } from "../analyze.ts";
import type { Ctx } from "../context.ts";
import {
  type FailOn,
  renderMarkdown,
  renderText,
  shouldFail,
} from "../report.ts";
import { runBuild } from "./build.ts";

const LIST_SEPARATOR = /[\s,]+/;

export interface CheckOptions {
  failOn: FailOn;
  format: "text" | "markdown" | "json";
  output?: string;
  changedFiles: string[];
}

export function parseChangedFiles(raw: string | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    return (JSON.parse(trimmed) as string[]).filter(Boolean);
  }
  return trimmed.split(LIST_SEPARATOR).filter(Boolean);
}

export function runCheck(
  ctx: Ctx,
  options: CheckOptions
): { failed: boolean; report: string } {
  const analysis = analyze(ctx, { changedFiles: options.changedFiles });
  const generatedStale = runBuild(ctx, { check: true }).stale;
  const failed =
    shouldFail(analysis.issues, options.failOn) || generatedStale.length > 0;

  let report: string;
  if (options.format === "json") {
    report = `${JSON.stringify({ failed, issues: analysis.issues, generatedStale }, null, 2)}\n`;
  } else if (options.format === "markdown") {
    report = renderMarkdown(analysis.issues, { failed, generatedStale });
  } else {
    report = renderText(analysis.issues);
    if (generatedStale.length) {
      report += `\n\n✗ stale generated artifacts; run \`periplus build\`:\n${generatedStale.map((f) => `  - ${f}`).join("\n")}`;
    }
  }

  if (options.output) {
    const absolute = path.resolve(ctx.cwd, options.output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, report);
  }

  return { failed, report };
}
