import { type Issue, STALE_CODES } from "./issues.ts";

export type FailOn = "error" | "stale" | "warning";

export const PR_COMMENT_MARKER = "<!-- periplus-check -->";

const LEVEL_RANK: Record<Issue["level"], number> = { error: 0, warning: 1 };

export function shouldFail(issues: Issue[], failOn: FailOn): boolean {
  return issues.some((issue) => {
    if (issue.level === "error") {
      return true;
    }
    if (failOn === "warning") {
      return true;
    }
    return failOn === "stale" && STALE_CODES.has(issue.code);
  });
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      a.code.localeCompare(b.code)
  );
}

export function renderText(issues: Issue[]): string {
  if (!issues.length) {
    return "✓ periplus: no issues found.";
  }

  const lines = sortIssues(issues).map((issue) => {
    const icon = issue.level === "error" ? "✗" : "!";
    const where = [issue.file, issue.nodeId].filter(Boolean).join(" · ");
    return `${icon} [${issue.code}] ${where ? `${where}: ` : ""}${issue.message}`;
  });

  const errors = issues.filter((i) => i.level === "error").length;
  lines.push("");
  lines.push(`${errors} error(s), ${issues.length - errors} warning(s).`);
  return lines.join("\n");
}

export function renderMarkdown(
  issues: Issue[],
  options: { failed: boolean; generatedStale?: string[] }
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
