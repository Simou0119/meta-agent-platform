"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  Clock,
  MessageSquare,
  Play,
} from "lucide-react";

import { getApiBaseUrl } from "../../lib/api";

type WorkflowListItem = {
  id: number;
  name: string;
  status: string;
  agent_count: number;
  created_at: string;
};

type WorkflowListResponse = {
  workflows?: WorkflowListItem[];
};

type ErrorResponse = {
  detail?: string;
  message?: string;
};

function formatDate(value: string): string {
  if (!value) {
    return "Unknown date";
  }

  const normalizedValue = value.includes("T")
    ? value
    : value.replace(" ", "T");

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function WorkflowChatListPage() {
  const router = useRouter();

  const [workflows, setWorkflows] =
    useState<WorkflowListItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkflows(): Promise<void> {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowListResponse
          | ErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load agent teams.",
          );
        }

        if (!active) {
          return;
        }

        const workflowData =
          data as WorkflowListResponse;

        setWorkflows(
          workflowData.workflows ?? [],
        );
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load agent teams.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadWorkflows();

    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <header>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
            <MessageSquare
              className="size-5"
              aria-hidden
            />
          </span>

          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#202126]">
              Run Agent Teams
            </h1>

            <p className="mt-1 text-[16px] leading-6 text-[#73757A]">
              Choose an agent team and run all of its agents in sequence.
            </p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mt-6 rounded-lg border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-3 text-[14px] font-medium text-[#D95117]">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-16 flex justify-center">
          <div className="text-center">
            <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

            <p className="mt-4 text-[15px] text-[#73757A]">
              Loading agent teams...
            </p>
          </div>
        </div>
      ) : workflows.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-dashed border-[#C8D3DE] bg-white px-8 py-12 text-center">
          <MessageSquare
            className="mx-auto size-8 text-[#3569B8]"
            aria-hidden
          />

          <h2 className="mt-4 text-[18px] font-semibold text-[#202126]">
            No agent teams available
          </h2>

          <p className="mt-2 text-[15px] text-[#73757A]">
            Create and publish an agent team before running it.
          </p>

          <button
            type="button"
            onClick={() => {
              router.push("/app/builder");
            }}
            className="mt-6 rounded-lg bg-[#3569B8] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#2F5FA8]"
          >
            Create Agent Team
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {workflows.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              onClick={() => {
                router.push(
                  `/app/chat/${workflow.id}`,
                );
              }}
              className="group flex min-h-[170px] flex-col rounded-2xl border border-[#DCE4EE] bg-white p-5 text-left shadow-[0_1px_3px_rgba(25,50,76,0.05)] transition hover:-translate-y-0.5 hover:border-[#AFC4DD] hover:shadow-[0_10px_24px_rgba(25,50,76,0.09)]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
                  <Bot
                    className="size-5"
                    aria-hidden
                  />
                </span>

                <span className="rounded-full bg-[#EEF6F0] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#438252]">
                  {workflow.status}
                </span>
              </div>

              <h2 className="mt-4 text-[18px] font-semibold text-[#202126]">
                {workflow.name}
              </h2>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#73757A]">
                <span className="flex items-center gap-1.5">
                  <Bot
                    className="size-3.5"
                    aria-hidden
                  />

                  {workflow.agent_count}{" "}
                  {workflow.agent_count === 1
                    ? "agent"
                    : "agents"}
                </span>

                <span className="flex items-center gap-1.5">
                  <Clock
                    className="size-3.5"
                    aria-hidden
                  />

                  {formatDate(
                    workflow.created_at,
                  )}
                </span>
              </div>

              <div className="mt-auto flex items-center justify-between pt-5">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-[#3569B8]">
                  <Play
                    className="size-4"
                    aria-hidden
                  />

                  Run Agent Team
                </span>

                <ChevronRight
                  className="size-5 text-[#A8AFB6] transition group-hover:translate-x-1 group-hover:text-[#3569B8]"
                  aria-hidden
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}