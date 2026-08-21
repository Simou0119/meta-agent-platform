"use client";

import type {
  WorkflowMetricsSummary,
  WorkflowMetricsTrendItem,
} from "./metricsTypes";

type WorkflowDurationChartProps = {
  summary: WorkflowMetricsSummary;
  runs: WorkflowMetricsTrendItem[];
};

type ChartPoint = {
  runId: number;
  label: string;
  durationMs: number;
  x: number;
  y: number;
};

function normalizeDateValue(
  value: string,
): string {
  if (!value) {
    return value;
  }

  return value.includes("T")
    ? value
    : value.replace(" ", "T");
}

function formatShortDate(
  value: string,
): string {
  const date = new Date(
    normalizeDateValue(value),
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatDuration(
  durationMs: number | null,
): string {
  if (
    durationMs === null ||
    durationMs < 0
  ) {
    return "—";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  const seconds =
    durationMs / 1000;

  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  const minutes = Math.floor(
    seconds / 60,
  );

  const remainingSeconds = Math.round(
    seconds % 60,
  );

  return `${minutes}m ${remainingSeconds}s`;
}

function createHorizontalLine(
  value: number | null,
  maxDuration: number,
  chartHeight: number,
  paddingTop: number,
): number | null {
  if (
    value === null ||
    value < 0 ||
    maxDuration <= 0
  ) {
    return null;
  }

  return (
    paddingTop +
    chartHeight -
    (
      value /
      maxDuration
    ) *
      chartHeight
  );
}

export function WorkflowDurationChart({
  summary,
  runs,
}: WorkflowDurationChartProps) {
  const completedRuns = runs.filter(
    (run) =>
      run.status === "completed" &&
      run.duration_ms !== null &&
      run.duration_ms >= 0,
  );

  if (completedRuns.length === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <h3 className="text-[18px] font-semibold text-[#202126]">
          Workflow Duration Trend
        </h3>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Compare execution duration with average, fastest, and P95 reference lines.
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-12 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No completed workflow executions with duration data are available.
          </p>
        </div>
      </section>
    );
  }

  const width = 900;
  const height = 330;

  const paddingLeft = 64;
  const paddingRight = 28;
  const paddingTop = 30;
  const paddingBottom = 60;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const maxDuration = Math.max(
    1,
    ...completedRuns.map(
      (run) =>
        run.duration_ms ?? 0,
    ),
    summary.p95_duration_ms ?? 0,
    summary.average_duration_ms ?? 0,
    summary.fastest_duration_ms ?? 0,
  );

  const chartMax =
    maxDuration * 1.12;

  const points: ChartPoint[] =
    completedRuns.map(
      (
        run,
        index,
      ) => {
        const x =
          paddingLeft +
          (
            index /
            Math.max(
              completedRuns.length - 1,
              1,
            )
          ) *
            chartWidth;

        const durationMs =
          run.duration_ms ?? 0;

        const y =
          paddingTop +
          chartHeight -
          (
            durationMs /
            chartMax
          ) *
            chartHeight;

        return {
          runId: run.run_id,
          label: formatShortDate(
            run.created_at,
          ),
          durationMs,
          x,
          y,
        };
      },
    );

  const polylinePoints = points
    .map(
      (point) =>
        `${point.x},${point.y}`,
    )
    .join(" ");

  const areaPoints = [
    `${paddingLeft},${
      paddingTop + chartHeight
    }`,
    ...points.map(
      (point) =>
        `${point.x},${point.y}`,
    ),
    `${
      paddingLeft + chartWidth
    },${paddingTop + chartHeight}`,
  ].join(" ");

  const averageY =
    createHorizontalLine(
      summary.average_duration_ms,
      chartMax,
      chartHeight,
      paddingTop,
    );

  const fastestY =
    createHorizontalLine(
      summary.fastest_duration_ms,
      chartMax,
      chartHeight,
      paddingTop,
    );

  const p95Y =
    createHorizontalLine(
      summary.p95_duration_ms,
      chartMax,
      chartHeight,
      paddingTop,
    );

  const gridRatios = [
    0,
    0.25,
    0.5,
    0.75,
    1,
  ];

  return (
    <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-semibold text-[#202126]">
            Workflow Duration Trend
          </h3>

          <p className="mt-1 text-[13px] text-[#8A9299]">
            Execution duration with average, fastest, and P95 reference lines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium text-[#68727B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#3569B8]" />
            Execution
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-[#438252]" />
            Average
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-[#7057A8]" />
            Fastest
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-[#D95117]" />
            P95
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[760px] w-full"
          role="img"
          aria-label="Workflow execution duration trend"
        >
          <defs>
            <linearGradient
              id="workflow-duration-area"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="#8DB0DB"
                stopOpacity="0.34"
              />

              <stop
                offset="100%"
                stopColor="#8DB0DB"
                stopOpacity="0.03"
              />
            </linearGradient>
          </defs>

          {gridRatios.map(
            (ratio) => {
              const y =
                paddingTop +
                chartHeight *
                  ratio;

              const value =
                chartMax *
                (1 - ratio);

              return (
                <g key={ratio}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={
                      paddingLeft +
                      chartWidth
                    }
                    y2={y}
                    stroke="#E5E9ED"
                    strokeWidth="1"
                    strokeDasharray="4 5"
                  />

                  <text
                    x={
                      paddingLeft - 12
                    }
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="#929AA1"
                  >
                    {formatDuration(
                      value,
                    )}
                  </text>
                </g>
              );
            },
          )}

          {averageY !== null ? (
            <g>
              <line
                x1={paddingLeft}
                y1={averageY}
                x2={
                  paddingLeft +
                  chartWidth
                }
                y2={averageY}
                stroke="#438252"
                strokeWidth="2"
                strokeDasharray="7 6"
              />

              <text
                x={
                  paddingLeft +
                  chartWidth -
                  4
                }
                y={averageY - 7}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill="#438252"
              >
                Average{" "}
                {formatDuration(
                  summary.average_duration_ms,
                )}
              </text>
            </g>
          ) : null}

          {fastestY !== null ? (
            <g>
              <line
                x1={paddingLeft}
                y1={fastestY}
                x2={
                  paddingLeft +
                  chartWidth
                }
                y2={fastestY}
                stroke="#7057A8"
                strokeWidth="2"
                strokeDasharray="3 5"
              />

              <text
                x={
                  paddingLeft + 4
                }
                y={fastestY - 7}
                fontSize="10"
                fontWeight="600"
                fill="#7057A8"
              >
                Fastest{" "}
                {formatDuration(
                  summary.fastest_duration_ms,
                )}
              </text>
            </g>
          ) : null}

          {p95Y !== null ? (
            <g>
              <line
                x1={paddingLeft}
                y1={p95Y}
                x2={
                  paddingLeft +
                  chartWidth
                }
                y2={p95Y}
                stroke="#D95117"
                strokeWidth="2"
                strokeDasharray="10 6"
              />

              <text
                x={
                  paddingLeft +
                  chartWidth -
                  4
                }
                y={p95Y - 7}
                textAnchor="end"
                fontSize="10"
                fontWeight="600"
                fill="#D95117"
              >
                P95{" "}
                {formatDuration(
                  summary.p95_duration_ms,
                )}
              </text>
            </g>
          ) : null}

          <polygon
            points={areaPoints}
            fill="url(#workflow-duration-area)"
          />

          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#3569B8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map(
            (
              point,
              index,
            ) => (
              <g key={point.runId}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  fill="#FFFFFF"
                  stroke="#3569B8"
                  strokeWidth="3"
                >
                  <title>
                    {`Execution #${point.runId}: ${formatDuration(point.durationMs)}`}
                  </title>
                </circle>

                <text
                  x={point.x}
                  y={
                    paddingTop +
                    chartHeight +
                    25
                  }
                  textAnchor="middle"
                  fontSize="10"
                  fill="#7A838B"
                >
                  #{point.runId}
                </text>

                <text
                  x={point.x}
                  y={
                    paddingTop +
                    chartHeight +
                    42
                  }
                  textAnchor="middle"
                  fontSize="9"
                  fill="#A0A8AF"
                >
                  {point.label}
                </text>

                {(
                  completedRuns.length <=
                  12 ||
                  index ===
                    completedRuns.length -
                      1
                ) ? (
                  <text
                    x={point.x}
                    y={point.y - 11}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="#3569B8"
                  >
                    {formatDuration(
                      point.durationMs,
                    )}
                  </text>
                ) : null}
              </g>
            ),
          )}
        </svg>
      </div>
    </section>
  );
}
