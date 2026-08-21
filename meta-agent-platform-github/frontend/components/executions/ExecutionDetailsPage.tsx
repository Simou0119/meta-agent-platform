"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Cpu,
  Hash,
  LoaderCircle,
  MessageSquareText,
  XCircle,
} from "lucide-react";

import {
  getApiBaseUrl,
} from "../../lib/api";

import {
  ExecutionAgentTable,
} from "./ExecutionAgentTable";
import {
  ExecutionInputOutput,
} from "./ExecutionInputOutput";
import {
  ExecutionProcessTimeline,
} from "./ExecutionProcessTimeline";

import type {
  ApiErrorResponse,
  ExecutionDetails,
} from "./executionTypes";

function getStatusClasses(
  status: string,
): string {
  switch (status) {
    case "completed":
      return "bg-[#EEF6F0] text-[#438252]";

    case "failed":
      return "bg-[#FFF0E8] text-[#D95117]";

    case "running":
      return "bg-[#EDF4FC] text-[#3569B8]";

    default:
      return "bg-[#F1F4F7] text-[#68727B]";
  }
}

function StatusIcon({
  status,
}: {
  status: string;
}) {
  if (status === "completed") {
    return (
      <CheckCircle2
        className="size-4"
        aria-hidden
      />
    );
  }

  if (status === "failed") {
    return (
      <XCircle
        className="size-4"
        aria-hidden
      />
    );
  }

  if (status === "running") {
    return (
      <LoaderCircle
        className="size-4 animate-spin"
        aria-hidden
      />
    );
  }

  return (
    <Clock3
      className="size-4"
      aria-hidden
    />
  );
}

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

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(
    normalizeDateValue(value),
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
    return `${durationMs} ms`;
  }

  const totalSeconds =
    durationMs / 1000;

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(2)} s`;
  }

  const minutes = Math.floor(
    totalSeconds / 60,
  );

  const seconds = Math.round(
    totalSeconds % 60,
  );

  return `${minutes}m ${seconds}s`;
}

function formatNumber(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-US",
  ).format(value);
}

export function ExecutionDetailsPage() {
  const router = useRouter();

  const params = useParams<{
    workflowId: string;
    runId: string;
  }>();

  const workflowId = Number(
    params.workflowId,
  );

  const runId = Number(
    params.runId,
  );

  const [
    execution,
    setExecution,
  ] = useState<ExecutionDetails | null>(
    null,
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadExecution(): Promise<void> {
      if (
        !Number.isInteger(workflowId) ||
        workflowId <= 0 ||
        !Number.isInteger(runId) ||
        runId <= 0
      ) {
        setError(
          "Invalid workflow or execution ID.",
        );

        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}/runs/${runId}`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | ExecutionDetails
          | ApiErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ApiErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load execution details.",
          );
        }

        if (!active) {
          return;
        }

        const executionData =
          data as ExecutionDetails;

        setExecution({
          ...executionData,

          agents:
            executionData.agents
              ?.slice()
              .sort(
                (
                  firstAgent,
                  secondAgent,
                ) =>
                  firstAgent.order -
                  secondAgent.order,
              ) ?? [],
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load execution details.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadExecution();

    return () => {
      active = false;
    };
  }, [workflowId, runId]);

  if (loading) {
    return (
      <div className="flex min-h-[620px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto size-9 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

          <p className="mt-4 text-[15px] text-[#73757A]">
            Loading execution details...
          </p>
        </div>
      </div>
    );
  }

  if (error || !execution) {
    return (
      <section className="mx-auto max-w-[800px]">
        <button
          type="button"
          onClick={() => {
            router.push(
              `/app/workflows/${workflowId}`,
            );
          }}
          className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#3569B8] transition hover:text-[#2F5FA8]"
        >
          <ArrowLeft
            className="size-4"
            aria-hidden
          />

          Back to Workflow
        </button>

        <div className="mt-8 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-5 py-4 text-[14px] font-medium text-[#D95117]">
          {error ??
            "Execution not found."}
        </div>
      </section>
    );
  }

  const completedSteps =
    execution.agents.filter(
      (agent) =>
        agent.status === "completed",
    ).length;

  const failedSteps =
    execution.agents.filter(
      (agent) =>
        agent.status === "failed",
    ).length;

  return (
    <section>
      <button
        type="button"
        onClick={() => {
          router.push(
            `/app/workflows/${workflowId}`,
          );
        }}
        className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#3569B8] transition hover:text-[#2F5FA8]"
      >
        <ArrowLeft
          className="size-4"
          aria-hidden
        />

        Back to Workflow
      </button>

      <header className="mt-6 rounded-2xl border border-[#DCE4EE] bg-white px-7 py-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[27px] font-semibold tracking-[-0.02em] text-[#202126]">
                Execution #{execution.display_number}
              </h1>

              <span
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.07em]",
                  getStatusClasses(
                    execution.status,
                  ),
                ].join(" ")}
              >
                <StatusIcon
                  status={execution.status}
                />

                {execution.status}
              </span>
            </div>

            <p className="mt-3 text-[13px] text-[#73757A]">
              Workflow #{execution.workflow_id}
            </p>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-[#73757A]">
              <span>
                Started:{" "}
                <strong className="font-semibold text-[#4E5963]">
                  {formatDate(
                    execution.created_at,
                  )}
                </strong>
              </span>

              <span>
                Completed:{" "}
                <strong className="font-semibold text-[#4E5963]">
                  {formatDate(
                    execution.completed_at,
                  )}
                </strong>
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#DCE4EE] bg-[#FAFBFC] px-5 py-4 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#949CA4]">
              Total Duration
            </p>

            <p className="mt-2 text-[24px] font-semibold text-[#202126]">
              {formatDuration(
                execution.duration_ms,
              )}
            </p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#E8F0FB] text-[#3569B8]">
            <Hash
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Total Tokens
          </p>

          <p className="mt-2 text-[22px] font-semibold text-[#202126]">
            {formatNumber(
              execution.total_tokens,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#F1F4F7] text-[#59636C]">
            <MessageSquareText
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Input Tokens
          </p>

          <p className="mt-2 text-[22px] font-semibold text-[#202126]">
            {formatNumber(
              execution.input_tokens,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#F1F4F7] text-[#59636C]">
            <MessageSquareText
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Output Tokens
          </p>

          <p className="mt-2 text-[22px] font-semibold text-[#202126]">
            {formatNumber(
              execution.output_tokens,
            )}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#EDF4FC] text-[#3569B8]">
            <Cpu
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Model Calls
          </p>

          <p className="mt-2 text-[22px] font-semibold text-[#202126]">
            {execution.model_calls}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#EEF6F0] text-[#438252]">
            <CheckCircle2
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Completed Steps
          </p>

          <p className="mt-2 text-[22px] font-semibold text-[#202126]">
            {completedSteps}
          </p>
        </article>

        <article className="rounded-xl border border-[#DCE4EE] bg-white p-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#FFF0E8] text-[#D95117]">
            <XCircle
              className="size-4"
              aria-hidden
            />
          </span>

          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
            Failed Steps
          </p>

          <p className="mt-2 text-[22px] font-semibold text-[#202126]">
            {failedSteps}
          </p>
        </article>
      </section>

      <div className="mt-6">
        <ExecutionProcessTimeline
          steps={execution.agents}
        />
      </div>

      <div className="mt-6">
        <ExecutionAgentTable
          steps={execution.agents}
        />
      </div>

      <div className="mt-6">
        <ExecutionInputOutput
          execution={execution}
        />
      </div>
    </section>
  );
}