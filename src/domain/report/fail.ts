import { type Issue, STALE_CODES } from "../../issues.ts";

/** Lowest issue severity that makes `periplus check` exit with a failure. */
export type FailOn = "error" | "stale" | "warning";

/** Every accepted `--fail-on` value, in increasing strictness. */
export const FAIL_ON_VALUES: readonly FailOn[] = ["error", "stale", "warning"];

const LEVEL_RANK: Record<Issue["level"], number> = { error: 0, warning: 1 };

/**
 * Whether `issues` should fail the check for the given threshold.
 * Errors always fail; `stale` adds stale-doc warnings; `warning` fails on any warning.
 *
 * @param issues - Issues found by the analysis.
 * @param failOn - Threshold chosen with `--fail-on`.
 * @returns `true` when the command must exit with a non-zero code.
 */
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

/**
 * Sorts issues for display: errors first, then by file and code.
 *
 * @param issues - Issues in any order (the input is not mutated).
 * @returns A new, sorted array.
 */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) =>
      LEVEL_RANK[a.level] - LEVEL_RANK[b.level] ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      a.code.localeCompare(b.code)
  );
}
