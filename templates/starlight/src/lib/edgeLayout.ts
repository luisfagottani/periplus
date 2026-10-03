import type { SmoothStepPathOptions } from "@xyflow/react";

import type { ManifestEdge } from "./catalog";
import type { Direction, Position } from "./graphLayout";

const OFFSET_STEP = 44;
const DEFAULT_PATH: SmoothStepPathOptions = {
  borderRadius: 14,
  offset: 28,
  stepPosition: 0.58,
};

/**
 * Edges with the same source share their first segment; offset and stepPosition
 * split the paths and place labels closer to the middle-end of each branch.
 */
export function computeEdgePathOptions(
  edges: ManifestEdge[],
  positions: Map<string, Position>,
  direction: Direction
): Map<string, SmoothStepPathOptions> {
  const result = new Map<string, SmoothStepPathOptions>();
  const bySource = new Map<string, ManifestEdge[]>();

  for (const edge of edges) {
    bySource.set(edge.source, [...(bySource.get(edge.source) ?? []), edge]);
  }

  /** Coordinate perpendicular to the flow direction (y when horizontal, x when vertical). */
  const targetY = (nodeId: string) => {
    const position = positions.get(nodeId);
    return (direction === "LR" ? position?.y : position?.x) ?? 0;
  };

  for (const group of bySource.values()) {
    if (group.length === 1) {
      const [edge] = group;
      const vertical =
        Math.abs(targetY(edge.target) - targetY(edge.source)) > 80;
      result.set(edge.id, {
        borderRadius: 14,
        offset: vertical ? 32 : 24,
        stepPosition: vertical ? 0.42 : 0.58,
      });
      continue;
    }

    const sorted = [...group].sort(
      (a, b) =>
        targetY(a.target) - targetY(b.target) || a.id.localeCompare(b.id)
    );
    const count = sorted.length;
    const middle = (count - 1) / 2;
    sorted.forEach((edge, index) => {
      const selfLoop = edge.source === edge.target;
      /* A negative offset makes the arrow leave the handle and loop back behind the card, so keep it positive;
         outer branches leave a bit further out so they don't overlap the first segment of the central ones. */
      result.set(edge.id, {
        borderRadius: 16,
        offset: selfLoop
          ? 48
          : 20 + Math.abs(index - middle) * OFFSET_STEP * 0.35,
        stepPosition: selfLoop
          ? 0.72
          : 0.38 + (index / Math.max(count - 1, 1)) * 0.48,
      });
    });
  }

  return result;
}

export function getEdgePathOptions(
  edgeId: string,
  options: Map<string, SmoothStepPathOptions>
): SmoothStepPathOptions {
  return options.get(edgeId) ?? DEFAULT_PATH;
}
