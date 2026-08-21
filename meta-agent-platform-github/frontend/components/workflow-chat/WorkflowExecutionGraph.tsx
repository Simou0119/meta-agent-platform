"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  X,
} from "lucide-react";

export type RuntimeAgentStatus =
  | "waiting"
  | "running"
  | "completed"
  | "failed";

export type RuntimeAgent = {
  id: number;
  name: string;
  role: string;
  description: string;
  order: number;
  status: RuntimeAgentStatus;
  output?: string;
  error?: string;
};

type WorkflowExecutionGraphProps = {
  agents: RuntimeAgent[];
};

function getStatusLabel(
  status: RuntimeAgentStatus,
): string {
  switch (status) {
    case "running":
      return "Running";

    case "completed":
      return "Completed";

    case "failed":
      return "Failed";

    default:
      return "Waiting";
  }
}

function getNodeClasses(
  status: RuntimeAgentStatus,
): string {
  switch (status) {
    case "running":
      return [
        "border-[#3569B8]",
        "bg-[#EDF4FC]",
        "text-[#3569B8]",
        "shadow-[0_0_0_4px_rgba(53,105,184,0.10)]",
      ].join(" ");

    case "completed":
      return [
        "border-[#7DB58B]",
        "bg-[#EFF8F1]",
        "text-[#438252]",
      ].join(" ");

    case "failed":
      return [
        "border-[#E29A77]",
        "bg-[#FFF3EC]",
        "text-[#D95117]",
      ].join(" ");

    default:
      return [
        "border-[#D7DEE5]",
        "bg-white",
        "text-[#8A9299]",
      ].join(" ");
  }
}

function getStatusTextClasses(
  status: RuntimeAgentStatus,
): string {
  switch (status) {
    case "running":
      return "text-[#3569B8]";

    case "completed":
      return "text-[#438252]";

    case "failed":
      return "text-[#D95117]";

    default:
      return "text-[#A0A6AC]";
  }
}

function getStatusBadgeClasses(
  status: RuntimeAgentStatus,
): string {
  switch (status) {
    case "running":
      return "bg-[#EDF4FC] text-[#3569B8]";

    case "completed":
      return "bg-[#EFF8F1] text-[#438252]";

    case "failed":
      return "bg-[#FFF0E8] text-[#D95117]";

    default:
      return "bg-[#F1F4F7] text-[#68727B]";
  }
}

function getConnectorClasses(
  status: RuntimeAgentStatus,
): string {
  switch (status) {
    case "completed":
      return "bg-[#7DB58B]";

    case "failed":
      return "bg-[#E29A77]";

    default:
      return "bg-[#D7DEE5]";
  }
}

function getArrowClasses(
  status: RuntimeAgentStatus,
): string {
  switch (status) {
    case "completed":
      return "border-[#7DB58B]";

    case "failed":
      return "border-[#E29A77]";

    default:
      return "border-[#D7DEE5]";
  }
}

function NodeIcon({
  status,
  index,
}: {
  status: RuntimeAgentStatus;
  index: number;
}) {
  if (status === "running") {
    return (
      <LoaderCircle
        className="size-4 animate-spin"
        aria-hidden
      />
    );
  }

  if (status === "completed") {
    return (
      <Check
        className="size-4"
        aria-hidden
      />
    );
  }

  if (status === "failed") {
    return (
      <AlertCircle
        className="size-4"
        aria-hidden
      />
    );
  }

  return (
    <span className="text-[12px] font-bold">
      {index + 1}
    </span>
  );
}

