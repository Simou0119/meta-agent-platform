"use client";

import {
  Bot,
  ChevronDown,
} from "lucide-react";

export type WorkflowAgent = {
  id: number;
  name: string;
  system_prompt: string;
  role: string;
  description: string;
  order: number;
  created_at: string;
};

type RunGraphPanelProps = {
  agents: WorkflowAgent[];
};

export function RunGraphPanel({
  agents,
}: RunGraphPanelProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
        <div>
          <h2 className="text-[21px] font-semibold text-[#202126]">
            Run Graph
          </h2>

          <p className="mt-1 text-[14px] leading-6 text-[#73757A]">
            Agents execute automatically from left to right. Each
            agent receives the output of the previous agent.
          </p>
        </div>

        {agents.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#C8D3DE] bg-[#FAFBFC] px-6 py-10 text-center">
            <Bot
              className="mx-auto size-7 text-[#A0A8AF]"
              aria-hidden
            />

            <p className="mt-3 text-[14px] text-[#73757A]">
              This workflow does not contain any agents.
            </p>
          </div>
        ) : (
          <div className="mt-7 overflow-x-auto pb-3 pt-2">
            <div className="flex min-w-max items-start px-2">
              {agents.map(
                (agent, index) => (
                  <div
                    key={agent.id}
                    className="flex items-start"
                  >
                    <div className="flex w-[160px] flex-col items-center px-2">
                      <span className="flex size-11 items-center justify-center rounded-full border-2 border-[#9BB9DE] bg-[#EDF4FC] text-[14px] font-bold text-[#3569B8]">
                        {index + 1}
                      </span>

                      <span className="mt-2 w-full truncate text-center text-[13px] font-semibold text-[#30343A]">
                        {agent.name}
                      </span>

                      <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#8A9299]">
                        Order {agent.order}
                      </span>
                    </div>

                    {index < agents.length - 1 ? (
                      <div className="mt-[21px] flex w-16 items-center">
                        <div className="h-[2px] flex-1 bg-[#B9CBE0]" />

                        <div className="-ml-1 size-2 rotate-45 border-r-2 border-t-2 border-[#B9CBE0]" />
                      </div>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </section>

      <section>
        <div>
          <h2 className="text-[21px] font-semibold text-[#202126]">
            Agents
          </h2>

          <p className="mt-1 text-[14px] text-[#73757A]">
            Review the role, responsibility, and system prompt of
            every workflow agent.
          </p>
        </div>

        {agents.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-[#C8D3DE] bg-white px-6 py-10 text-center">
            <Bot
              className="mx-auto size-7 text-[#A0A8AF]"
              aria-hidden
            />

            <p className="mt-3 text-[14px] text-[#73757A]">
              This workflow does not contain any agents.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {agents.map(
              (agent, index) => (
                <article
                  key={agent.id}
                  className="rounded-xl border border-[#DCE4EE] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(25,50,76,0.05)]"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FB] text-[14px] font-bold text-[#3569B8]">
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-[18px] font-semibold text-[#202126]">
                          {agent.name}
                        </h3>

                        <span className="rounded-full bg-[#F1F4F7] px-2.5 py-1 text-[10px] font-semibold text-[#68727B]">
                          Order {agent.order}
                        </span>
                      </div>

                      {agent.role ? (
                        <div className="mt-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#949CA4]">
                            Role
                          </p>

                          <p className="mt-1.5 text-[14px] font-medium leading-6 text-[#4E5963]">
                            {agent.role}
                          </p>
                        </div>
                      ) : null}

                      {agent.description ? (
                        <div className="mt-4">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#949CA4]">
                            Description
                          </p>

                          <p className="mt-1.5 text-[14px] leading-6 text-[#73757A]">
                            {agent.description}
                          </p>
                        </div>
                      ) : null}

                      <details className="group mt-5 rounded-lg border border-[#E1E7ED] bg-[#F8FAFC]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-[13px] font-semibold text-[#4E5963]">
                          View system prompt

                          <ChevronDown
                            className="size-4 transition group-open:rotate-180"
                            aria-hidden
                          />
                        </summary>

                        <div className="border-t border-[#E1E7ED] px-4 py-4">
                          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-[#4E5963]">
                            {agent.system_prompt}
                          </pre>
                        </div>
                      </details>
                    </div>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  );
}