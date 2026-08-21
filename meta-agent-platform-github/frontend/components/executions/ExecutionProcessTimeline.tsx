"use client";

import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  XCircle,
} from "lucide-react";

import type {
  ExecutionStep,
} from "./executionTypes";

type ExecutionProcessTimelineProps = {
  steps: ExecutionStep[];
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

function getStatusClasses(
  status: string,
): string {
  switch (status) {
    case "completed":
      return "border-[#BFDAC6] bg-[#EEF6F0] text-[#438252]";

    case "failed":
      return "border-[#F0C9AB] bg-[#FFF0E8] text-[#D95117]";

    case "running":
      return "border-[#C7D9EE] bg-[#EDF4FC] text-[#3569B8]";

    default:
      return "border-[#DCE4EE] bg-[#F1F4F7] text-[#68727B]";
  }
}

function getNodeClasses(
  status: string,
): string {
  switch (status) {
    case "completed":
      return "border-[#9FC8AA] bg-[#EEF6F0] text-[#438252]";

    case "failed":
      return "border-[#E5A67E] bg-[#FFF0E8] text-[#D95117]";

    case "running":
      return "border-[#9DBDE3] bg-[#EDF4FC] text-[#3569B8]";

    default:
      return "border-[#CFD7DF] bg-[#F1F4F7] text-[#68727B]";
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

export function ExecutionProcessTimeline({
  steps,
}: ExecutionProcessTimelineProps) {
  if (steps.length === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <h2 className="text-[19px] font-semibold text-[#202126]">
          Process Timeline
        </h2>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Agent execution order and runtime metrics.
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-12 text-center">
          <p className="text-[13px] text-[#8A9299]">
            No agent steps were saved for this execution.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <div>
        <h2 className="text-[19px] font-semibold text-[#202126]">
          Process Timeline
        </h2>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Follow every subagent from start to completion.
        </p>
      </div>

      <div className="mt-7">
        {steps.map(
          (
            step,
            index,
          ) => {
            const isLast =
              index === steps.length - 1;

            return (
              <div
                key={step.id}
                className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-4"
              >
                <div className="relative flex justify-center">
                  {!isLast ? (
                    <div className="absolute left-1/2 top-11 h-[calc(100%-12px)] w-px -translate-x-1/2 bg-[#DCE4EE]" />
                  ) : null}

                  <span
                    className={[
                      "relative z-10 flex size-10 items-center justify-center rounded-full border-2",
                      getNodeClasses(
                        step.status,
                      ),
                    ].join(" ")}
                  >
                    <StatusIcon
                      status={step.status}
                    />
                  </span>
                </div>

                <article
                  className={[
                    "mb-5 rounded-xl border p-5 transition",
                    step.status === "failed"
                      ? "border-[#F0C9AB] bg-[#FFF9F5]"
                      : "border-[#DCE4EE] bg-[#FAFBFC]",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[12px] font-bold text-[#3569B8]">
                          {step.order}
                        </span>

                        <div className="min-w-0">
                          <h3 className="truncate text-[15px] font-semibold text-[#30343A]">
                            {step.name}
                          </h3>

                          {step.role ? (
                            <p className="mt-0.5 truncate text-[11px] text-[#8A9299]">
                              {step.role}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <span
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em]",
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
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-[#E3E8ED] bg-white px-3.5 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                        Started
                      </p>

                      <p className="mt-1.5 text-[12px] font-medium text-[#4E5963]">
                        {formatDate(
                          step.started_at,
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#E3E8ED] bg-white px-3.5 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                        Completed
                      </p>

                      <p className="mt-1.5 text-[12px] font-medium text-[#4E5963]">
                        {formatDate(
                          step.completed_at,
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#E3E8ED] bg-white px-3.5 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                        Duration
                      </p>

                      <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                        {formatDuration(
                          step.duration_ms,
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#E3E8ED] bg-white px-3.5 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                        Total Tokens
                      </p>

                      <p className="mt-1.5 text-[12px] font-semibold text-[#30343A]">
                        {formatNumber(
                          step.total_tokens,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-md bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#59636C] ring-1 ring-inset ring-[#E1E6EB]">
                      Input{" "}
                      {formatNumber(
                        step.input_tokens,
                      )}
                    </span>

                    <span className="rounded-md bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#59636C] ring-1 ring-inset ring-[#E1E6EB]">
                      Output{" "}
                      {formatNumber(
                        step.output_tokens,
                      )}
                    </span>

                    <span className="rounded-md bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#59636C] ring-1 ring-inset ring-[#E1E6EB]">
                      Model{" "}
                      {step.model_name ||
                        "—"}
                    </span>

                    <span className="rounded-md bg-white px-2.5 py-1.5 text-[10px] font-medium text-[#59636C] ring-1 ring-inset ring-[#E1E6EB]">
                      Retries{" "}
                      {step.retry_count}
                    </span>
                  </div>

                  {step.error ? (
                    <div className="mt-4 rounded-lg border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#B36A48]">
                        Error
                      </p>

                      <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-6 text-[#D95117]">
                        {step.error}
                      </p>
                    </div>
                  ) : null}
                </article>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}