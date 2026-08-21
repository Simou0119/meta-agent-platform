"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { WorkflowChatPanel } from "./WorkflowChatPanel";
import {
  WorkflowGraphPanel,
  type WorkflowGraph,
} from "./WorkflowGraphPanel";
import {
  clearBuilderInitialMessage,
  getBuilderInitialMessage,
} from "../../lib/builder-session";

const EMPTY_WORKFLOW: WorkflowGraph = {
  workflowName: "New Workflow",
  agents: [],
};

export function BuilderWorkspace() {
  const router = useRouter();

  const [initialMessage, setInitialMessage] =
    useState<string | null>(null);

  const [workflowGraph, setWorkflowGraph] =
    useState<WorkflowGraph>(
      EMPTY_WORKFLOW,
    );

  const [isPreparing, setIsPreparing] =
    useState(true);

  const [publishedNotice, setPublishedNotice] =
    useState(false);

  useEffect(() => {
    const savedMessage =
      getBuilderInitialMessage();

    if (!savedMessage) {
      router.replace("/app/builder");
      return;
    }

    setInitialMessage(savedMessage);
    setIsPreparing(false);
  }, [router]);

  const handleWorkflowChange =
    useCallback(
      (workflow: WorkflowGraph) => {
        setWorkflowGraph(workflow);
      },
      [],
    );

  function returnToBuilder(): void {
    clearBuilderInitialMessage();
    router.push("/app/builder");
  }

  function handlePublished(): void {
    clearBuilderInitialMessage();
    setPublishedNotice(true);
  }

  if (
    isPreparing ||
    !initialMessage
  ) {
    return (
      <div className="flex min-h-[calc(100vh-124px)] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

          <p className="mt-4 text-[15px] font-medium text-[#6A757E]">
            Preparing your workflow workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="relative h-[calc(100vh-100px)] min-h-[680px] overflow-hidden rounded-2xl border border-[#DDE4EB] bg-white shadow-[0_8px_24px_rgba(32,37,42,0.06)]">
      {publishedNotice ? (
        <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-[#BBD7C2] bg-[#F0F8F2] px-5 py-2 text-[13px] font-semibold text-[#438252] shadow-[0_4px_14px_rgba(32,37,42,0.10)]">
          Workflow published successfully
        </div>
      ) : null}

      <div className="grid h-full min-h-0 grid-cols-[minmax(420px,0.9fr)_minmax(480px,1.1fr)]">
        <div className="min-h-0 min-w-0 border-r border-[#DCE3EA] bg-[#F4F7FA]">
          <WorkflowChatPanel
            initialMessage={
              initialMessage
            }
            onWorkflowChange={
              handleWorkflowChange
            }
            onBack={
              returnToBuilder
            }
            onPublished={
              handlePublished
            }
          />
        </div>

        <div className="min-h-0 min-w-0 bg-white">
          <WorkflowGraphPanel
            workflow={
              workflowGraph
            }
          />
        </div>
      </div>
    </section>
  );
}