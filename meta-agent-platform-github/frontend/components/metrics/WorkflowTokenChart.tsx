"use client";

import type {
  WorkflowMetricsTrendItem,
} from "./metricsTypes";

type WorkflowTokenChartProps = {
  runs: WorkflowMetricsTrendItem[];
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

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

export function WorkflowTokenChart({
  runs,
}: WorkflowTokenChartProps) {
  const usableRuns = runs.filter(
    (run) =>
      run.status === "completed" &&
      run.total_tokens > 0,
  );

  if (usableRuns.length === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <h3 className="text-[18px] font-semibold text-[#202126]">
          Workflow Token Usage
        </h3>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Compare input, output, and total tokens for every completed execution.
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-12 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No completed executions with token data are available.
          </p>
        </div>
      </section>
    );
  }

  const width = 920;
  const height = 360;

  const paddingLeft = 64;
  const paddingRight = 24;
  const paddingTop = 30;
  const paddingBottom = 66;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const maxTokens = Math.max(
    1,
    ...usableRuns.map(
      (run) => run.total_tokens,
    ),
  );

  const chartMax =
    maxTokens * 1.12;

  const slotWidth =
    chartWidth /
    usableRuns.length;

  const barWidth = Math.min(
    42,
    slotWidth * 0.56,
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
            Workflow Token Usage
          </h3>

          <p className="mt-1 text-[13px] text-[#8A9299]">
            Stacked token usage for each completed workflow execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium text-[#68727B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#3569B8]" />
            Input Tokens
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#8DB0DB]" />
            Output Tokens
          </span>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[780px] w-full"
          role="img"
          aria-label="Workflow token usage by execution"
        >
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
                    {formatNumber(
                      Math.round(value),
                    )}
                  </text>
                </g>
              );
            },
          )}

          {usableRuns.map(
            (
              run,
              index,
            ) => {
              const centerX =
                paddingLeft +
                slotWidth *
                  index +
                slotWidth / 2;

              const inputHeight =
                (
                  run.input_tokens /
                  chartMax
                ) *
                chartHeight;

              const outputHeight =
                (
                  run.output_tokens /
                  chartMax
                ) *
                chartHeight;

              const inputY =
                paddingTop +
                chartHeight -
                inputHeight;

              const outputY =
                inputY -
                outputHeight;

              return (
                <g key={run.run_id}>
                  <rect
                    x={
                      centerX -
                      barWidth / 2
                    }
                    y={inputY}
                    width={barWidth}
                    height={inputHeight}
                    rx="4"
                    fill="#3569B8"
                  >
                    <title>
                      {`Execution #${run.run_id} input tokens: ${formatNumber(run.input_tokens)}`}
                    </title>
                  </rect>

                  <rect
                    x={
                      centerX -
                      barWidth / 2
                    }
                    y={outputY}
                    width={barWidth}
                    height={outputHeight}
                    rx="4"
                    fill="#8DB0DB"
                  >
                    <title>
                      {`Execution #${run.run_id} output tokens: ${formatNumber(run.output_tokens)}`}
                    </title>
                  </rect>

                  <text
                    x={centerX}
                    y={outputY - 9}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill="#3569B8"
                  >
                    {formatNumber(
                      run.total_tokens,
                    )}
                  </text>

                  <text
                    x={centerX}
                    y={
                      paddingTop +
                      chartHeight +
                      24
                    }
                    textAnchor="middle"
                    fontSize="10"
                    fill="#7A838B"
                  >
                    #{run.run_id}
                  </text>

                  <text
                    x={centerX}
                    y={
                      paddingTop +
                      chartHeight +
                      42
                    }
                    textAnchor="middle"
                    fontSize="9"
                    fill="#A0A8AF"
                  >
                    {formatShortDate(
                      run.created_at,
                    )}
                  </text>
                </g>
              );
            },
          )}
        </svg>
      </div>
    </section>
  );
}
