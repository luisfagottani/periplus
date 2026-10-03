import type { ManifestNode } from "./catalog";

export type NodeCategory =
  | "navigation"
  | "screen"
  | "loading"
  | "modal"
  | "decision"
  | "external_flow"
  | "error"
  | "end";

/** Labels shown in the graph and its legend. */
export const NODE_CATEGORY_LABELS: Record<NodeCategory, string> = {
  navigation: "Entry",
  screen: "Screen",
  loading: "Processing",
  modal: "Modal",
  decision: "Decision",
  external_flow: "Other flow",
  error: "Error",
  end: "End",
};

export function nodeCategory(
  node: Pick<ManifestNode, "kind" | "type" | "outcome">
): NodeCategory {
  switch (node.kind) {
    case "entry":
      return "navigation";
    case "flow":
      return "external_flow";
    case "outcome":
      return node.outcome === "end" ? "end" : "error";
    default:
      break;
  }

  switch (node.type) {
    case "loading":
      return "loading";
    case "error":
      return "error";
    case "modal":
      return "modal";
    case "decision":
      return "decision";
    default:
      return "screen";
  }
}
