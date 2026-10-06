import { type Issue, STALE_CODES } from "../../issues.ts";
import { sortIssues } from "./fail.ts";

/** Hidden marker that lets CI find and update its previous PR comment. */
export const PR_COMMENT_MARKER = "<!-- periplus-check -->";

/** Inputs besides the issues that shape the Markdown report. */
export interface MarkdownReportOptions {
  /** Whether the check failed for the chosen `--fail-on` threshold. */
  failed: boolean;
  /** Generated files that differ from a fresh build. */
  generatedStale?: string[];
}

/**
 * Renders the check result as a GitHub-flavored Markdown PR comment.
 * Never contains ANSI codes, so it is safe to post or write to a file.
 *
 * @param issues - Issues found by the analysis.
 * @param options - Failure status and stale generated files.
 * @returns Markdown ending with a newline, starting with {@link PR_COMMENT_MARKER}.
 */
export function renderMarkdown(
  issues: Issue[],
  options: MarkdownReportOptions
): string {
  const errors = issues.filter((i) => i.level === "error");
  const stale = issues.filter(
    (i) => i.level === "warning" && STALE_CODES.has(i.code)
  );
  const warnings = issues.filter(
    (i) => i.level === "warning" && !STALE_CODES.has(i.code)
  );
  const generatedStale = options.generatedStale ?? [];

  const lines = [PR_COMMENT_MARKER, "### periplus — flow docs", ""];

  if (!(issues.length || generatedStale.length)) {
    lines.push(
      "No issues: docs are valid, links are consistent and nothing is stale."
    );
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    `${options.failed ? "**Failed**" : "Passed with warnings"} — ${errors.length} error(s), ${stale.length} doc(s) to review, ${warnings.length} warning(s).`
  );
  lines.push("");

  const table = (title: string, list: Issue[]) => {
    if (!list.length) {
      return;
    }
    lines.push(`#### ${title}`);
    lines.push("");
    lines.push("| File | Node | Issue |");
    lines.push("| --- | --- | --- |");
    for (const issue of sortIssues(list)) {
      const message = issue.message.replace(/\|/g, "\\|");
      lines.push(
        `| \`${issue.file ?? "-"}\` | ${issue.nodeId ? `\`${issue.nodeId}\`` : "-"} | **${issue.code}** ${message} |`
      );
    }
    lines.push("");
  };

  table("Errors", errors);
  table("Stale docs (code changed after the last review)", stale);
  table("Warnings", warnings);

  if (generatedStale.length) {
    lines.push("#### Stale generated artifacts");
    lines.push("");
    lines.push("Run `periplus build` and commit:");
    lines.push("");
    for (const file of generatedStale) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  lines.push(
    "<sub>Reviewed the doc? `periplus stamp <file>` updates `codeFingerprint` and `lastReviewed`.</sub>"
  );
  return `${lines.join("\n")}\n`;
}