function AgentOutputDialog({
  agent,
  onClose,
}: {
  agent: RuntimeAgent;
  onClose: () => void;
}) {
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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#18202A]/40 px-5 py-8 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-output-title"
        className="flex max-h-[82vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_24px_70px_rgba(18,28,38,0.28)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-5 border-b border-[#E3E8ED] px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2
                id="agent-output-title"
                className="text-[19px] font-semibold text-[#202126]"
              >
                {agent.name}
              </h2>

              <span
                className={[
                  "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
                  getStatusBadgeClasses(
                    agent.status,
                  ),
                ].join(" ")}
              >
                {getStatusLabel(agent.status)}
              </span>
            </div>

            {agent.role ? (
              <p className="mt-2 text-[13px] leading-6 text-[#68727B]">
                {agent.role}
              </p>
            ) : null}

            {agent.description ? (
              <p className="mt-1 text-[13px] leading-6 text-[#8A9299]">
                {agent.description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#737B83] transition hover:bg-[#F1F3F5] hover:text-[#202126]"
            aria-label="Close agent output"
          >
            <X
              className="size-5"
              aria-hidden
            />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#949CA4]">
            Agent response
          </p>

          {agent.error ? (
            <div className="rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-4">
              <p className="whitespace-pre-wrap text-[14px] leading-7 text-[#D95117]">
                {agent.error}
              </p>
            </div>
          ) : agent.output ? (
            <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-[#343A40]">
              {agent.output}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#D9E0E7] bg-[#FAFBFC] px-4 py-8 text-center">
              <p className="text-[14px] text-[#8A9299]">
                This subagent has not returned an output yet.
              </p>
            </div>
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

export function WorkflowExecutionGraph({
  agents,
}: WorkflowExecutionGraphProps) {
  const [selectedAgentId, setSelectedAgentId] =
    useState<number | null>(null);

  if (agents.length === 0) {
    return null;
  }

  const selectedAgent =
    agents.find(
      (agent) =>
        agent.id === selectedAgentId,
    ) ?? null;

  return (
    <>
      <section className="relative z-30 border-b border-[#E3E7EB] bg-white px-6 py-4">
        <div className="mx-auto max-w-[1040px]">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8A9299]">
                Workflow execution
              </p>

              <p className="mt-1 text-[12px] text-[#8A9299]">
                Each subagent receives the previous subagent&apos;s
                response.
              </p>
            </div>

            <p className="hidden text-[12px] text-[#A0A6AC] sm:block">
              Click a completed step to view its response
            </p>
          </div>

          <div className="overflow-x-auto pb-2 pt-2">
            <div className="flex min-w-max items-start px-2">
              {agents.map((agent, index) => {
                const hasOutput = Boolean(
                  agent.output ||
                    agent.error,
                );

                return (
                  <div
                    key={agent.id}
                    className="flex items-start"
                  >
                    <button
                      type="button"
                      disabled={!hasOutput}
                      onClick={() => {
                        if (hasOutput) {
                          setSelectedAgentId(
                            agent.id,
                          );
                        }
                      }}
                      className={[
                        "flex w-[150px] flex-col items-center rounded-xl px-2 py-2 transition",
                        hasOutput
                          ? "cursor-pointer hover:bg-[#F6F8FA] focus:outline-none focus:ring-2 focus:ring-[#B7CDE7]"
                          : "cursor-default",
                      ].join(" ")}
                      aria-label={
                        hasOutput
                          ? `View output from ${agent.name}`
                          : `${agent.name} has no output yet`
                      }
                    >
                      <span
                        className={[
                          "flex size-9 items-center justify-center rounded-full border-2 transition-all duration-200",
                          getNodeClasses(
                            agent.status,
                          ),
                        ].join(" ")}
                      >
                        <NodeIcon
                          status={
                            agent.status
                          }
                          index={index}
                        />
                      </span>

                      <span className="mt-2 w-full truncate text-center text-[12px] font-semibold text-[#30343A]">
                        {agent.name}
                      </span>

                      <span
                        className={[
                          "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
                          getStatusTextClasses(
                            agent.status,
                          ),
                        ].join(" ")}
                      >
                        {getStatusLabel(
                          agent.status,
                        )}
                      </span>
                    </button>

                    {index <
                    agents.length - 1 ? (
                      <div className="mt-[20px] flex w-16 items-center">
                        <div
                          className={[
                            "h-[2px] flex-1 transition-colors duration-300",
                            getConnectorClasses(
                              agent.status,
                            ),
                          ].join(" ")}
                        />

                        <div
                          className={[
                            "-ml-1 size-2 rotate-45 border-r-2 border-t-2 transition-colors duration-300",
                            getArrowClasses(
                              agent.status,
                            ),
                          ].join(" ")}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {selectedAgent ? (
        <AgentOutputDialog
          agent={selectedAgent}
          onClose={() => {
            setSelectedAgentId(null);
          }}
        />
      ) : null}
    </>
  );
}