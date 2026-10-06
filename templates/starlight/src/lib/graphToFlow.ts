import { type Edge, MarkerType, type Node } from "@xyflow/react";

import type { GraphPayload, NodeRole } from "./catalog";
import { computeEdgePathOptions, getEdgePathOptions } from "./edgeLayout";
import {
  type Direction,
  type Position,
  provisionalPositions,
} from "./graphLayout";
import { isExternalUrl } from "./links";
import { NODE_CATEGORY_LABELS, nodeCategory } from "./nodeCategory";

/** React Flow requires node/edge data to be assignable to `Record<string, unknown>`. */
export interface FlowNodeData {
  [key: string]: unknown;
  label: string;
  ref?: string;
  subtitle?: string;
  category: ReturnType<typeof nodeCategory>;
  /** Badge text: category, or the start/end kind. */
  badge: string;
  role?: NodeRole;
  /** "Open flow" link on the card (external flows only). */
  flowHref?: string;
  external?: boolean;
  /** A final screen that still exits to another flow/error keeps its source handle. */
  hasSource: boolean;
  wip?: boolean;
  direction: Direction;
}

export interface FlowEdgeData {
  [key: string]: unknown;
  label: string;
}

type PayloadNode = GraphPayload["nodes"][number];

const MAX_EDGE_LABEL = 48;

function shortLabel(text: string): string {
  return text.length > MAX_EDGE_LABEL
    ? `${text.slice(0, MAX_EDGE_LABEL - 1)}…`
    : text;
}

function badgeFor(
  node: PayloadNode,
  category: ReturnType<typeof nodeCategory>
): string {
  if (node.role === "start") {
    return node.kind === "entry" ? "Start" : "Start · other flow";
  }
  if (node.role !== "end") {
    return NODE_CATEGORY_LABELS[category];
  }
  if (node.kind === "outcome") {
    return node.outcome === "end" ? "End" : "End · error";
  }
  if (node.kind === "flow") {
    return "End · continues in flow";
  }
  return `${NODE_CATEGORY_LABELS[category]} · end`;
}

/** Nodes at provisional positions (the real layout runs after measuring cards) and unlabeled edges. */
export function payloadToReactFlow(
  payload: GraphPayload,
  direction: Direction
): { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } {
  const positions = provisionalPositions(payload);

  const nodes: Node<FlowNodeData>[] = payload.nodes.map((node) => {
    const category = nodeCategory(node);
    const ref = node.kind === "screen" && node.screenRef ? node.id : undefined;
    return {
      id: node.id,
      type: "flowNode",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        label: node.label,
        ref,
        subtitle:
          node.kind === "flow" && !node.href ? "undocumented" : undefined,
        category,
        badge: badgeFor(node, category),
        role: node.role,
        flowHref: node.kind === "flow" ? node.href : undefined,
        external: isExternalUrl(node.href),
        hasSource: node.hasOutgoing !== false,
        wip: node.wip,
        direction,
      },
    };
  });

  const edges: Edge<FlowEdgeData>[] = payload.edges.map((edge) => {
    const dashed = edge.kind === "outcome" || edge.kind === "flow";
    const muted = edge.kind === "flow";
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      data: { label: shortLabel(edge.reason) },
      labelShowBg: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: muted ? "#94a3b8" : "#334155",
      },
      style: {
        stroke: muted ? "#94a3b8" : "#334155",
        strokeWidth: 2,
        ...(dashed ? { strokeDasharray: muted ? "2 5" : "6 4" } : {}),
      },
      labelStyle: { fill: "#0f172a", fontSize: 10, fontWeight: 600 },
      labelBgStyle: {
        fill: "#ffffff",
        fillOpacity: 0.98,
        stroke: "#94a3b8",
        strokeWidth: 1,
      },
      labelBgPadding: [8, 6] as [number, number],
      labelBgBorderRadius: 6,
      selectable: true,
    };
  });

  return { nodes, edges };
}

/** Recomputes smoothstep offsets from the final node positions. */
export function withEdgePathOptions(
  edges: Edge<FlowEdgeData>[],
  payload: GraphPayload,
  positions: Map<string, Position>,
  direction: Direction
): Edge<FlowEdgeData>[] {
  const options = computeEdgePathOptions(payload.edges, positions, direction);
  return edges.map((edge) => ({
    ...edge,
    pathOptions: getEdgePathOptions(edge.id, options),
  }));
}
