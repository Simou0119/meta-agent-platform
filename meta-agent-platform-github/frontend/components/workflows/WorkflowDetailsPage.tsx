"use client";

import {
  useEffect,
  useState,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import { getApiBaseUrl } from "../../lib/api";

import {
  WorkflowDetailsSidebar,
  type WorkflowDetailTab,
} from "./WorkflowDetailsSidebar";

import {
  RunGraphPanel,
  type WorkflowAgent,
} from "./RunGraphPanel";

import {
  ExecutionPanel,
} from "./ExecutionPanel";

import {
  MetricsPanel,
} from "./MetricsPanel";

import {
  ProcessMiningPanel,
} from "./ProcessMiningPanel";

import {
  WorkflowOverviewHeader,
} from "./WorkflowOverviewHeader";

type WorkflowDetails = {
  id: number;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  agents: WorkflowAgent[];
};

type ErrorResponse = {
  detail?: string;
  message?: string;
};

export function WorkflowDetailsPage() {
  const router = useRouter();

  const params = useParams<{
    workflowId: string;
  }>();

  const workflowId = Number(
    params.workflowId,
  );

  const [workflow, setWorkflow] =
    useState<WorkflowDetails | null>(null);

  const [activeTab, setActiveTab] =
    useState<WorkflowDetailTab>("graph");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadWorkflow(): Promise<void> {
      if (
        !Number.isInteger(workflowId) ||
        workflowId <= 0
      ) {
        setError("Invalid agent team ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowDetails
          | ErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load agent team.",
          );
        }

        if (!active) {
          return;
        }

        const workflowData =
          data as WorkflowDetails;

        setWorkflow({
          ...workflowData,

          agents: workflowData.agents
            .slice()
            .sort(
              (
                firstAgent,
                secondAgent,
              ) =>
                firstAgent.order -
                secondAgent.order,
            ),
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load agent team.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      active = false;
    };
  }, [workflowId]);

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

          <p className="mt-4 text-[15px] text-[#73757A]">
            Loading agent team...
          </p>
        </div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="mx-auto max-w-[760px]">
        <button
          type="button"
          onClick={() => {
            router.push("/app");
          }}
          className="text-[14px] font-semibold text-[#3569B8]"
        >
          Back to My Agent Teams
        </button>

        <div className="mt-8 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-5 py-4 text-[14px] font-medium text-[#D95117]">
          {error ??
            "Agent team not found."}
        </div>
      </div>
    );
  }
  
  const currentWorkflow = workflow;

  function runWorkflow(): void {
    router.push(
      `/app/chat/${currentWorkflow.id}`,
    );
  }

  return (
    <section>
      <WorkflowOverviewHeader
        workflow={currentWorkflow}
        onBack={() => {
          router.push("/app");
        }}
        onRun={runWorkflow}
      />

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <WorkflowDetailsSidebar
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <div className="min-w-0">
          {activeTab === "graph" ? (
            <RunGraphPanel
              agents={currentWorkflow.agents}
            />
          ) : null}

          {activeTab === "execution" ? (
            <ExecutionPanel
              workflowId={currentWorkflow.id}
              onRunWorkflow={runWorkflow}
            />
          ) : null}

          {activeTab === "metrics" ? (
            <MetricsPanel
              workflowId={currentWorkflow.id}
              onViewExecution={() => {
                setActiveTab("execution");
              }}
            />
          ) : null}

          {activeTab === "process-mining" ? (
            <ProcessMiningPanel
              workflowId={currentWorkflow.id}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}