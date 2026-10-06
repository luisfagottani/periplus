import type { Issue } from "../../issues.ts";
import { sortIssues } from "./fail.ts";

/**
 * Styles the text report can apply. The CLI theme satisfies it structurally,
 * which keeps this module free of terminal concerns.
 */
export interface ReportStyle {
  error: (text: string) => string;
  warn: (text: string) => string;
  success: (text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
  code: (text: string) => string;
}

const identity = (text: string) => text;

/** Style that leaves text untouched (files, pipes, `--output`). */
export const PLAIN_STYLE: ReportStyle = {
  error: identity,
  warn: identity,
  success: identity,
  dim: identity,
  bold: identity,
  code: identity,
};

/**
 * Renders issues as a human-readable list followed by a summary line.
 *
 * @param issues - Issues found by the analysis.
 * @param style - Optional colors; defaults to {@link PLAIN_STYLE}.
 * @returns Multi-line text without a trailing newline.
 * @example
 * renderText([]); // "✓ periplus: no issues found."
 */
export function renderText(
  issues: Issue[],
  style: ReportStyle = PLAIN_STYLE
): string {
  if (!issues.length) {
    return `${style.success("✓")} periplus: no issues found.`;
  }

  const lines = sortIssues(issues).map((issue) => {
    const isError = issue.level === "error";
    const icon = isError ? style.error("✗") : style.warn("!");
    const code = (isError ? style.error : style.warn)(`[${issue.code}]`);
    const where = [issue.file, issue.nodeId].filter(Boolean).join(" · ");
    return `${icon} ${code} ${where ? `${style.dim(`${where}:`)} ` : ""}${issue.message}`;
  });

  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.length - errors;
  lines.push("");
  lines.push(
    `${(errors ? style.error : identity)(`${errors} error(s)`)}, ${(warnings ? style.warn : identity)(`${warnings} warning(s)`)}.`
  );
  return lines.join("\n");
}

/**
 * Text report for `periplus check`: the issue list plus stale generated artifacts, if any.
 *
 * @param issues - Issues found by the analysis.
 * @param generatedStale - Generated files that differ from a fresh build.
 * @param style - Optional colors; defaults to {@link PLAIN_STYLE}.
 * @returns Multi-line text without a trailing newline.
 */
export function renderCheckText(
  issues: Issue[],
  generatedStale: string[],
  style: ReportStyle = PLAIN_STYLE
): string {
  let report = renderText(issues, style);
  if (generatedStale.length) {
    report += `\n\n${style.error("✗")} stale generated artifacts; run \`${style.code("periplus build")}\`:\n${generatedStale.map((file) => `  - ${file}`).join("\n")}`;
  }
  return report;
}
