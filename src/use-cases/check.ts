import fs from "node:fs";
import path from "node:path";

import { analyze } from "../analyze.ts";
import type { Ctx } from "../context.ts";
import { type FailOn, shouldFail } from "../domain/report/fail.ts";
import { renderMarkdown } from "../domain/report/markdown.ts";
import {
  PLAIN_STYLE,
  type ReportStyle,
  renderCheckText,
} from "../domain/report/text.ts";
import type { Issue } from "../issues.ts";
import { runBuild } from "./build.ts";

const LIST_SEPARATOR = /[\s,]+/;

/** Options of {@link runCheck}. */
export interface CheckOptions {
  /** Threshold that turns the result into a failure. */
  failOn: FailOn;
  format: "text" | "markdown" | "json";
  /** Also write the report to this file (relative to `ctx.cwd`). */
  output?: string;
  /** Files changed in the PR; scopes some checks to what the PR touched. */
  changedFiles: string[];
  /** Colors for the `text` format. Ignored when `output` is set, so files never contain ANSI codes. */
  style?: ReportStyle;
}

/** Outcome of {@link runCheck}. */
export interface CheckResult {
  failed: boolean;
  /** Report in the requested format (ends without a newline for `text`). */
  report: string;
  issues: Issue[];
  /** Generated files that differ from a fresh build. */
  generatedStale: string[];
}

/**
 * Parses the `PERIPLUS_CHANGED` variable.
 *
 * @param raw - A JSON array or a whitespace/comma separated list.
 * @returns The non-empty file paths.
 * @example
 * parseChangedFiles('["a.ts","b.ts"]'); // ["a.ts", "b.ts"]
 * parseChangedFiles("a.ts b.ts");       // ["a.ts", "b.ts"]
 */
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

/**
 * Validates every doc and the committed `generated/` output.
 *
 * @param ctx - Project context.
 * @param options - Threshold, format and optional output file.
 * @returns Whether the check failed, plus the rendered report.
 */
export function runCheck(ctx: Ctx, options: CheckOptions): CheckResult {
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
    const style = options.output ? PLAIN_STYLE : options.style;
    report = renderCheckText(analysis.issues, generatedStale, style);
  }

  if (options.output) {
    const absolute = path.resolve(ctx.cwd, options.output);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, report);
  }

  return { failed, report, issues: analysis.issues, generatedStale };
}
