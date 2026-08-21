"use client";

import type {
  WorkflowMetricsTrendItem,
} from "./metricsTypes";

type DurationTokenScatterProps = {
  runs: WorkflowMetricsTrendItem[];
};

type ScatterPoint = {
  runId: number;
  tokens: number;
  durationMs: number;
  createdAt: string;
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
  durationMs: number,
): string {
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

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

function calculateCorrelation(
  runs: WorkflowMetricsTrendItem[],
): number | null {
  if (runs.length < 2) {
    return null;
  }

  const tokenValues = runs.map(
    (run) => run.total_tokens,
  );

  const durationValues = runs.map(
    (run) => run.duration_ms ?? 0,
  );

  const tokenMean =
    tokenValues.reduce(
      (sum, value) => sum + value,
      0,
    ) / tokenValues.length;

  const durationMean =
    durationValues.reduce(
      (sum, value) => sum + value,
      0,
    ) / durationValues.length;

  let numerator = 0;
  let tokenSquaredSum = 0;
  let durationSquaredSum = 0;

  for (
    let index = 0;
    index < runs.length;
    index += 1
  ) {
    const tokenDifference =
      tokenValues[index] - tokenMean;

    const durationDifference =
      durationValues[index] - durationMean;

    numerator +=
      tokenDifference *
      durationDifference;

    tokenSquaredSum +=
      tokenDifference ** 2;

    durationSquaredSum +=
      durationDifference ** 2;
  }

  const denominator = Math.sqrt(
    tokenSquaredSum *
      durationSquaredSum,
  );

  if (denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

function getCorrelationLabel(
  correlation: number | null,
): string {
  if (correlation === null) {
    return "Not enough data";
  }

  const absoluteValue = Math.abs(
    correlation,
  );

  if (absoluteValue < 0.2) {
    return "Very weak";
  }

  if (absoluteValue < 0.4) {
    return "Weak";
  }

  if (absoluteValue < 0.6) {
    return "Moderate";
  }

  if (absoluteValue < 0.8) {
    return "Strong";
  }

  return "Very strong";
}

export function DurationTokenScatter({
  runs,
}: DurationTokenScatterProps) {
  const usableRuns = runs.filter(
    (run) =>
      run.status === "completed" &&
      run.duration_ms !== null &&
      run.duration_ms >= 0 &&
      run.total_tokens > 0,
  );

  if (usableRuns.length === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <h3 className="text-[18px] font-semibold text-[#202126]">
          Duration vs. Token Usage
        </h3>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Analyze whether larger token usage is associated with longer workflow duration.
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-12 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No completed executions with duration and token data are available.
          </p>
        </div>
      </section>
    );
  }

  const width = 900;
  const height = 360;

  const paddingLeft = 72;
  const paddingRight = 28;
  const paddingTop = 28;
  const paddingBottom = 66;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const minTokens = Math.min(
    ...usableRuns.map(
      (run) => run.total_tokens,
    ),
  );

  const maxTokens = Math.max(
    ...usableRuns.map(
      (run) => run.total_tokens,
    ),
  );

  const minDuration = Math.min(
    ...usableRuns.map(
      (run) => run.duration_ms ?? 0,
    ),
  );

  const maxDuration = Math.max(
    ...usableRuns.map(
      (run) => run.duration_ms ?? 0,
    ),
  );

  const tokenRange = Math.max(
    1,
    maxTokens - minTokens,
  );

  const durationRange = Math.max(
    1,
    maxDuration - minDuration,
  );

  const points: ScatterPoint[] =
    usableRuns.map(
      (run) => {
        const durationMs =
          run.duration_ms ?? 0;

        const x =
          paddingLeft +
          (
            (
              run.total_tokens -
              minTokens
            ) /
            tokenRange
          ) *
            chartWidth;

        const y =
          paddingTop +
          chartHeight -
          (
            (
              durationMs -
              minDuration
            ) /
            durationRange
          ) *
            chartHeight;

        return {
          runId: run.run_id,
          tokens: run.total_tokens,
          durationMs,
          createdAt: run.created_at,
          x,
          y,
        };
      },
    );

  const correlation =
    calculateCorrelation(
      usableRuns,
    );

  const xGridRatios = [
    0,
    0.25,
    0.5,
    0.75,
    1,
  ];

  const yGridRatios = [
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
            Duration vs. Token Usage
          </h3>

          <p className="mt-1 text-[13px] text-[#8A9299]">
            Each point represents one completed workflow execution.
          </p>
        </div>

        <div className="rounded-xl border border-[#E1E6EB] bg-[#FAFBFC] px-4 py-3 text-right">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Correlation
          </p>

          <p className="mt-1 text-[15px] font-semibold text-[#30343A]">
            {correlation === null
              ? "—"
              : correlation.toFixed(2)}
          </p>

          <p className="mt-0.5 text-[10px] text-[#8A9299]">
            {getCorrelationLabel(
              correlation,
            )}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[760px] w-full"
          role="img"
          aria-label="Scatter chart comparing workflow duration and total token usage"
        >
          {yGridRatios.map(
            (ratio) => {
              const y =
                paddingTop +
                chartHeight *
                  ratio;

              const durationValue =
                maxDuration -
                durationRange *
                  ratio;

              return (
                <g key={`y-${ratio}`}>
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
                      durationValue,
                    )}
                  </text>
                </g>
              );
            },
          )}

          {xGridRatios.map(
            (ratio) => {
              const x =
                paddingLeft +
                chartWidth *
                  ratio;

              const tokenValue =
                minTokens +
                tokenRange *
                  ratio;

              return (
                <g key={`x-${ratio}`}>
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={
                      paddingTop +
                      chartHeight
                    }
                    stroke="#EDF0F3"
                    strokeWidth="1"
                  />

                  <text
                    x={x}
                    y={
                      paddingTop +
                      chartHeight +
                      24
                    }
                    textAnchor="middle"
                    fontSize="10"
                    fill="#7A838B"
                  >
                    {formatNumber(
                      Math.round(
                        tokenValue,
                      ),
                    )}
                  </text>
                </g>
              );
            },
          )}

          <text
            x={
              paddingLeft +
              chartWidth / 2
            }
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#59636C"
          >
            Total Tokens
          </text>

          <text
            x="16"
            y={
              paddingTop +
              chartHeight / 2
            }
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#59636C"
            transform={`rotate(-90 16 ${
              paddingTop +
              chartHeight / 2
            })`}
          >
            Duration
          </text>

          {points.map(
            (point) => (
              <g key={point.runId}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="7"
                  fill="#3569B8"
                  fillOpacity="0.78"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                >
                  <title>
                    {`Execution #${point.runId} · ${formatNumber(point.tokens)} tokens · ${formatDuration(point.durationMs)} · ${formatShortDate(point.createdAt)}`}
                  </title>
                </circle>

                {usableRuns.length <= 15 ? (
                  <text
                    x={point.x}
                    y={point.y - 12}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="#3569B8"
                  >
                    #{point.runId}
                  </text>
                ) : null}
              </g>
            ),
          )}
        </svg>
      </div>

      <div className="mt-4 rounded-xl bg-[#FAFBFC] px-4 py-3">
        <p className="text-[11px] leading-5 text-[#68727B]">
          A positive correlation means executions with more tokens tend to take longer.
          A value near 0 means token usage and duration show little linear relationship.
          Correlation does not by itself prove causation.
        </p>
      </div>
    </section>
  );
}
