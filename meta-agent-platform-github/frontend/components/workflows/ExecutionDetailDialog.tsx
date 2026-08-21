"use client";

import {
  useEffect,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  LoaderCircle,
  X,
  XCircle,
} from "lucide-react";

export type WorkflowRunStep = {
  id: number;
  agent_id: number | null;
  name: string;
  role: string;
  description: string;
  order: number;
  status: string;
  output: string;
  error: string;
  created_at: string;
};

export type WorkflowRunDetail = {
  id: number;
  workflow_id: number;
  input: string;
  final_output: string;
  status: string;
  error: string;
  created_at: string;
  completed_at: string | null;
  agents: WorkflowRunStep[];
};

type ExecutionDetailDialogProps = {
  run: WorkflowRunDetail | null;
  loading: boolean;
  onClose: () => void;
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
  value: string,
): string {
  if (!value) {
    return "Unknown date";
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

function getDurationMilliseconds(
  run: WorkflowRunDetail,
): number | null {
  if (!run.completed_at) {
    return null;
  }

  const startedAt = new Date(
    normalizeDateValue(run.created_at),
  ).getTime();

  const completedAt = new Date(
    normalizeDateValue(run.completed_at),
  ).getTime();

  if (
    Number.isNaN(startedAt) ||
    Number.isNaN(completedAt) ||
    completedAt < startedAt
  ) {
    return null;
  }

  return completedAt - startedAt;
}

function formatDuration(
  milliseconds: number | null,
): string {
  if (
    milliseconds === null ||
    milliseconds < 0
  ) {
    return "—";
  }

  const totalSeconds = Math.round(
    milliseconds / 1000,
  );

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(
    totalSeconds / 60,
  );

  const seconds =
    totalSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  const remainingMinutes =
    minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function getStatusBadgeClasses(
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
        className="size-4 text-[#438252]"
        aria-hidden
      />
    );
  }

  if (status === "failed") {
    return (
      <XCircle
        className="size-4 text-[#D95117]"
        aria-hidden
      />
    );
  }

  if (status === "running") {
    return (
      <LoaderCircle
        className="size-4 animate-spin text-[#3569B8]"
        aria-hidden
      />
    );
  }

  return (
    <Clock3
      className="size-4 text-[#8A9299]"
      aria-hidden
    />
  );
}

export function ExecutionDetailDialog({
  run,
  loading,
  onClose,
}: ExecutionDetailDialogProps) {
  useEffect(() => {
    function handleKeyDown(
      event: globalThis.KeyboardEvent,
    ): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center bg-[#18202A]/40 px-5 py-8 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="execution-detail-title"
        className="flex max-h-[88vh] w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_24px_70px_rgba(18,28,38,0.28)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-[#E3E8ED] px-6 py-5">
          <div>
            <h2
              id="execution-detail-title"
              className="text-[20px] font-semibold text-[#202126]"
            >
              Execution Details
            </h2>

            {run ? (
              <p className="mt-1 text-[13px] text-[#8A9299]">
                Execution #{run.id}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#737B83] transition hover:bg-[#F1F3F5] hover:text-[#202126]"
            aria-label="Close execution details"
          >
            <X
              className="size-5"
              aria-hidden
            />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

                <p className="mt-4 text-[14px] text-[#73757A]">
                  Loading execution details...
                </p>
              </div>
            </div>
          ) : !run ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <p className="text-[14px] text-[#8A9299]">
                Execution details are unavailable.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-[#DCE4EE] bg-[#FAFBFC] p-5">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em]",
                          getStatusBadgeClasses(
                            run.status,
                          ),
                        ].join(" ")}
                      >
                        <StatusIcon
                          status={run.status}
                        />

                        {run.status}
                      </span>

                      <span className="text-[12px] text-[#8A9299]">
                        {formatDate(
                          run.created_at,
                        )}
                      </span>
                    </div>

                    <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#949CA4]">
                      Workflow run
                    </p>

                    <p className="mt-1 text-[14px] font-semibold text-[#30343A]">
                      Execution #{run.id}
                    </p>
                  </div>

                  <div className="rounded-xl border border-[#E1E6EB] bg-white px-4 py-3 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                      Duration
                    </p>

                    <p className="mt-1 text-[18px] font-semibold text-[#30343A]">
                      {formatDuration(
                        getDurationMilliseconds(
                          run,
                        ),
                      )}
                    </p>
                  </div>
                </div>
              </section>

              <section className="mt-5 rounded-xl border border-[#DCE4EE] bg-white p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#949CA4]">
                  User input
                </p>

                <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#30343A]">
                  {run.input}
                </p>
              </section>

              {run.final_output ? (
                <section className="mt-5 rounded-xl border border-[#DCE4EE] bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#949CA4]">
                    Final output
                  </p>

                  <div className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#30343A]">
                    {run.final_output}
                  </div>
                </section>
              ) : null}

              {run.error ? (
                <section className="mt-5 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#B36A48]">
                    Error
                  </p>

                  <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-7 text-[#D95117]">
                    {run.error}
                  </p>
                </section>
              ) : null}

              <section className="mt-7">
                <div>
                  <h3 className="text-[17px] font-semibold text-[#30343A]">
                    Agent Steps
                  </h3>

                  <p className="mt-1 text-[13px] text-[#8A9299]">
                    Inspect the output produced by every agent in this
                    execution.
                  </p>
                </div>

                {run.agents.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-4 py-10 text-center">
                    <p className="text-[13px] text-[#8A9299]">
                      No agent steps were saved for this execution.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {run.agents.map(
                      (step) => (
                        <details
                          key={step.id}
                          className="group overflow-hidden rounded-xl border border-[#DCE4EE] bg-white"
                        >
                          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[12px] font-bold text-[#3569B8]">
                              {step.order}
                            </span>

                            <StatusIcon
                              status={step.status}
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold text-[#30343A]">
                                {step.name}
                              </p>

                              <p className="mt-0.5 text-[10px] capitalize text-[#8A9299]">
                                {step.status}
                              </p>
                            </div>

                            <ChevronDown
                              className="size-4 shrink-0 text-[#8A9299] transition group-open:rotate-180"
                              aria-hidden
                            />
                          </summary>

                          <div className="border-t border-[#E4E8EC] bg-[#FAFBFC] px-4 py-4">
                            {step.role ? (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#949CA4]">
                                  Role
                                </p>

                                <p className="mt-1.5 text-[13px] leading-6 text-[#59636C]">
                                  {step.role}
                                </p>
                              </div>
                            ) : null}

                            {step.description ? (
                              <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#949CA4]">
                                  Description
                                </p>

                                <p className="mt-1.5 text-[13px] leading-6 text-[#73757A]">
                                  {step.description}
                                </p>
                              </div>
                            ) : null}

                            {step.output ? (
                              <div className="mt-4">
                                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#949CA4]">
                                  Output
                                </p>

                                <div className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[#E1E6EB] bg-white px-4 py-3 text-[13px] leading-6 text-[#30343A]">
                                  {step.output}
                                </div>
                              </div>
                            ) : null}

                            {step.error ? (
                              <div className="mt-4 rounded-lg border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#B36A48]">
                                  Error
                                </p>

                                <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#D95117]">
                                  {step.error}
                                </p>
                              </div>
                            ) : null}

                            {!step.output &&
                            !step.error ? (
                              <div className="mt-4 rounded-lg border border-dashed border-[#D1D9E1] bg-white px-4 py-6 text-center">
                                <p className="text-[12px] text-[#8A9299]">
                                  No output was saved for this agent.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ),
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-[#E3E8ED] bg-[#FAFBFC] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#3569B8] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#2F5FA8]"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}