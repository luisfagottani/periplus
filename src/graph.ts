import type { Ctx } from "./context.ts";
import type { LoadedIndex, LoadedScreen } from "./discover.ts";
import { kebab } from "./fsutil.ts";
import type { Issue } from "./issues.ts";
import type {
  FlowManifest,
  ManifestEdge,
  ManifestNode,
  ManifestScreen,
} from "./manifest.ts";
import { normalizeLinkRef, type ScreenType } from "./schema.ts";

export const ENTRY_NODE_ID = "flow:entry";

export type KnownFlows = Map<
  string,
  { title: string; documented: boolean; project?: string }
>;

export function knownFlows(ctx: Ctx, indexes: LoadedIndex[]): KnownFlows {
  const map: KnownFlows = new Map();
  for (const index of indexes) {
    map.set(index.data.flowId, {
      title: index.data.title,
      documented: true,
      project: ctx.config.project,
    });
  }
  for (const [flowId, ext] of Object.entries(ctx.config.externalFlows)) {
    if (!map.has(flowId)) {
      map.set(flowId, {
        title: ext.title,
        documented: false,
        project: ext.project,
      });
    }
  }
  return map;
}

export function nodeIdOf(screenRef: string, branchId: string): string {
  return `${screenRef}:${branchId}`;
}

export function screenPageSlug(screenRef: string): string {
  return kebab(screenRef);
}

export function screenTitle(screen: LoadedScreen): string {
  return (
    screen.data.title ??
    (screen.data.branches.length === 1
      ? screen.data.branches[0].label
      : screen.screenRef)
  );
}

function closest(target: string, candidates: string[]): string[] {
  const [screenRef] = target.split(":");
  const lower = screenRef.toLowerCase();
  return candidates
    .filter(
      (id) =>
        id.toLowerCase().startsWith(lower) || id.toLowerCase().includes(lower)
    )
    .slice(0, 4);
}

export interface FlowModel {
  manifest: FlowManifest;
  issues: Issue[];
}

