import {
  Background,
  Controls,
  type Edge,
  getNodesBounds,
  getViewportForBounds,
  MiniMap,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import type { GraphPayload, ManifestEdge } from "../../lib/catalog";
import {
  clearSavedPositions,
  type Direction,
  layoutGraph,
  layoutStorageKey,
  loadSavedPositions,
  type Position,
  savePositions,
} from "../../lib/graphLayout";
import {
  type FlowEdgeData,
  type FlowNodeData,
  payloadToReactFlow,
  withEdgePathOptions,
} from "../../lib/graphToFlow";
import { isExternalUrl } from "../../lib/links";
import {
  NODE_CATEGORY_LABELS,
  type NodeCategory,
  nodeCategory,
} from "../../lib/nodeCategory";

import FlowGraphExpandDialog from "./FlowGraphExpandDialog";
import FlowNode from "./FlowNode";
import "./flowGraph.css";

const nodeTypes = { flowNode: FlowNode };

interface Props {
  /** GraphPayload serialized in Astro (avoids losing data during hydration). */
  graphJson: string;
  repoUrl: string;
}

type Variant = "inline" | "modal";
type GraphNode = GraphPayload["nodes"][number];
type Selection =
  | { type: "node"; node: GraphNode }
  | { type: "edge"; edge: ManifestEdge }
  | undefined;

const TRAILING_SLASH = /\/$/;

function repoLink(base: string, file: string): string | undefined {
  return base ? `${base.replace(TRAILING_SLASH, "")}/${file}` : undefined;
}

function Legend({
  categories,
  hasRoles,
}: {
  categories: NodeCategory[];
  hasRoles: boolean;
}) {
  const shown = hasRoles
    ? categories.filter((key) => key !== "navigation")
    : categories;
  return (
    <div className="flow-graph-legend">
      {hasRoles ? (
        <span className="flow-graph-legend__item flow-graph-legend__item--start">
          Start
        </span>
      ) : null}
      {shown.map((key) => (
        <span
          className={`flow-graph-legend__item flow-graph-legend__item--${key}`}
          key={key}
        >
          {NODE_CATEGORY_LABELS[key]}
        </span>
      ))}
      {hasRoles ? (
        <span className="flow-graph-legend__item flow-graph-legend__item--end">
          End
        </span>
      ) : null}
    </div>
  );
}

function LinkList({
  title,
  items,
  nodesById,
}: {
  title: string;
  items: Array<{ edge: ManifestEdge; otherId: string }>;
  nodesById: Map<string, GraphNode>;
}) {
  if (!items.length) {
    return null;
  }
  return (
    <>
      <h4 className="flow-graph-panel__section">{title}</h4>
      <ul className="flow-graph-panel__links">
        {items.map(({ edge, otherId }) => {
          const other = nodesById.get(otherId);
          return (
            <li key={edge.id}>
              <strong>{other?.label ?? otherId}</strong> — {edge.reason}
              {edge.ux ? <span className="muted"> (UX: {edge.ux})</span> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SelectionPanel({
  selection,
  payload,
  nodesById,
  repoUrl,
  variant,
}: {
  selection: Selection;
  payload: GraphPayload;
  nodesById: Map<string, GraphNode>;
  repoUrl: string;
  variant: Variant;
}) {
  const className = `flow-graph-panel ${variant === "modal" ? "flow-graph-panel--modal" : ""}`;

  if (!selection) {
    return (
      <aside className={className}>
        <h3>Selection</h3>
        <p className="muted">
          Click a node to see rules, APIs and links, or an arrow to see why.
        </p>
      </aside>
    );
  }

  if (selection.type === "edge") {
    const { edge } = selection;
    return (
      <aside className={className}>
        <h3>Link</h3>
        <p className="flow-graph-panel__label">
          {nodesById.get(edge.source)?.label ?? edge.source} →{" "}
          {nodesById.get(edge.target)?.label ?? edge.target}
        </p>
        <p>
          <strong>Why:</strong> {edge.reason}
        </p>
        {edge.ux ? (
          <p>
            <strong>UX:</strong> {edge.ux}
          </p>
        ) : null}
      </aside>
    );
  }

  const { node } = selection;
  const incoming = payload.edges
    .filter((e) => e.target === node.id)
    .map((edge) => ({ edge, otherId: edge.source }));
  const outgoing = payload.edges
    .filter((e) => e.source === node.id)
    .map((edge) => ({ edge, otherId: edge.target }));

  return (
    <aside className={className}>
      <h3>{node.label}</h3>
      <p className="flow-graph-panel__label">
        {NODE_CATEGORY_LABELS[nodeCategory(node)]}
        {node.kind === "screen" && node.screenRef ? (
          <code> {node.id}</code>
        ) : null}
        {node.wip ? " · WIP" : ""}
      </p>
      {node.role === "start" ? (
        <p className="flow-graph-panel__role">
          {node.kind === "flow"
            ? "Start: the user arrives here from another flow."
            : "Start of the flow."}
        </p>
      ) : null}
      {node.role === "end" ? (
        <p className="flow-graph-panel__role">
          {node.kind === "flow"
            ? "End of this map: the user continues in another flow."
            : "The flow ends here: there are no next screens."}
        </p>
      ) : null}
      {node.summary ? <p>{node.summary}</p> : null}
      {node.href ? (
        <p>
          {isExternalUrl(node.href) ? (
            <a href={node.href} rel="noreferrer" target="_blank">
              Open flow ↗
            </a>
          ) : (
            <a href={node.href}>
              {node.kind === "flow" ? "Open flow →" : "Open page →"}
            </a>
          )}
        </p>
      ) : node.kind === "flow" ? (
        <p className="muted">
          Undocumented flow: add <code>docUrl</code> to{" "}
          <code>externalFlows</code> in <code>periplus.config.json</code>.
        </p>
      ) : null}

      <LinkList
        items={incoming}
        nodesById={nodesById}
        title={
          node.kind === "flow" && node.role === "end"
            ? "Continues from"
            : "Comes from"
        }
      />
      <LinkList
        items={outgoing}
        nodesById={nodesById}
        title={
          node.kind === "flow" && node.role === "start" ? "Leads to" : "Goes to"
        }
      />

      {node.apis.length ? (
        <>
          <h4 className="flow-graph-panel__section">APIs</h4>
          <ul className="flow-graph-panel__links">
            {node.apis.map((api) => (
              <li key={api.endpoint}>
                <code>{api.endpoint}</code> (
                {api.effect === "write" ? "writes" : "reads"}) — {api.when}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {node.rules.length ? (
        <h4 className="flow-graph-panel__section">
          Rules ({node.rules.length})
        </h4>
      ) : null}
      {node.rules.map((rule) => (
        <article className="rule-card" key={rule.id}>
          <h4>{rule.id}</h4>
          <p>{rule.summary}</p>
          {rule.when ? (
            <p>
              <strong>When</strong> {rule.when}
            </p>
          ) : null}
          {rule.then ? (
            <p>
              <strong>Then</strong> {rule.then}
            </p>
          ) : null}
          {rule.where.length ? (
            <ul>
              {rule.where.map((ref) => (
                <li key={`${ref.file}-${ref.symbol ?? ""}`}>
                  <a
                    href={repoLink(repoUrl, ref.file)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {ref.symbol ? `${ref.symbol} · ` : ""}
                    {ref.file.split("/").pop()}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}

      {node.notes.length ? (
        <>
          <h4 className="flow-graph-panel__section">Notes</h4>
          <ul className="flow-graph-panel__links">
            {node.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}

function DirectionToggle({
  direction,
  onChange,
}: {
  direction: Direction;
  onChange: (direction: Direction) => void;
}) {
  return (
    <fieldset aria-label="Map direction" className="flow-graph-segmented">
      {(
        [
          ["LR", "Horizontal"],
          ["TB", "Vertical"],
        ] as const
      ).map(([value, label]) => (
        <button
          aria-pressed={direction === value}
          className={`flow-graph-segmented__btn ${direction === value ? "flow-graph-segmented__btn--active" : ""}`}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          {label}
        </button>
      ))}
    </fieldset>
  );
}

function reportLayoutError(error: unknown) {
  console.error("periplus: graph layout failed", error);
}

function currentPositions(nodes: Node[]): Map<string, Position> {
  return new Map(nodes.map((node) => [node.id, node.position]));
}

function FlowGraphCanvas({
  payload,
  repoUrl,
  variant,
  direction,
  onDirectionChange,
  revision,
  onRequestExpand,
}: {
  payload: GraphPayload;
  repoUrl: string;
  variant: Variant;
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
  /** Incremented from outside to force a new layout (e.g. when closing the modal, which may have saved positions). */
  revision: number;
  onRequestExpand?: () => void;
}) {
  const [initial] = useState(() => payloadToReactFlow(payload, direction));
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>(
    initial.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<FlowEdgeData>>(
    initial.edges
  );
  const [laidOut, setLaidOut] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [selection, setSelection] = useState<Selection>();

  const nodesInitialized = useNodesInitialized();
  const { setViewport, getNodes } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const layoutRun = useRef(0);

  const nodesById = useMemo(
    () => new Map(payload.nodes.map((node) => [node.id, node])),
    [payload.nodes]
  );
  const edgesById = useMemo(
    () => new Map(payload.edges.map((edge) => [edge.id, edge])),
    [payload.edges]
  );
  const nodeIds = useMemo(
    () => payload.nodes.map((node) => node.id),
    [payload.nodes]
  );
  const categories = useMemo(
    () => [...new Set(payload.nodes.map(nodeCategory))],
    [payload.nodes]
  );
  const hasRoles = useMemo(
    () => payload.nodes.some((node) => node.role),
    [payload.nodes]
  );
  const storageKey = layoutStorageKey(payload.title, direction);

  const fitToView = useCallback(() => {
    window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const { width, height } = canvas.getBoundingClientRect();
      // Below this zoom the card text becomes unreadable; scrolling the map is preferred.
      const minZoom = variant === "modal" ? 0.3 : 0.45;
      const bounds = getNodesBounds(getNodes());
      const viewport = getViewportForBounds(
        bounds,
        width,
        height,
        minZoom,
        variant === "modal" ? 1.2 : 1,
        0.12
      );
      if (viewport.zoom <= minZoom + 0.001) {
        const margin = 32;
        if (direction === "LR") {
          viewport.x = margin - bounds.x * viewport.zoom;
        } else {
          viewport.y = margin - bounds.y * viewport.zoom;
        }
      }
      setViewport(viewport, { duration: 300 });
    });
  }, [setViewport, getNodes, variant, direction]);

  const runLayout = useCallback(
    async (useSaved: boolean) => {
      layoutRun.current += 1;
      const run = layoutRun.current;
      const sizes = new Map(
        getNodes().map((node) => [
          node.id,
          {
            width: node.measured?.width ?? 200,
            height: node.measured?.height ?? 72,
          },
        ])
      );
      const auto = await layoutGraph(payload, sizes, direction);
      if (run !== layoutRun.current) {
        return;
      }

      const saved = useSaved
        ? loadSavedPositions(storageKey, nodeIds)
        : new Map<string, Position>();
      const positions = new Map(
        nodeIds.map((id) => [
          id,
          saved.get(id) ?? auto.get(id) ?? { x: 0, y: 0 },
        ])
      );
      setNodes((prev) =>
        prev.map((node) => ({
          ...node,
          position: positions.get(node.id) ?? node.position,
        }))
      );
      setEdges((prev) =>
        withEdgePathOptions(prev, payload, positions, direction)
      );
      setCustomized(saved.size > 0);
      setLaidOut(true);
      updateNodeInternals(nodeIds);
      fitToView();
    },
    [
      payload,
      direction,
      storageKey,
      nodeIds,
      getNodes,
      setNodes,
      setEdges,
      updateNodeInternals,
      fitToView,
    ]
  );

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => ({ ...node, data: { ...node.data, direction } }))
    );
    setLaidOut(false);
  }, [direction, setNodes]);

  useEffect(() => {
    if (revision) {
      setLaidOut(false);
    }
  }, [revision]);

  useEffect(() => {
    if (nodesInitialized && !laidOut) {
      runLayout(true).catch(reportLayoutError);
    }
  }, [nodesInitialized, laidOut, runLayout]);

  const onReorganize = useCallback(() => {
    clearSavedPositions(storageKey);
    runLayout(false).catch(reportLayoutError);
  }, [storageKey, runLayout]);

  const onNodeDragStop = useCallback(
    (_: unknown, __: Node, dragged: Node[]) => {
      const positions = currentPositions(getNodes());
      for (const node of dragged) {
        positions.set(node.id, node.position);
      }
      savePositions(storageKey, positions);
      setCustomized(true);
      setEdges((prev) =>
        withEdgePathOptions(prev, payload, positions, direction)
      );
    },
    [getNodes, storageKey, setEdges, payload, direction]
  );

  const onNodeClick = useCallback(
    (_: unknown, rfNode: Node) => {
      const node = nodesById.get(rfNode.id);
      setSelection(node ? { type: "node", node } : undefined);
    },
    [nodesById]
  );

  const onEdgeClick = useCallback(
    (_: unknown, rfEdge: Edge) => {
      const edge = edgesById.get(rfEdge.id);
      setSelection(edge ? { type: "edge", edge } : undefined);
    },
    [edgesById]
  );

  const onPaneClick = useCallback(() => setSelection(undefined), []);

  const onNodeDoubleClick = useCallback(
    (_: unknown, rfNode: Node) => {
      const href = nodesById.get(rfNode.id)?.href;
      if (href) {
        window.location.href = href;
      }
    },
    [nodesById]
  );

  const selectedNodeId =
    selection?.type === "node" ? selection.node.id : undefined;

  const displayNodes = useMemo(
    () =>
      nodes.map((node) =>
        Boolean(node.selected) === (node.id === selectedNodeId)
          ? node
          : { ...node, selected: node.id === selectedNodeId }
      ),
    [nodes, selectedNodeId]
  );

  const displayEdges = useMemo(() => {
    const isHighlighted = (edge: Edge<FlowEdgeData>) => {
      if (selection?.type === "edge") {
        return selection.edge.id === edge.id;
      }
      if (selection?.type === "node") {
        return (
          edge.source === selection.node.id || edge.target === selection.node.id
        );
      }
      return false;
    };
    return edges.map((edge) => {
      const highlighted = isHighlighted(edge);
      return {
        ...edge,
        selected: selection?.type === "edge" && selection.edge.id === edge.id,
        label: highlighted ? edge.data?.label : undefined,
        zIndex: highlighted ? 10 : 0,
        className: highlighted
          ? "flow-edge--highlighted"
          : selection
            ? "flow-edge--dimmed"
            : undefined,
      };
    });
  }, [edges, selection]);

  return (
    <div
      className={`not-content flow-graph-wrap ${variant === "modal" ? "flow-graph-wrap--modal" : ""}`}
    >
      <div
        className={`flow-graph-toolbar ${variant === "modal" ? "flow-graph-toolbar--modal" : ""}`}
      >
        <div className="flow-graph-toolbar__heading">
          {variant === "inline" ? (
            <span className="flow-graph-toolbar__title">{payload.title}</span>
          ) : null}
          <span className="flow-graph-toolbar__meta">
            {nodes.length} nodes · {edges.length} links · click shows why · drag
            to arrange · double-click opens the page
            {customized ? (
              <span className="flow-graph-toolbar__custom">
                {" "}
                · custom positions
              </span>
            ) : null}
          </span>
        </div>
        <div className="flow-graph-toolbar__row">
          <Legend categories={categories} hasRoles={hasRoles} />
          <div className="flow-graph-toolbar__actions">
            <DirectionToggle
              direction={direction}
              onChange={onDirectionChange}
            />
            <button
              className="flow-graph-toolbar__btn"
              onClick={onReorganize}
              title="Discard dragged positions and recompute the layout"
              type="button"
            >
              Re-layout
            </button>
            {onRequestExpand ? (
              <button
                className="flow-graph-toolbar__btn"
                onClick={onRequestExpand}
                type="button"
              >
                Expand map
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className={`flow-graph-canvas ${variant === "modal" ? "flow-graph-canvas--modal" : ""} ${
          laidOut ? "" : "flow-graph-canvas--pending"
        }`}
        ref={canvasRef}
      >
        <ReactFlow
          edges={displayEdges}
          elementsSelectable={false}
          maxZoom={1.75}
          minZoom={0.1}
          nodes={displayNodes}
          nodesConnectable={false}
          nodesDraggable
          nodeTypes={nodeTypes}
          onEdgeClick={onEdgeClick}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeDragStop={onNodeDragStop}
          onNodesChange={onNodesChange}
          onPaneClick={onPaneClick}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
          <MiniMap
            className="flow-graph-minimap"
            nodeBorderRadius={8}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
      <SelectionPanel
        nodesById={nodesById}
        payload={payload}
        repoUrl={repoUrl}
        selection={selection}
        variant={variant}
      />
    </div>
  );
}

export default function FlowGraph({ graphJson, repoUrl }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("LR");
  const [revision, setRevision] = useState(0);
  const payload = useMemo(
    () => JSON.parse(graphJson) as GraphPayload,
    [graphJson]
  );

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setRevision((value) => value + 1);
  }, []);

  return (
    <>
      <ReactFlowProvider>
        <FlowGraphCanvas
          direction={direction}
          onDirectionChange={setDirection}
          onRequestExpand={() => setModalOpen(true)}
          payload={payload}
          repoUrl={repoUrl}
          revision={revision}
          variant="inline"
        />
      </ReactFlowProvider>

      {modalOpen ? (
        <FlowGraphExpandDialog onClose={closeModal} open title={payload.title}>
          <ReactFlowProvider>
            <FlowGraphCanvas
              direction={direction}
              onDirectionChange={setDirection}
              payload={payload}
              repoUrl={repoUrl}
              revision={0}
              variant="modal"
            />
          </ReactFlowProvider>
        </FlowGraphExpandDialog>
      ) : null}
    </>
  );
}
