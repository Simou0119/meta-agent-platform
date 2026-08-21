"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Gauge,
  RefreshCw,
  Timer,
  XCircle,
} from "lucide-react";

import {
  getApiBaseUrl,
} from "../../lib/api";

import {
  AgentDurationChart,
} from "../metrics/AgentDurationChart";
import {
  AgentTokenChart,
} from "../metrics/AgentTokenChart";
import {
  DurationTokenScatter,
} from "../metrics/DurationTokenScatter";
import {
  WorkflowDurationChart,
} from "../metrics/WorkflowDurationChart";
import {
  WorkflowTokenChart,
} from "../metrics/WorkflowTokenChart";

import type {
  ApiErrorResponse,
  WorkflowMetricsResponse,
} from "../metrics/metricsTypes";
import { InternalSectionNav } from "./InternalSectionNav";

type MetricsPanelProps = {
  workflowId: number;
  onViewExecution: (
    runId: number,
  ) => void;
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
    return `${seconds.toFixed(2)} s`;
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
    {
      maximumFractionDigits: 2,
    },
  ).format(value);
}

export function MetricsPanel({
  workflowId,
}: MetricsPanelProps) {
  const [metrics, setMetrics] =
    useState<WorkflowMetricsResponse | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadMetrics =
    useCallback(async (): Promise<void> => {
      if (
        !Number.isInteger(workflowId) ||
        workflowId <= 0
      ) {
        setError("Invalid workflow ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}/metrics`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowMetricsResponse
          | ApiErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ApiErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load workflow metrics.",
          );
        }

        const metricsData =
          data as WorkflowMetricsResponse;

        setMetrics({
          ...metricsData,
          duration_trend:
            metricsData.duration_trend ??
            [],
          agents:
            metricsData.agents
              ?.slice()
              .sort(
                (
                  firstAgent,
                  secondAgent,
                ) =>
                  firstAgent.agent_order -
                  secondAgent.agent_order,
              ) ?? [],
        });
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load workflow metrics.",
        );
      } finally {
        setLoading(false);
      }
    }, [workflowId]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  if (loading) {
    return (
      <section className="flex min-h-[520px] items-center justify-center rounded-2xl border border-[#DCE4EE] bg-white">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

          <p className="mt-4 text-[14px] text-[#73757A]">
            Loading workflow metrics...
          </p>
        </div>
      </section>
    );
  }

  if (error || !metrics) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6">
        <div className="rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-5 py-4">
          <p className="text-[14px] font-medium text-[#D95117]">
            {error ??
              "Workflow metrics are unavailable."}
          </p>

          <button
            type="button"
            onClick={() => {
              void loadMetrics();
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#3569B8] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#2F5FA8]"
          >
            <RefreshCw
              className="size-3.5"
              aria-hidden
            />

            Try Again
          </button>
        </div>
      </section>
    );
  }

  const summary = metrics.workflow;

  const durationCards = [
    {
      label: "Fastest Time",
      value: formatDuration(
        summary.fastest_duration_ms,
      ),
      description:
        "Shortest completed execution",
      icon: Gauge,
      iconClasses:
        "bg-[#E8F0FB] text-[#3569B8]",
    },
    {
      label: "Average Time",
      value: formatDuration(
        summary.average_duration_ms,
      ),
      description:
        "Mean completed execution time",
      icon: Timer,
      iconClasses:
        "bg-[#F1F4F7] text-[#59636C]",
    },
    {
      label: "Median Time",
      value: formatDuration(
        summary.median_duration_ms,
      ),
      description:
        "Middle completed execution",
      icon: Clock3,
      iconClasses:
        "bg-[#EDF4FC] text-[#3569B8]",
    },
    {
      label: "P95 Time",
      value: formatDuration(
        summary.p95_duration_ms,
      ),
      description:
        "95% finish within this time",
      icon: Activity,
      iconClasses:
        "bg-[#FFF5E8] text-[#B36A48]",
    },
    {
      label: "Slowest Time",
      value: formatDuration(
        summary.slowest_duration_ms,
      ),
      description:
        "Longest completed execution",
      icon: Timer,
      iconClasses:
        "bg-[#FFF0E8] text-[#D95117]",
    },
    {
      label: "Standard Deviation",
      value: formatDuration(
        summary.duration_stddev_ms,
      ),
      description:
        "Execution-time variability",
      icon: Activity,
      iconClasses:
        "bg-[#F3EFFB] text-[#7057A8]",
    },
  ];

  const metricsSections = [
    { id: "metrics-overview", label: "Overview" },
    { id: "metrics-duration", label: "Duration" },
    { id: "metrics-tokens", label: "Tokens" },
    { id: "metrics-workflow-trends", label: "Workflow Trends" },
    { id: "metrics-agent-performance", label: "Agent Performance" },
    { id: "metrics-efficiency", label: "Efficiency" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[21px] font-semibold text-[#202126]">
              Metrics
            </h2>

            <p className="mt-1 text-[14px] leading-6 text-[#73757A]">
              Analyze workflow duration, stability, token usage, and subagent performance.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadMetrics();
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#D8DEE5] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#4E5963] transition hover:bg-[#F6F8FA]"
          >
            <RefreshCw
              className="size-3.5"
              aria-hidden
            />

            Refresh
          </button>
        </div>
      </section>

      <InternalSectionNav items={metricsSections} />

      <div id="metrics-overview" className="scroll-mt-24">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
            <Activity
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Total Runs
          </p>

          <p className="mt-2 text-[28px] font-semibold text-[#202126]">
            {summary.total_runs}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#EEF6F0] text-[#438252]">
            <CheckCircle2
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Completed
          </p>

          <p className="mt-2 text-[28px] font-semibold text-[#202126]">
            {summary.completed_runs}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#D95117]">
            <XCircle
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Failed
          </p>

          <p className="mt-2 text-[28px] font-semibold text-[#202126]">
            {summary.failed_runs}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#F1F4F7] text-[#59636C]">
            <Clock3
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Running
          </p>

          <p className="mt-2 text-[28px] font-semibold text-[#202126]">
            {summary.running_runs}
          </p>
        </article>
      </section>
      </div>

      <div id="metrics-duration" className="scroll-mt-24">
      <section>
        <div>
          <h3 className="text-[18px] font-semibold text-[#202126]">
            Workflow Duration
          </h3>

          <p className="mt-1 text-[13px] text-[#8A9299]">
            Summary statistics calculated from completed workflow executions.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {durationCards.map(
            (card) => {
              const Icon = card.icon;

              return (
                <article
                  key={card.label}
                  className="rounded-xl border border-[#DCE4EE] bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span
                      className={[
                        "flex size-10 shrink-0 items-center justify-center rounded-xl",
                        card.iconClasses,
                      ].join(" ")}
                    >
                      <Icon
                        className="size-4"
                        aria-hidden
                      />
                    </span>

                    <span className="text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                      {card.label}
                    </span>
                  </div>

                  <p className="mt-5 text-[25px] font-semibold tracking-[-0.02em] text-[#202126]">
                    {card.value}
                  </p>

                  <p className="mt-1 text-[11px] leading-5 text-[#73757A]">
                    {card.description}
                  </p>
                </article>
              );
            },
          )}
        </div>
      </section>
      </div>

      <div id="metrics-tokens" className="scroll-mt-24">
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6">
        <h3 className="text-[18px] font-semibold text-[#202126]">
          Token Summary
        </h3>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Average token usage across completed workflow executions.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl bg-[#FAFBFC] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
              Average Input
            </p>

            <p className="mt-2 text-[20px] font-semibold text-[#202126]">
              {formatNumber(
                summary.average_input_tokens,
              )}
            </p>
          </div>

          <div className="rounded-xl bg-[#FAFBFC] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
              Average Output
            </p>

            <p className="mt-2 text-[20px] font-semibold text-[#202126]">
              {formatNumber(
                summary.average_output_tokens,
              )}
            </p>
          </div>

          <div className="rounded-xl bg-[#FAFBFC] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
              Average Total
            </p>

            <p className="mt-2 text-[20px] font-semibold text-[#202126]">
              {formatNumber(
                summary.average_total_tokens,
              )}
            </p>
          </div>

          <div className="rounded-xl bg-[#FAFBFC] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
              Minimum Total
            </p>

            <p className="mt-2 text-[20px] font-semibold text-[#202126]">
              {formatNumber(
                summary.minimum_total_tokens,
              )}
            </p>
          </div>

          <div className="rounded-xl bg-[#FAFBFC] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
              Maximum Total
            </p>

            <p className="mt-2 text-[20px] font-semibold text-[#202126]">
              {formatNumber(
                summary.maximum_total_tokens,
              )}
            </p>
          </div>
        </div>
      </section>
      </div>

      <div id="metrics-workflow-trends" className="scroll-mt-24 space-y-6">
      <WorkflowDurationChart
        summary={metrics.workflow}
        runs={metrics.duration_trend}
      />

      <WorkflowTokenChart
        runs={metrics.duration_trend}
      />
      </div>

      <div id="metrics-agent-performance" className="scroll-mt-24 space-y-6">
        <AgentDurationChart
          agents={metrics.agents}
        />

        <AgentTokenChart
          agents={metrics.agents}
        />
      </div>

      <div id="metrics-efficiency" className="scroll-mt-24">
        <DurationTokenScatter
          runs={metrics.duration_trend}
        />
      </div>
    </div>
  );
}