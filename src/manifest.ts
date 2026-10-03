import type {
  Api,
  CodeRef,
  FlowIndex,
  Outcome,
  Rule,
  ScreenType,
} from "./schema.ts";

/**
 * Contract between the CLI and its consumers (Starlight, MCP, AI).
 * Only contains what is derived from the docs, nothing that changes when only the code changes,
 * so `build --check` never reports a diff without a documentation edit.
 */
export type ManifestNodeKind = "entry" | "screen" | "flow" | "outcome";
export type ManifestEdgeKind = "nav" | "entry" | "flow" | "outcome";

export interface ManifestNode {
  id: string;
  kind: ManifestNodeKind;
  label: string;
  type?: ScreenType;
  outcome?: Outcome;
  summary?: string;
  screenRef?: string;
  branchId?: string;
  /** Colocated doc (relative to the repo root). */
  docPath?: string;
  /** Component folder in the code. */
  folder?: string;
  /** Starlight page slug (relative to the flow folder). */
  pageSlug?: string;
  /** Target flow when `kind = flow`. */
  targetFlowId?: string;
  targetDocumented?: boolean;
  targetProject?: string;
  wip?: boolean;
  /** End of the journey declared in the doc (`branches[].final`). */
  final?: boolean;
  rules: Rule[];
  apis: Api[];
  notes: string[];
}

export interface ManifestEdge {
  id: string;
  kind: ManifestEdgeKind;
  source: string;
  target: string;
  reason: string;
  ux?: string;
}

export interface ManifestScreen {
  screenRef: string;
  title: string;
  docPath: string;
  folder: string;
  pageSlug: string;
  type: ScreenType;
  lastReviewed?: string;
  nodeIds: string[];
  body: string;
}

export interface FlowManifest {
  version: 1;
  generatedBy: "periplus";
  project: string;
  flow: {
    flowId: string;
    slug: string;
    title: string;
    domain: FlowIndex["domain"];
    status: FlowIndex["status"];
    moduleRoot: string;
    include: string[];
    lastReviewed?: string;
    owners: string[];
    watchPaths: string[];
    entry: { summary: string; productSummary?: string; triggers: CodeRef[] };
    indexPath: string;
    body: string;
  };
  screens: ManifestScreen[];
  nodes: ManifestNode[];
  edges: ManifestEdge[];
}

export interface CatalogFlow {
  flowId: string;
  slug: string;
  title: string;
  domain: FlowIndex["domain"];
  status: FlowIndex["status"];
  moduleRoot: string;
  manifestPath: string;
  screens: Array<{ screenRef: string; title: string; pageSlug: string }>;
}

export interface CatalogCrossLink {
  from: string;
  to: string;
  reasons: string[];
}

export interface FlowCatalog {
  version: 1;
  generatedBy: "periplus";
  project: string;
  /** Domains in config order; includes those used by flows even without a configured label. */
  domains: Array<{ id: string; label: string }>;
  flows: CatalogFlow[];
  externalFlows: Array<{
    flowId: string;
    title: string;
    project?: string;
    note?: string;
    docUrl?: string;
  }>;
  crossLinks: CatalogCrossLink[];
}
