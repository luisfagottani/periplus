import fs from "node:fs";
import path from "node:path";

import type {
  CatalogFlow,
  FlowCatalog,
  FlowManifest,
  ManifestEdge,
  ManifestNode,
  ManifestScreen,
} from "./manifest";
import { loadProjectConfig, projectRoot } from "./project";

export { isExternalUrl } from "./links";
export type {
  CatalogFlow,
  FlowCatalog,
  FlowManifest,
  ManifestEdge,
  ManifestNode,
  ManifestScreen,
};

function catalogPath(): string {
  return `${loadProjectConfig().flowsDir ?? "flows"}/generated/flows.catalog.json`;
}

function readJson<T>(repoPath: string): T {
  const absolute = path.join(projectRoot(), repoPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `${repoPath} does not exist: run \`periplus build\` at the project root.`
    );
  }
  return JSON.parse(fs.readFileSync(absolute, "utf8")) as T;
}

let catalogCache: FlowCatalog | undefined;
const manifestCache = new Map<string, FlowManifest>();

export function loadCatalog(): FlowCatalog {
  catalogCache ??= readJson<FlowCatalog>(catalogPath());
  return catalogCache;
}

export function loadManifest(flowId: string): FlowManifest {
  const cached = manifestCache.get(flowId);
  if (cached) {
    return cached;
  }

  const entry = loadCatalog().flows.find((flow) => flow.flowId === flowId);
  if (!entry) {
    throw new Error(`Flow "${flowId}" is not in ${catalogPath()}`);
  }

  const manifest = readJson<FlowManifest>(entry.manifestPath);
  manifestCache.set(flowId, manifest);
  return manifest;
}

/** Base for code links (`repoUrl` from the config or `PUBLIC_REPO_URL`); empty omits the links. */
export function repoUrl(): string {
  return import.meta.env.PUBLIC_REPO_URL || loadProjectConfig().repoUrl || "";
}

const TRAILING_SLASH = /\/$/;

export function repoFileUrl(file: string): string | undefined {
  const base = repoUrl();
  return base ? `${base.replace(TRAILING_SLASH, "")}/${file}` : undefined;
}

/** Frontmatter text → safe HTML, with `snippets` in `<code>`. */
export function inlineCode(text: string | undefined): string {
  if (!text) {
    return "";
  }
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return escaped.replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function domainLabel(domain: string): string {
  return loadCatalog().domains.find((d) => d.id === domain)?.label ?? domain;
}

export const STATUS_LABELS: Record<CatalogFlow["status"], string> = {
  active: "active",
  wip: "work in progress",
  deprecated: "deprecated",
};

export function flowHref(flow: Pick<CatalogFlow, "domain" | "slug">): string {
  return `/flows/${flow.domain}/${flow.slug}/`;
}

export function screenHref(
  flow: Pick<CatalogFlow, "domain" | "slug">,
  pageSlug: string
): string {
  return `${flowHref(flow)}${pageSlug}/`;
}

/** Link for a node: screen page (with branch anchor), target flow page or nothing. */
export function nodeHref(
  manifest: FlowManifest,
  node: ManifestNode | undefined
): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.kind === "screen" && node.pageSlug) {
    return `${screenHref(manifest.flow, node.pageSlug)}#${branchAnchor(node.branchId ?? "default")}`;
  }
  if (node.kind === "flow" && node.targetFlowId) {
    return externalFlowHref(node.targetFlowId);
  }
  return undefined;
}

/** Flow page in the hub, or `docUrl` from `externalFlows` when the flow is not documented here. */
export function externalFlowHref(flowId: string): string | undefined {
  const catalog = loadCatalog();
  const documented = catalog.flows.find((flow) => flow.flowId === flowId);
  if (documented) {
    return flowHref(documented);
  }
  return catalog.externalFlows.find((flow) => flow.flowId === flowId)?.docUrl;
}

export function branchAnchor(branchId: string): string {
  return `branch-${branchId}`;
}

export function nodesById(manifest: FlowManifest): Map<string, ManifestNode> {
  return new Map(manifest.nodes.map((node) => [node.id, node]));
}

export interface Link {
  edge: ManifestEdge;
  node?: ManifestNode;
  href?: string;
}

export function linksOf(
  manifest: FlowManifest,
  nodeId: string
): { incoming: Link[]; outgoing: Link[] } {
  const byId = nodesById(manifest);
  const toLink = (edge: ManifestEdge, otherId: string): Link => {
    const node = byId.get(otherId);
    return { edge, node, href: nodeHref(manifest, node) };
  };
  return {
    incoming: manifest.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => toLink(edge, edge.source)),
    outgoing: manifest.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => toLink(edge, edge.target)),
  };
}

