import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

import type { FlowNodeData } from "../../lib/graphToFlow";

function FlowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as FlowNodeData;
  const vertical = nodeData.direction === "TB";
  const isStart = nodeData.role === "start";
  const isEnd = nodeData.role === "end";

  const className = [
    "flow-node",
    `flow-node--cat-${nodeData.category}`,
    isStart ? "flow-node--start" : "",
    isEnd ? "flow-node--end" : "",
    nodeData.wip ? "flow-node--wip" : "",
    selected ? "flow-node--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {isStart ? null : (
        <Handle
          className="flow-node__handle"
          isConnectable={false}
          position={vertical ? Position.Top : Position.Left}
          type="target"
        />
      )}
      <span className="flow-node__badge">
        {isStart || isEnd ? (
          <span aria-hidden="true" className="flow-node__marker" />
        ) : null}
        {nodeData.badge}
        {nodeData.wip ? " · WIP" : ""}
      </span>
      <div className="flow-node__label">{nodeData.label}</div>
      {nodeData.ref ? (
        <div className="flow-node__ref">{nodeData.ref}</div>
      ) : null}
      {nodeData.subtitle ? (
        <div className="flow-node__subtitle">{nodeData.subtitle}</div>
      ) : null}
      {nodeData.flowHref ? (
        <a
          className="flow-node__link nodrag nopan"
          href={nodeData.flowHref}
          {...(nodeData.external
            ? { target: "_blank", rel: "noreferrer" }
            : {})}
          onClick={(event) => event.stopPropagation()}
        >
          Open flow {nodeData.external ? "↗" : "→"}
        </a>
      ) : null}
      {nodeData.hasSource ? (
        <Handle
          className="flow-node__handle"
          isConnectable={false}
          position={vertical ? Position.Bottom : Position.Right}
          type="source"
        />
      ) : null}
    </div>
  );
}

export default memo(FlowNodeComponent);
