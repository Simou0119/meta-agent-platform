"use client";

import {
  useEffect,
  useState,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  Workflow,
  X,
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

export function AgentsWorkspace() {
  const router = useRouter();

  const [workflows, setWorkflows] =
    useState<WorkflowListItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [
    workflowToDelete,
    setWorkflowToDelete,
  ] = useState<WorkflowListItem | null>(
    null,
  );

  const [deleting, setDeleting] =
    useState(false);

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

  function openWorkflow(
    workflowId: number,
  ): void {
    router.push(
      `/app/workflows/${workflowId}`,
    );
  }

  function requestDelete(
    event: MouseEvent<HTMLButtonElement>,
    workflow: WorkflowListItem,
  ): void {
    event.stopPropagation();

    setWorkflowToDelete(workflow);
  }

  async function confirmDelete(): Promise<void> {
    if (
      !workflowToDelete ||
      deleting
    ) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);

      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowToDelete.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => null)) as
          | ErrorResponse
          | null;

        throw new Error(
          data?.detail ??
            data?.message ??
            "Unable to delete agent team.",
        );
      }

      setWorkflows(
        (previousWorkflows) =>
          previousWorkflows.filter(
            (workflow) =>
              workflow.id !==
              workflowToDelete.id,
          ),
      );

      setWorkflowToDelete(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete agent team.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <section>
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#202126]">
              My Agent Teams
            </h1>

            <p className="mt-3 max-w-[760px] text-[17px] leading-6 text-[#73757A]">
              View, manage, and inspect the agent teams you have
              created.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              router.push("/app/builder");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[#3569B8] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#2F5FA8]"
          >
            <Plus
              className="size-4"
              aria-hidden
            />

            Create Agent Team
          </button>
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
            <Workflow
              className="mx-auto size-9 text-[#3569B8]"
              aria-hidden
            />

            <h2 className="mt-4 text-[18px] font-semibold text-[#202126]">
              No agent teams yet
            </h2>

            <p className="mt-2 text-[15px] text-[#73757A]">
              Create your first agent team to start combining specialized agents.
            </p>

            <button
              type="button"
              onClick={() => {
                router.push("/app/builder");
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#3569B8] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#2F5FA8]"
            >
              <Plus
                className="size-4"
                aria-hidden
              />

              Create Agent Team
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            {workflows.map((workflow) => (
              <article
                key={workflow.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  openWorkflow(workflow.id);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    openWorkflow(workflow.id);
                  }
                }}
                className="group flex w-full cursor-pointer items-center gap-5 rounded-xl border border-[#DCE4EE] bg-white px-5 py-5 text-left shadow-[0_1px_2px_rgba(25,50,76,0.05)] transition hover:-translate-y-0.5 hover:border-[#B9CBE0] hover:shadow-[0_7px_20px_rgba(25,50,76,0.08)]"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
                  <Workflow
                    className="size-6"
                    aria-hidden
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="truncate text-[18px] font-semibold text-[#202126]">
                      {workflow.name}
                    </h2>

                    <span className="rounded-full bg-[#EEF6F0] px-2.5 py-1 text-[11px] font-semibold capitalize text-[#438252]">
                      {workflow.status}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#73757A]">
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

                      Published{" "}
                      {formatDate(
                        workflow.created_at,
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      requestDelete(
                        event,
                        workflow,
                      );
                    }}
                    className="flex size-9 items-center justify-center rounded-lg text-[#8A9299] transition hover:bg-[#FFF0E8] hover:text-[#D95117]"
                    aria-label={`Delete agent team ${workflow.name}`}
                  >
                    <Trash2
                      className="size-4"
                      aria-hidden
                    />
                  </button>

                  <ChevronRight
                    className="size-5 text-[#A8AFB6] transition group-hover:translate-x-1 group-hover:text-[#3569B8]"
                    aria-hidden
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {workflowToDelete ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-[#18202A]/40 px-5 py-8 backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setWorkflowToDelete(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-workflow-title"
            className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_24px_70px_rgba(18,28,38,0.28)]"
          >
            <header className="flex items-start justify-between gap-5 border-b border-[#E3E8ED] px-6 py-5">
              <div>
                <h2
                  id="delete-workflow-title"
                  className="text-[19px] font-semibold text-[#202126]"
                >
                  Delete agent team?
                </h2>

                <p className="mt-2 text-[14px] leading-6 text-[#73757A]">
                  This action cannot be undone.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setWorkflowToDelete(null);
                }}
                disabled={deleting}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#737B83] transition hover:bg-[#F1F3F5] hover:text-[#202126]"
                aria-label="Close delete dialog"
              >
                <X
                  className="size-5"
                  aria-hidden
                />
              </button>
            </header>

            <div className="px-6 py-5">
              <div className="rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-4">
                <p className="text-[14px] leading-6 text-[#753A22]">
                  You are about to delete{" "}
                  <span className="font-semibold">
                    {workflowToDelete.name}
                  </span>
                  .
                </p>

                <p className="mt-2 text-[13px] leading-6 text-[#9A5A3C]">
                  Its agents and execution history will also be
                  deleted.
                </p>
              </div>
            </div>

            <footer className="flex justify-end gap-3 border-t border-[#E3E8ED] bg-[#FAFBFC] px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  setWorkflowToDelete(null);
                }}
                disabled={deleting}
                className="rounded-lg border border-[#D8DEE5] bg-white px-4 py-2 text-[13px] font-semibold text-[#4E5963] transition hover:bg-[#F6F8FA] disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  void confirmDelete();
                }}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-[#D95117] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#C24712] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <Trash2
                    className="size-4"
                    aria-hidden
                  />
                )}

                {deleting
                  ? "Deleting..."
                  : "Delete Agent Team"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}