export function nodeDisplayName(
  node: ManifestNode | undefined,
  fallbackId: string
): string {
  if (!node) {
    return fallbackId;
  }
  if (node.kind === "entry") {
    return "Flow entry";
  }
  if (node.kind === "flow") {
    return `Flow: ${node.label}`;
  }
  if (node.kind === "outcome") {
    return node.outcome === "end"
      ? `End — ${node.label}`
      : `Error — ${node.label}`;
  }
  return node.label;
}

/** Serializable payload for the graph (React island), including server-resolved hrefs. */
export type NodeRole = "start" | "end";

export interface GraphPayload {
  title: string;
  /** `role` only exists in a single-flow map; the overview map has no start/end. */
  nodes: Array<
    ManifestNode & { href?: string; role?: NodeRole; hasOutgoing?: boolean }
  >;
  edges: ManifestEdge[];
}

const FLOW_SOURCE_PREFIX = "flow-in:";

/**
 * Single-flow map with start and end roles. An external flow that is the source of some screen
 * becomes a separate start card (`flow-in:<id>`), and `flow:<id>` stays only as a target,
 * so no card is both start and end.
 */
export function toGraphPayload(manifest: FlowManifest): GraphPayload {
  const flowNodes = new Map(
    manifest.nodes
      .filter((node) => node.kind === "flow")
      .map((node) => [node.id, node])
  );
  const edges = manifest.edges.map((edge) =>
    flowNodes.has(edge.source)
      ? { ...edge, source: `${FLOW_SOURCE_PREFIX}${edge.source}` }
      : edge
  );
  const hasOutgoing = new Set(edges.map((edge) => edge.source));
  const hasIncoming = new Set(edges.map((edge) => edge.target));
  const nodes: GraphPayload["nodes"] = [];
  for (const node of manifest.nodes) {
    const href = nodeHref(manifest, node);
    if (node.kind !== "flow") {
      /* End: declared in the doc (`final: true`) or with no exits at all. Exiting to another flow is not enough,
         because the journey may continue there (e.g. the last form step continues into checkout). */
      const role =
        node.kind === "entry"
          ? "start"
          : node.final || !hasOutgoing.has(node.id)
            ? "end"
            : undefined;
      nodes.push({
        ...node,
        href,
        role,
        hasOutgoing: hasOutgoing.has(node.id),
      });
      continue;
    }
    const sourceId = `${FLOW_SOURCE_PREFIX}${node.id}`;
    if (hasOutgoing.has(sourceId)) {
      nodes.push({
        ...node,
        id: sourceId,
        label: `Comes from: ${node.label}`,
        href,
        role: "start",
        hasOutgoing: true,
      });
    }
    if (hasIncoming.has(node.id)) {
      nodes.push({
        ...node,
        label: `Continues in: ${node.label}`,
        href,
        role: "end",
        hasOutgoing: false,
      });
    }
  }

  return { title: manifest.flow.title, nodes, edges };
}

/** Overview map: one node per flow (documented or external) and one edge per link between flows. */
export function overviewPayload(): GraphPayload {
  const catalog = loadCatalog();
  const used = new Set(
    catalog.crossLinks.flatMap((link) => [link.from, link.to])
  );

  const nodes: GraphPayload["nodes"] = [
    ...catalog.flows.map((flow) => ({
      id: flow.flowId,
      kind: "screen" as const,
      type: "screen" as const,
      label: flow.title,
      summary: `${domainLabel(flow.domain)} · ${STATUS_LABELS[flow.status]} · ${flow.screens.length} screen(s)`,
      wip: flow.status === "wip",
      href: flowHref(flow),
      rules: [],
      apis: [],
      notes: [],
    })),
    ...catalog.externalFlows
      .filter((flow) => used.has(flow.flowId))
      .map((flow) => ({
        id: flow.flowId,
        kind: "flow" as const,
        label: flow.title,
        targetFlowId: flow.flowId,
        targetDocumented: false,
        href: flow.docUrl,
        summary: flow.note,
        rules: [],
        apis: [],
        notes: [],
      })),
  ];

  const edges: ManifestEdge[] = catalog.crossLinks.map((link) => ({
    id: `${link.from}->${link.to}`,
    kind: "flow",
    source: link.from,
    target: link.to,
    reason: link.reasons.join(" · "),
  }));

  return { title: "Mapa geral", nodes, edges };
}
