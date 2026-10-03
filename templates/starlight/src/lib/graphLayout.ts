import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";

import type { GraphPayload } from "./catalog";

export interface Position {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export type Direction = "LR" | "TB";

type LayoutInput = Pick<GraphPayload, "nodes" | "edges">;

const DEFAULT_SIZE: Size = { width: 200, height: 72 };
const elk = new ELK();

/** Grid used only on the first render, so React Flow can measure the cards before the real layout. */
export function provisionalPositions(
  payload: LayoutInput
): Map<string, Position> {
  const perRow = Math.max(1, Math.ceil(Math.sqrt(payload.nodes.length)));
  return new Map(
    payload.nodes.map((node, index) => [
      node.id,
      {
        x: (index % perRow) * (DEFAULT_SIZE.width + 40),
        y: Math.floor(index / perRow) * (DEFAULT_SIZE.height + 120),
      },
    ])
  );
}

/**
 * Layered layout (ELK layered) using each card's real size: minimizes crossings,
 * keeps the entry in the first layer and separates disconnected components (orphans).
 */
export async function layoutGraph(
  payload: LayoutInput,
  sizes: Map<string, Size>,
  direction: Direction
): Promise<Map<string, Position>> {
  const ids = new Set(payload.nodes.map((node) => node.id));
  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.spacing.nodeNode": "48",
      "elk.spacing.edgeNode": "24",
      "elk.spacing.componentComponent": "96",
      "elk.separateConnectedComponents": "true",
    },
    children: payload.nodes.map((node) => ({
      id: node.id,
      ...(sizes.get(node.id) ?? DEFAULT_SIZE),
      ...(node.kind === "entry" || node.role === "start"
        ? { layoutOptions: { "elk.layered.layering.layerConstraint": "FIRST" } }
        : {}),
    })),
    edges: payload.edges
      .filter(
        (edge) =>
          edge.source !== edge.target &&
          ids.has(edge.source) &&
          ids.has(edge.target)
      )
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
      })),
  };

  const result = await elk.layout(graph);
  return new Map(
    (result.children ?? []).map((child) => [
      child.id,
      { x: child.x ?? 0, y: child.y ?? 0 },
    ])
  );
}

export function layoutStorageKey(title: string, direction: Direction): string {
  return `periplus:layout:${title}:${direction}`;
}

/** Positions dragged by the user, only for nodes that still exist in the graph. */
export function loadSavedPositions(
  key: string,
  nodeIds: string[]
): Map<string, Position> {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(key) ?? "{}"
    ) as Record<string, Position>;
    const current = new Set(nodeIds);
    return new Map(Object.entries(saved).filter(([id]) => current.has(id)));
  } catch {
    return new Map();
  }
}

export function savePositions(
  key: string,
  positions: Map<string, Position>
): void {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(Object.fromEntries(positions))
    );
  } catch {
    // Storage full or blocked: the automatic layout still applies.
  }
}

export function clearSavedPositions(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to clear.
  }
}
