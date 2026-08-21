"use client";

import type {
  AgentMetricsItem,
} from "./metricsTypes";

type AgentDurationChartProps = {
  agents: AgentMetricsItem[];
};

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

function getBarWidth(
  value: number | null,
  maxValue: number,
): string {
  if (
    value === null ||
    value <= 0 ||
    maxValue <= 0
  ) {
    return "0%";
  }

  return `${Math.max(
    2,
    (
      value /
      maxValue
    ) * 100,
  )}%`;
}

export function AgentDurationChart({
  agents,
}: AgentDurationChartProps) {
  const usableAgents = agents.filter(
    (agent) =>
      agent.fastest_duration_ms !== null ||
      agent.average_duration_ms !== null ||
      agent.p95_duration_ms !== null,
  );

  if (usableAgents.length === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <h3 className="text-[18px] font-semibold text-[#202126]">
          Subagent Duration Comparison
        </h3>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Compare fastest, average, and P95 duration across all subagents.
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-12 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No subagent duration data is available.
          </p>
        </div>
      </section>
    );
  }

  const maxDuration = Math.max(
    1,
    ...usableAgents.flatMap(
      (agent) => [
        agent.fastest_duration_ms ?? 0,
        agent.average_duration_ms ?? 0,
        agent.p95_duration_ms ?? 0,
      ],
    ),
  );

  return (
    <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-semibold text-[#202126]">
            Subagent Duration Comparison
          </h3>

          <p className="mt-1 text-[13px] text-[#8A9299]">
            Compare fastest, average, and P95 duration for every subagent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium text-[#68727B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#7057A8]" />
            Fastest
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#3569B8]" />
            Average
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#D95117]" />
            P95
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        {usableAgents.map(
          (agent) => (
            <article
              key={`${agent.agent_id ?? "none"}-${agent.agent_name}`}
              className="rounded-xl border border-[#E1E6EB] bg-[#FAFBFC] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[12px] font-bold text-[#3569B8]">
                      {agent.agent_order}
                    </span>

                    <div className="min-w-0">
                      <h4 className="truncate text-[14px] font-semibold text-[#30343A]">
                        {agent.agent_name}
                      </h4>

                      <p className="mt-0.5 text-[10px] text-[#8A9299]">
                        {agent.completed_count} completed · {agent.failed_count} failed
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#E1E6EB] bg-white px-3 py-2 text-right">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Avg. Contribution
                  </p>

                  <p className="mt-1 text-[13px] font-semibold text-[#30343A]">
                    {agent.average_duration_percentage.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-[82px_minmax(0,1fr)_72px] items-center gap-3">
                  <span className="text-[10px] font-semibold text-[#68727B]">
                    Fastest
                  </span>

                  <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E1E6EB]">
                    <div
                      className="h-full rounded-full bg-[#7057A8]"
                      style={{
                        width: getBarWidth(
                          agent.fastest_duration_ms,
                          maxDuration,
                        ),
                      }}
                    />
                  </div>

                  <span className="text-right text-[11px] font-semibold text-[#4E5963]">
                    {formatDuration(
                      agent.fastest_duration_ms,
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-[82px_minmax(0,1fr)_72px] items-center gap-3">
                  <span className="text-[10px] font-semibold text-[#68727B]">
                    Average
                  </span>

                  <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E1E6EB]">
                    <div
                      className="h-full rounded-full bg-[#3569B8]"
                      style={{
                        width: getBarWidth(
                          agent.average_duration_ms,
                          maxDuration,
                        ),
                      }}
                    />
                  </div>

                  <span className="text-right text-[11px] font-semibold text-[#4E5963]">
                    {formatDuration(
                      agent.average_duration_ms,
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-[82px_minmax(0,1fr)_72px] items-center gap-3">
                  <span className="text-[10px] font-semibold text-[#68727B]">
                    P95
                  </span>

                  <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E1E6EB]">
                    <div
                      className="h-full rounded-full bg-[#D95117]"
                      style={{
                        width: getBarWidth(
                          agent.p95_duration_ms,
                          maxDuration,
                        ),
                      }}
                    />
                  </div>

                  <span className="text-right text-[11px] font-semibold text-[#4E5963]">
                    {formatDuration(
                      agent.p95_duration_ms,
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-inset ring-[#E1E6EB]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Median
                  </p>

                  <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                    {formatDuration(
                      agent.median_duration_ms,
                    )}
                  </p>
                </div>

                <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-inset ring-[#E1E6EB]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Slowest
                  </p>

                  <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                    {formatDuration(
                      agent.slowest_duration_ms,
                    )}
                  </p>
                </div>

                <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-inset ring-[#E1E6EB]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Std. Deviation
                  </p>

                  <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                    {formatDuration(
                      agent.duration_stddev_ms,
                    )}
                  </p>
                </div>
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}
