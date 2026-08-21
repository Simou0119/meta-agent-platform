"use client";

export type WorkflowGraphAgent = {
  id: number | string;
  name: string;
  role?: string;
  description?: string;
};

export type WorkflowGraph = {
  workflowName: string;
  agents: WorkflowGraphAgent[];
};

type WorkflowGraphPanelProps = {
  workflow: WorkflowGraph;
};

function GraphArrow() {
  return (
    <div className="flex h-12 flex-col items-center">
      <div className="h-8 w-px bg-[#AFC1D3]" />
      <div className="-mt-1 text-[13px] text-[#7D9AB7]">
        ▼
      </div>
    </div>
  );
}

export function WorkflowGraphPanel({
  workflow,
}: WorkflowGraphPanelProps) {
  const hasAgents = workflow.agents.length > 0;

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <header className="shrink-0 border-b border-[#E2E7EC] px-7 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#84909A]">
          Workflow Preview
        </p>

        <h2 className="mt-1 text-[20px] font-semibold text-[#20252A]">
          {workflow.workflowName || "New Workflow"}
        </h2>

        <p className="mt-1 text-[13px] text-[#7A838B]">
          The graph updates as the workflow is refined.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-8">
        {!hasAgents ? (
          <div className="flex h-full min-h-[460px] items-center justify-center">
            <div className="max-w-[360px] rounded-2xl border border-dashed border-[#C8D3DE] bg-[#F8FAFC] px-8 py-10 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#E7EFF9] text-[22px] text-[#3569B8]">
                ◇
              </div>

              <h3 className="mt-4 text-[16px] font-semibold text-[#30363B]">
                Waiting for workflow structure
              </h3>

              <p className="mt-2 text-[13px] leading-6 text-[#75808A]">
                Proposed agents and their execution order will appear
                here after the initial analysis.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[540px] flex-col items-center pb-10">
            <div className="rounded-full border border-[#CFE0F3] bg-[#EDF4FC] px-4 py-2 text-[12px] font-semibold text-[#3569B8]">
              Workflow Input
            </div>

            <GraphArrow />

            {workflow.agents.map((agent, index) => (
              <div
                key={`${agent.id}-${index}`}
                className="flex w-full flex-col items-center"
              >
                <article className="w-full rounded-2xl border border-[#D7E1EB] bg-white px-5 py-4 shadow-[0_5px_18px_rgba(32,37,42,0.07)]">
                  <div className="flex items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E7EFF9] text-[13px] font-bold text-[#3569B8]">
                      {index + 1}
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-[#20252A]">
                        {agent.name}
                      </h3>

                      {agent.role ? (
                        <p className="mt-1 text-[13px] leading-5 text-[#53606A]">
                          {agent.role}
                        </p>
                      ) : null}

                      {agent.description &&
                      agent.description !== agent.role ? (
                        <p className="mt-2 text-[12px] leading-5 text-[#7A858E]">
                          {agent.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>

                {index < workflow.agents.length - 1 ? (
                  <GraphArrow />
                ) : null}
              </div>
            ))}

            <GraphArrow />

            <div className="rounded-full border border-[#D5E7D9] bg-[#F0F8F2] px-4 py-2 text-[12px] font-semibold text-[#438252]">
              Final Output
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}