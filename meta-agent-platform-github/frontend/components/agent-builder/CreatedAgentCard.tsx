"use client";

export type CreatedAgent = {
  id: number | string;
  name: string;
  systemPrompt?: string;
  role?: string;
  description?: string;
};

type CreatedAgentCardProps = {
  workflowName: string;
  agents: CreatedAgent[];
  onConfigure: () => void;
  isPublishing?: boolean;
  isPublished?: boolean;
  publishError?: string | null;
};

export function CreatedAgentCard({
  workflowName,
  agents,
  onConfigure,
  isPublishing = false,
  isPublished = false,
  publishError = null,
}: CreatedAgentCardProps) {
  const agentsWithoutPrompt = agents.filter(
    (agent) => !agent.systemPrompt?.trim(),
  );

  const canPublish =
    agents.length > 0 &&
    agentsWithoutPrompt.length === 0 &&
    !isPublishing &&
    !isPublished;

  return (
    <div
      className="mt-6 rounded-2xl px-6 py-6"
      style={{
        background:
          "linear-gradient(135deg, #072140 0%, #0E396E 100%)",
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-[#9ABCE4]">
        Workflow Ready
      </p>

      <h2 className="mt-2 text-[21px] font-semibold text-white">
        {workflowName}
      </h2>

      <p className="mt-1 text-[13px] leading-6 text-[#C2D7EF]">
        Review the generated workflow before publishing it.
      </p>

      {agents.length > 0 ? (
        <div className="mt-5 space-y-3">
          {agents.map((agent, index) => (
            <article
              key={`${agent.id}-${index}`}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[12px] font-semibold text-white">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-white">
                    {agent.name}
                  </p>

                  {agent.role ? (
                    <p className="mt-1 text-[12px] leading-5 text-[#D8E6F7]">
                      {agent.role}
                    </p>
                  ) : null}

                  {agent.description &&
                  agent.description !== agent.role ? (
                    <p className="mt-1 text-[12px] leading-5 text-[#C2D7EF]">
                      {agent.description}
                    </p>
                  ) : null}

                  {!agent.systemPrompt?.trim() ? (
                    <p className="mt-2 text-[12px] font-medium text-[#F6CFA8]">
                      System prompt is missing.
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[13px] text-[#C2D7EF]">
          No subagents were returned by the backend.
        </p>
      )}

      {agentsWithoutPrompt.length > 0 ? (
        <p className="mt-4 rounded-lg border border-[#E7BA87]/30 bg-[#E7BA87]/10 px-4 py-3 text-[12px] leading-5 text-[#F6CFA8]">
          The workflow cannot be published because one or more agents
          do not contain a system prompt.
        </p>
      ) : null}

      {publishError ? (
        <p className="mt-4 rounded-lg bg-[#FBEADA] px-4 py-3 text-[13px] font-medium text-[#D95117]">
          {publishError}
        </p>
      ) : null}

      {isPublished ? (
        <div className="mt-5 rounded-lg border border-[#73A780]/30 bg-[#73A780]/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-[#C6E8CE]">
            Workflow published and saved successfully.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex items-center justify-between gap-5">
          <p className="max-w-[300px] text-[12px] leading-5 text-[#AFC8E5]">
            This workflow is only a draft. It will not be saved until
            you configure integrations and publish it.
          </p>

          <button
            type="button"
            onClick={onConfigure}
            disabled={!canPublish}
            className="flex min-w-[168px] shrink-0 items-center justify-center rounded-lg bg-white px-6 py-2.5 text-[14px] font-semibold text-[#0E396E] transition hover:bg-[#E7EFF9] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPublishing ? (
              <>
                <span className="mr-2 size-4 animate-spin rounded-full border-2 border-[#9CB3CE] border-t-[#0E396E]" />
                Publishing
              </>
            ) : (
              "Configure & Publish"
            )}
          </button>
        </div>
      )}
    </div>
  );
}