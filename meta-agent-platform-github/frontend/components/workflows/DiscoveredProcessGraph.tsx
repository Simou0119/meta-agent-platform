"use client";

type ProcessActivity = {
  agent_id: number | null;
  activity: string;
  agent_order: number;
  execution_count: number;
  completed_count: number;
  failed_count: number;
  failure_rate: number;
  average_duration_ms: number | null;
  average_total_tokens: number | null;
};

type DirectFollow = {
  source: string;
  target: string;
  count: number;
};

type DiscoveredProcessGraphProps = {
  activities: ProcessActivity[];
  directFollows: DirectFollow[];
  analyzedRuns: number;
};

type PositionedNode = ProcessActivity & {
  x: number;
  y: number;
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 82;
const COLUMN_GAP = 86;
const ROW_GAP = 38;
const PADDING_X = 48;
const PADDING_Y = 48;

function formatDuration(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(1)} s`;
}

function buildLayout(activities: ProcessActivity[]) {
  const ordered = [...activities].sort((a, b) => {
    if (a.agent_order !== b.agent_order) {
      return a.agent_order - b.agent_order;
    }
    return a.activity.localeCompare(b.activity);
  });

  const groups = new Map<number, ProcessActivity[]>();
  ordered.forEach((activity) => {
    const group = groups.get(activity.agent_order) ?? [];
    group.push(activity);
    groups.set(activity.agent_order, group);
  });

  const orders = Array.from(groups.keys()).sort((a, b) => a - b);
  const maxRows = Math.max(1, ...Array.from(groups.values()).map((group) => group.length));
  const contentHeight = maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP;
  const height = Math.max(250, contentHeight + PADDING_Y * 2);
  const width = Math.max(
    760,
    PADDING_X * 2 + orders.length * NODE_WIDTH + Math.max(0, orders.length - 1) * COLUMN_GAP,
  );

  const nodes: PositionedNode[] = [];

  orders.forEach((order, columnIndex) => {
    const group = groups.get(order) ?? [];
    const groupHeight = group.length * NODE_HEIGHT + Math.max(0, group.length - 1) * ROW_GAP;
    const startY = (height - groupHeight) / 2;

    group.forEach((activity, rowIndex) => {
      nodes.push({
        ...activity,
        x: PADDING_X + columnIndex * (NODE_WIDTH + COLUMN_GAP),
        y: startY + rowIndex * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  return { nodes, width, height };
}

export function DiscoveredProcessGraph({
  activities,
  directFollows,
  analyzedRuns,
}: DiscoveredProcessGraphProps) {
  const { nodes, width, height } = buildLayout(activities);
  const nodeByName = new Map(nodes.map((node) => [node.activity, node]));
  const maxEdgeCount = Math.max(1, ...directFollows.map((edge) => edge.count));

  if (nodes.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-[#D8E0E8] bg-[#FAFBFC] px-5 py-10 text-center text-[12px] text-[#7D858D]">
        No completed or failed agent steps are available for process discovery yet.
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-[#E2E7EC] bg-[#FBFCFD]">
      <div
        className="relative"
        style={{ width: `${width}px`, height: `${height}px`, minWidth: "100%" }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id="process-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="#8FA5BD" />
            </marker>
          </defs>

          {directFollows.map((edge, index) => {
            const source = nodeByName.get(edge.source);
            const target = nodeByName.get(edge.target);
            if (!source || !target) {
              return null;
            }

            const strokeWidth = 1.5 + (edge.count / maxEdgeCount) * 2;

            if (source.activity === target.activity) {
              const startX = source.x + NODE_WIDTH - 18;
              const startY = source.y + 16;
              const endX = source.x + NODE_WIDTH - 18;
              const endY = source.y + NODE_HEIGHT - 16;
              const loopX = source.x + NODE_WIDTH + 34;
              const d = `M ${startX} ${startY} C ${loopX} ${startY}, ${loopX} ${endY}, ${endX} ${endY}`;
              return (
                <path
                  key={`${edge.source}-${edge.target}-${index}`}
                  d={d}
                  fill="none"
                  stroke="#8FA5BD"
                  strokeWidth={strokeWidth}
                  markerEnd="url(#process-arrow)"
                />
              );
            }

            const leftToRight = target.x >= source.x;
            const startX = leftToRight ? source.x + NODE_WIDTH : source.x;
            const endX = leftToRight ? target.x : target.x + NODE_WIDTH;
            const startY = source.y + NODE_HEIGHT / 2;
            const endY = target.y + NODE_HEIGHT / 2;
            const bend = Math.max(36, Math.abs(endX - startX) * 0.42);
            const control1X = leftToRight ? startX + bend : startX - bend;
            const control2X = leftToRight ? endX - bend : endX + bend;
            const d = `M ${startX} ${startY} C ${control1X} ${startY}, ${control2X} ${endY}, ${endX} ${endY}`;

            return (
              <path
                key={`${edge.source}-${edge.target}-${index}`}
                d={d}
                fill="none"
                stroke="#8FA5BD"
                strokeWidth={strokeWidth}
                markerEnd="url(#process-arrow)"
              />
            );
          })}
        </svg>

        {nodes.map((node) => (
          <div
            key={`${node.agent_id ?? "none"}-${node.activity}-${node.agent_order}`}
            className="absolute rounded-xl border border-[#C9D6E4] bg-white px-4 py-3 shadow-[0_3px_10px_rgba(39,67,96,0.08)]"
            style={{
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${NODE_WIDTH}px`,
              height: `${NODE_HEIGHT}px`,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-[12px] font-semibold text-[#2F3942]" title={node.activity}>
                {node.activity}
              </p>
              <span className="shrink-0 rounded-md bg-[#E8F0FB] px-1.5 py-0.5 text-[9px] font-bold text-[#3569B8]">
                {node.execution_count}×
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#7A848D]">
              <span>{formatDuration(node.average_duration_ms)}</span>
              <span>{node.failure_rate.toFixed(1)}% fail</span>
            </div>
          </div>
        ))}

        {directFollows.map((edge, index) => {
          const source = nodeByName.get(edge.source);
          const target = nodeByName.get(edge.target);
          if (!source || !target || source.activity === target.activity) {
            return null;
          }

          const x = (source.x + NODE_WIDTH + target.x) / 2;
          const y = (source.y + target.y) / 2 + NODE_HEIGHT / 2;
          const percentage = analyzedRuns > 0
            ? Math.min(100, (edge.count / analyzedRuns) * 100)
            : 0;

          return (
            <div
              key={`label-${edge.source}-${edge.target}-${index}`}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#D8E1EA] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#617181] shadow-sm"
              style={{ left: `${x}px`, top: `${y}px` }}
              title={`${edge.count} directly-following occurrence${edge.count === 1 ? "" : "s"}`}
            >
              {edge.count} · {percentage.toFixed(0)}%
            </div>
          );
        })}
      </div>
    </div>
  );
}