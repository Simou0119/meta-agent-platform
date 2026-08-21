"use client";

import {
  ChevronDown,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  XCircle,
} from "lucide-react";

import type {
  ExecutionStep,
} from "./executionTypes";

type ExecutionAgentTableProps = {
  steps: ExecutionStep[];
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
    return `${durationMs} ms`;
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
  ).format(value);
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
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

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

export function ExecutionAgentTable({
  steps,
}: ExecutionAgentTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <header className="border-b border-[#E3E8ED] px-6 py-5">
        <h2 className="text-[19px] font-semibold text-[#202126]">
          Subagent Metrics
        </h2>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Compare duration, token usage, model calls, and status across all subagents.
        </p>
      </header>

      {steps.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No subagent execution data is available.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] border-collapse">
            <thead>
              <tr className="border-b border-[#E3E8ED] bg-[#FAFBFC]">
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Order
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Agent
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Status
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Duration
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Input
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Output
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Total
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Model
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Retries
                </th>

                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                  Details
                </th>
              </tr>
            </thead>

            <tbody>
              {steps.map(
                (step) => (
                  <tr
                    key={step.id}
                    className="border-b border-[#EDF0F3] last:border-b-0"
                  >
                    <td className="px-4 py-4 align-top">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-[#E8F0FB] text-[12px] font-bold text-[#3569B8]">
                        {step.order}
                      </span>
                    </td>

                    <td className="max-w-[240px] px-4 py-4 align-top">
                      <p className="truncate text-[13px] font-semibold text-[#30343A]">
                        {step.name}
                      </p>

                      {step.role ? (
                        <p className="mt-1 truncate text-[10px] text-[#8A9299]">
                          {step.role}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em]",
                          getStatusClasses(
                            step.status,
                          ),
                        ].join(" ")}
                      >
                        <StatusIcon
                          status={step.status}
                        />

                        {step.status}
                      </span>
                    </td>

                    <td className="px-4 py-4 align-top text-[12px] font-semibold text-[#30343A]">
                      {formatDuration(
                        step.duration_ms,
                      )}
                    </td>

                    <td className="px-4 py-4 text-right align-top text-[12px] text-[#59636C]">
                      {formatNumber(
                        step.input_tokens,
                      )}
                    </td>

                    <td className="px-4 py-4 text-right align-top text-[12px] text-[#59636C]">
                      {formatNumber(
                        step.output_tokens,
                      )}
                    </td>

                    <td className="px-4 py-4 text-right align-top text-[12px] font-semibold text-[#30343A]">
                      {formatNumber(
                        step.total_tokens,
                      )}
                    </td>

                    <td className="max-w-[180px] px-4 py-4 align-top">
                      <p
                        className="truncate text-[11px] text-[#59636C]"
                        title={
                          step.model_name
                        }
                      >
                        {step.model_name ||
                          "—"}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-right align-top text-[12px] text-[#59636C]">
                      {step.retry_count}
                    </td>

                    <td className="px-4 py-4 align-top">
                      <details className="group">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[#D8DEE5] bg-white px-3 py-2 text-[11px] font-semibold text-[#4E5963] transition hover:border-[#B9CBE0] hover:bg-[#F6F8FA] hover:text-[#3569B8]">
                          View
                          <ChevronDown
                            className="size-3.5 transition group-open:rotate-180"
                            aria-hidden
                          />
                        </summary>

                        <div className="mt-3 w-[420px] rounded-xl border border-[#DCE4EE] bg-[#FAFBFC] p-4 shadow-sm">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-[#E3E8ED] bg-white px-3 py-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                                Started
                              </p>

                              <p className="mt-1.5 text-[11px] text-[#4E5963]">
                                {formatDate(
                                  step.started_at,
                                )}
                              </p>
                            </div>

                            <div className="rounded-lg border border-[#E3E8ED] bg-white px-3 py-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                                Completed
                              </p>

                              <p className="mt-1.5 text-[11px] text-[#4E5963]">
                                {formatDate(
                                  step.completed_at,
                                )}
                              </p>
                            </div>
                          </div>

                          {step.description ? (
                            <div className="mt-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                                Description
                              </p>

                              <p className="mt-1.5 text-[11px] leading-5 text-[#59636C]">
                                {step.description}
                              </p>
                            </div>
                          ) : null}

                          <div className="mt-3">
                            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                              Response ID
                            </p>

                            <p className="mt-1.5 break-all text-[11px] text-[#59636C]">
                              {step.response_id ||
                                "—"}
                            </p>
                          </div>

                          {step.error ? (
                            <div className="mt-3 rounded-lg border border-[#F0C9AB] bg-[#FFF3EC] px-3 py-3">
                              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#B36A48]">
                                Error
                              </p>

                              <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#D95117]">
                                {step.error}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </details>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}