/** Builds nodes and edges from `outgoing` and `incoming`. Never reads the MDX body or the code. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single pass that builds nodes, edges and issues together
export function buildFlowModel(
  ctx: Ctx,
  index: LoadedIndex,
  screens: LoadedScreen[],
  flows: KnownFlows,
  symmetry: "off" | "warn" | "error"
): FlowModel {
  const { flowId } = index.data;
  const issues: Issue[] = [];
  const nodes: ManifestNode[] = [];
  const edges: ManifestEdge[] = [];
  const manifestScreens: ManifestScreen[] = [];

  nodes.push({
    id: ENTRY_NODE_ID,
    kind: "entry",
    label: "Entry",
    summary: index.data.entry.summary,
    rules: [],
    apis: [],
    notes: [],
  });

  interface Owned {
    screen: LoadedScreen;
    branchIndex: number;
    type: ScreenType;
  }
  const owners = new Map<string, Owned>();
  const ruleOwners = new Map<string, string>();

  const ordered = [...screens].sort((a, b) => a.path.localeCompare(b.path));

  for (const screen of ordered) {
    const nodeIds: string[] = [];

    screen.data.branches.forEach((branch, branchIndex) => {
      const id = nodeIdOf(screen.screenRef, branch.branchId);
      const previous = owners.get(id);
      if (previous) {
        issues.push({
          level: "error",
          code: "duplicate-node",
          file: screen.path,
          flowId,
          nodeId: id,
          message: `node "${id}" already exists in ${previous.screen.path}; use a different \`screenRef\``,
        });
        return;
      }

      const type = branch.type ?? screen.data.type;
      owners.set(id, { screen, branchIndex, type });
      nodeIds.push(id);

      for (const rule of branch.rules) {
        const owner = ruleOwners.get(rule.id);
        if (owner) {
          issues.push({
            level: "error",
            code: "duplicate-rule",
            file: screen.path,
            flowId,
            nodeId: id,
            message: `rule "${rule.id}" is already declared in ${owner}`,
          });
        }
        ruleOwners.set(rule.id, id);
      }

      nodes.push({
        id,
        kind: "screen",
        label: branch.label,
        type,
        summary: branch.summary,
        screenRef: screen.screenRef,
        branchId: branch.branchId,
        docPath: screen.path,
        folder: screen.folder,
        pageSlug: screenPageSlug(screen.screenRef),
        wip: branch.wip,
        final: branch.final,
        rules: branch.rules,
        apis: branch.apis,
        notes: branch.notes,
      });
    });

    manifestScreens.push({
      screenRef: screen.screenRef,
      title: screenTitle(screen),
      docPath: screen.path,
      folder: screen.folder,
      pageSlug: screenPageSlug(screen.screenRef),
      type: screen.data.type,
      lastReviewed: screen.data.lastReviewed,
      nodeIds,
      body: screen.body,
    });
  }

  const screenNodeIds = [...owners.keys()];
  const externalNodes = new Map<string, ManifestNode>();

  const ensureFlowNode = (
    ref: string,
    file: string,
    nodeId: string
  ): string | undefined => {
    const targetFlowId = ref.slice("flow:".length);
    const known = flows.get(targetFlowId);
    if (!known) {
      issues.push({
        level: "error",
        code: "unknown-external-flow",
        file,
        flowId,
        nodeId,
        message: `"${ref}" is neither a documented flow nor listed in externalFlows of periplus.config.json`,
      });
      return undefined;
    }
    if (!externalNodes.has(ref)) {
      externalNodes.set(ref, {
        id: ref,
        kind: "flow",
        label: known.title,
        targetFlowId,
        targetDocumented: known.documented,
        targetProject: known.project,
        rules: [],
        apis: [],
        notes: [],
      });
    }
    return ref;
  };

  const edgeIds = new Set<string>();
  const addEdge = (edge: Omit<ManifestEdge, "id">) => {
    const base = `${edge.source}->${edge.target}`;
    let id = base;
    for (let n = 2; edgeIds.has(id); n += 1) {
      id = `${base}#${n}`;
    }
    edgeIds.add(id);
    edges.push({ id, ...edge });
  };

  const navPairs = new Set<string>();
  const declaredIncoming = new Set<string>();

  for (const [id, { screen, branchIndex }] of owners) {
    const branch = screen.data.branches[branchIndex];
    let outcomeCount = 0;

    for (const exit of branch.outgoing) {
      if (exit.outcome) {
        outcomeCount += 1;
        const terminalId = `${id}::${exit.outcome}${outcomeCount > 1 ? `-${outcomeCount}` : ""}`;
        nodes.push({
          id: terminalId,
          kind: "outcome",
          outcome: exit.outcome,
          label:
            exit.ux ?? (exit.outcome === "error" ? "Error" : "End of flow"),
          rules: [],
          apis: [],
          notes: [],
        });
        addEdge({
          kind: "outcome",
          source: id,
          target: terminalId,
          reason: exit.reason,
          ux: exit.ux,
        });
        continue;
      }

      const target = normalizeLinkRef(exit.to as string);

      if (target.startsWith("flow:")) {
        if (target === ENTRY_NODE_ID) {
          addEdge({
            kind: "nav",
            source: id,
            target,
            reason: exit.reason,
            ux: exit.ux,
          });
          continue;
        }
        const flowNode = ensureFlowNode(target, screen.path, id);
        if (flowNode) {
          addEdge({
            kind: "flow",
            source: id,
            target: flowNode,
            reason: exit.reason,
            ux: exit.ux,
          });
        }
        continue;
      }

      if (!owners.has(target)) {
        const hint = closest(target, screenNodeIds);
        issues.push({
          level: "error",
          code: "unknown-target",
          file: screen.path,
          flowId,
          nodeId: id,
          message: `exit to "${exit.to}" does not exist in this flow${hint.length ? ` (did you mean ${hint.join(", ")}?)` : ""}`,
        });
        continue;
      }

      navPairs.add(`${id}->${target}`);
      addEdge({
        kind: "nav",
        source: id,
        target,
        reason: exit.reason,
        ux: exit.ux,
      });
    }
  }

  for (const [id, { screen, branchIndex }] of owners) {
    const branch = screen.data.branches[branchIndex];

    for (const entry of branch.incoming) {
      const source = normalizeLinkRef(entry.from);
      declaredIncoming.add(`${source}->${id}`);

      if (source === ENTRY_NODE_ID) {
        addEdge({ kind: "entry", source, target: id, reason: entry.reason });
        continue;
      }

      if (source.startsWith("flow:")) {
        const flowNode = ensureFlowNode(source, screen.path, id);
        if (flowNode) {
          addEdge({
            kind: "flow",
            source: flowNode,
            target: id,
            reason: entry.reason,
          });
        }
        continue;
      }

      if (!owners.has(source)) {
        const hint = closest(source, screenNodeIds);
        issues.push({
          level: "error",
          code: "unknown-source",
          file: screen.path,
          flowId,
          nodeId: id,
          message: `entry from "${entry.from}" does not exist in this flow${hint.length ? ` (did you mean ${hint.join(", ")}?)` : ""}`,
        });
        continue;
      }

      if (navPairs.has(`${source}->${id}`)) {
        continue;
      }

      if (symmetry !== "off") {
        issues.push({
          level: symmetry === "error" ? "error" : "warning",
          code: "symmetry",
          file: screen.path,
          flowId,
          nodeId: id,
          message: `entry declares "${source}", but ${source} has no exit to ${id}`,
        });
      }
      addEdge({ kind: "nav", source, target: id, reason: entry.reason });
    }
  }

  if (symmetry !== "off") {
    for (const pair of navPairs) {
      if (declaredIncoming.has(pair)) {
        continue;
      }
      const [source, target] = pair.split("->");
      issues.push({
        level: symmetry === "error" ? "error" : "warning",
        code: "symmetry",
        file: owners.get(target)?.screen.path,
        flowId,
        nodeId: target,
        message: `${source} has an exit to ${target}, but ${target} does not list this entry`,
      });
    }
  }

  nodes.push(...externalNodes.values());

  const outgoing = new Map<string, ManifestEdge[]>();
  const incoming = new Map<string, ManifestEdge[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }

  for (const [id, { screen, type, branchIndex }] of owners) {
    const branch = screen.data.branches[branchIndex];
    const out = outgoing.get(id) ?? [];

    if (out.length === 0 && type !== "error") {
      issues.push({
        level: "warning",
        code: "dead-end",
        file: screen.path,
        flowId,
        nodeId: id,
        message: `"${id}" has no exits; declare destinations or \`outcome: end\``,
      });
    }

    if ((incoming.get(id) ?? []).length === 0) {
      issues.push({
        level: "warning",
        code: "orphan-node",
        file: screen.path,
        flowId,
        nodeId: id,
        message: `"${id}" is not reached by any entry or exit`,
      });
    }

    const needsErrorPath = type === "loading" || branch.apis.length > 0;
    const hasErrorPath = out.some(
      (edge) =>
        (edge.kind === "outcome" && edge.target.includes("::error")) ||
        owners.get(edge.target)?.type === "error"
    );
    if (needsErrorPath && !hasErrorPath && type !== "error") {
      issues.push({
        level: "warning",
        code: "missing-error-path",
        file: screen.path,
        flowId,
        nodeId: id,
        message: `"${id}" ${type === "loading" ? "is a loading node" : "calls an API"} but documents no error path (\`outcome: error\` or an exit to a \`type: error\` node)`,
      });
    }
  }

  if (owners.size > 0 && (outgoing.get(ENTRY_NODE_ID) ?? []).length === 0) {
    issues.push({
      level: "warning",
      code: "no-entry",
      file: index.path,
      flowId,
      message:
        "no node declares `incoming: [{ from: flow:entry }]`; the map has no starting point",
    });
  }

  const rank = flowOrder(nodes, outgoing);
  const byFlowOrder =
    <T>(key: (item: T) => string) =>
    (a: T, b: T) =>
      rank(key(a)) - rank(key(b));
  nodes.sort(byFlowOrder<ManifestNode>((node) => node.id));
  edges.sort(byFlowOrder<ManifestEdge>((edge) => edge.source));
  const screenRank = (screen: ManifestScreen) =>
    Math.min(...screen.nodeIds.map(rank));
  manifestScreens.sort((a, b) => screenRank(a) - screenRank(b));

  const manifest: FlowManifest = {
    version: 1,
    generatedBy: "periplus",
    project: ctx.config.project,
    flow: {
      flowId,
      slug: index.slug,
      title: index.data.title,
      domain: index.data.domain,
      status: index.data.status,
      moduleRoot: index.data.moduleRoot,
      include: index.data.include,
      lastReviewed: index.data.lastReviewed,
      owners: index.data.owners,
      watchPaths: index.data.watchPaths,
      entry: index.data.entry,
      indexPath: index.path,
      body: index.body,
    },
    screens: manifestScreens,
    nodes,
    edges,
  };

  return { manifest, issues };
}

/**
 * Reading order: entry, then BFS through exits (in declared order), unreached nodes,
 * and finally external flows and outcomes. Stable across builds to avoid noisy diffs.
 */
function flowOrder(
  nodes: ManifestNode[],
  outgoing: Map<string, ManifestEdge[]>
): (id: string) => number {
  const order = new Map<string, number>();
  const queue = [ENTRY_NODE_ID];
  while (queue.length) {
    const id = queue.shift() as string;
    if (order.has(id)) {
      continue;
    }
    order.set(id, order.size);
    for (const edge of outgoing.get(id) ?? []) {
      queue.push(edge.target);
    }
  }

  const tier = (node: ManifestNode) => {
    if (node.kind === "flow") {
      return 2;
    }
    if (node.kind === "outcome") {
      return 3;
    }
    return order.has(node.id) ? 0 : 1;
  };
  const ranked = [...nodes].sort(
    (a, b) =>
      tier(a) - tier(b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
  const position = new Map(ranked.map((node, index) => [node.id, index]));
  return (id) => position.get(id) ?? Number.MAX_SAFE_INTEGER;
}
