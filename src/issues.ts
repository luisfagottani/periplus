export type IssueLevel = "error" | "warning";

export type IssueCode =
  | "invalid-doc"
  | "duplicate-flow"
  | "unknown-flow"
  | "unknown-domain"
  | "outside-module-root"
  | "file-name"
  | "orphan-body"
  | "missing-component"
  | "missing-file"
  | "duplicate-node"
  | "duplicate-rule"
  | "unknown-target"
  | "unknown-source"
  | "unknown-external-flow"
  | "dead-end"
  | "orphan-node"
  | "missing-error-path"
  | "no-entry"
  | "symmetry"
  | "missing-fingerprint"
  | "stale"
  | "watchpaths-without-doc";

export interface Issue {
  level: IssueLevel;
  code: IssueCode;
  message: string;
  file?: string;
  flowId?: string;
  nodeId?: string;
}

export const STALE_CODES: ReadonlySet<IssueCode> = new Set([
  "stale",
  "missing-fingerprint",
  "watchpaths-without-doc",
]);
