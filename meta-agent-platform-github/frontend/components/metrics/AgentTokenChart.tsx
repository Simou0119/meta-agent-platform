"use client";

import type {
  AgentMetricsItem,
} from "./metricsTypes";

type AgentTokenChartProps = {
  agents: AgentMetricsItem[];
};

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      maximumFractionDigits: 1,
    },
  ).format(value);
}

function getBarWidth(
  value: number,
  maxValue: number,
): string {
  if (
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

export function AgentTokenChart({
  agents,
}: AgentTokenChartProps) {
  const usableAgents = agents.filter(
    (agent) =>
      agent.average_total_tokens > 0 ||
      agent.average_input_tokens > 0 ||
      agent.average_output_tokens > 0,
  );

  if (usableAgents.length === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <h3 className="text-[18px] font-semibold text-[#202126]">
          Subagent Token Comparison
        </h3>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Compare average input, output, and total token usage across subagents.
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-12 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No subagent token data is available.
          </p>
        </div>
      </section>
    );
  }

  const maxTokenValue = Math.max(
    1,
    ...usableAgents.flatMap(
      (agent) => [
        agent.average_input_tokens,
        agent.average_output_tokens,
        agent.average_total_tokens,
      ],
    ),
  );

  return (
    <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[18px] font-semibold text-[#202126]">
            Subagent Token Comparison
          </h3>

          <p className="mt-1 text-[13px] text-[#8A9299]">
            Compare average token consumption for every subagent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px] font-medium text-[#68727B]">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#3569B8]" />
            Input
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#8DB0DB]" />
            Output
          </span>

          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-[#7057A8]" />
            Total
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
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[12px] font-bold text-[#3569B8]">
                    {agent.agent_order}
                  </span>

                  <div className="min-w-0">
                    <h4 className="truncate text-[14px] font-semibold text-[#30343A]">
                      {agent.agent_name}
                    </h4>

                    <p className="mt-0.5 text-[10px] text-[#8A9299]">
                      Based on {agent.completed_count} completed runs
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-[#E1E6EB] bg-white px-3 py-2 text-right">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Avg. Total
                  </p>

                  <p className="mt-1 text-[13px] font-semibold text-[#30343A]">
                    {formatNumber(
                      agent.average_total_tokens,
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-[82px_minmax(0,1fr)_82px] items-center gap-3">
                  <span className="text-[10px] font-semibold text-[#68727B]">
                    Input
                  </span>

                  <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E1E6EB]">
                    <div
                      className="h-full rounded-full bg-[#3569B8]"
                      style={{
                        width: getBarWidth(
                          agent.average_input_tokens,
                          maxTokenValue,
                        ),
                      }}
                    />
                  </div>

                  <span className="text-right text-[11px] font-semibold text-[#4E5963]">
                    {formatNumber(
                      agent.average_input_tokens,
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-[82px_minmax(0,1fr)_82px] items-center gap-3">
                  <span className="text-[10px] font-semibold text-[#68727B]">
                    Output
                  </span>

                  <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E1E6EB]">
                    <div
                      className="h-full rounded-full bg-[#8DB0DB]"
                      style={{
                        width: getBarWidth(
                          agent.average_output_tokens,
                          maxTokenValue,
                        ),
                      }}
                    />
                  </div>

                  <span className="text-right text-[11px] font-semibold text-[#4E5963]">
                    {formatNumber(
                      agent.average_output_tokens,
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-[82px_minmax(0,1fr)_82px] items-center gap-3">
                  <span className="text-[10px] font-semibold text-[#68727B]">
                    Total
                  </span>

                  <div className="h-3 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E1E6EB]">
                    <div
                      className="h-full rounded-full bg-[#7057A8]"
                      style={{
                        width: getBarWidth(
                          agent.average_total_tokens,
                          maxTokenValue,
                        ),
                      }}
                    />
                  </div>

                  <span className="text-right text-[11px] font-semibold text-[#4E5963]">
                    {formatNumber(
                      agent.average_total_tokens,
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-inset ring-[#E1E6EB]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Minimum Total
                  </p>

                  <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                    {formatNumber(
                      agent.minimum_total_tokens,
                    )}
                  </p>
                </div>

                <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-inset ring-[#E1E6EB]">
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    Maximum Total
                  </p>

                  <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                    {formatNumber(
                      agent.maximum_total_tokens,
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
