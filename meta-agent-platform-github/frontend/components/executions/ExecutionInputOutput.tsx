"use client";

import {
  ChevronDown,
  Clipboard,
  FileInput,
  FileOutput,
} from "lucide-react";

import type {
  ExecutionDetails,
  ExecutionStep,
} from "./executionTypes";

type ExecutionInputOutputProps = {
  execution: ExecutionDetails;
};

async function copyText(
  value: string,
): Promise<void> {
  if (!value) {
    return;
  }

  await navigator.clipboard.writeText(
    value,
  );
}

function ContentBlock({
  title,
  value,
  emptyText,
}: {
  title: string;
  value: string;
  emptyText: string;
}) {
  return (
    <section className="rounded-xl border border-[#DCE4EE] bg-white">
      <header className="flex items-center justify-between gap-4 border-b border-[#E3E8ED] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
          {title}
        </p>

        {value ? (
          <button
            type="button"
            onClick={() => {
              void copyText(value);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DEE5] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#59636C] transition hover:border-[#B9CBE0] hover:bg-[#F6F8FA] hover:text-[#3569B8]"
          >
            <Clipboard
              className="size-3.5"
              aria-hidden
            />

            Copy
          </button>
        ) : null}
      </header>

      <div className="px-4 py-4">
        {value ? (
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] leading-7 text-[#30343A]">
            {value}
          </pre>
        ) : (
          <p className="text-[13px] text-[#8A9299]">
            {emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

function AgentInputOutput({
  step,
}: {
  step: ExecutionStep;
}) {
  return (
    <details className="group overflow-hidden rounded-xl border border-[#DCE4EE] bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[12px] font-bold text-[#3569B8]">
          {step.order}
        </span>

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

      <div className="border-t border-[#E3E8ED] bg-[#FAFBFC] p-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <ContentBlock
            title="Agent Input"
            value={step.input}
            emptyText="No input was saved for this subagent."
          />

          <ContentBlock
            title="Agent Output"
            value={step.output}
            emptyText="No output was saved for this subagent."
          />
        </div>

        {step.error ? (
          <div className="mt-4 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#B36A48]">
              Error
            </p>

            <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#D95117]">
              {step.error}
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function ExecutionInputOutput({
  execution,
}: ExecutionInputOutputProps) {
  return (
    <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <div>
        <h2 className="text-[19px] font-semibold text-[#202126]">
          Input & Output
        </h2>

        <p className="mt-1 text-[13px] text-[#8A9299]">
          Inspect the original workflow input, final result, and every subagent handoff.
        </p>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-[#DCE4EE] bg-[#FAFBFC] p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#E8F0FB] text-[#3569B8]">
              <FileInput
                className="size-4"
                aria-hidden
              />
            </span>

            <div>
              <h3 className="text-[15px] font-semibold text-[#30343A]">
                Original Input
              </h3>

              <p className="mt-0.5 text-[11px] text-[#8A9299]">
                Request that started this workflow run.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <ContentBlock
              title="Workflow Input"
              value={execution.input}
              emptyText="No workflow input was saved."
            />
          </div>
        </section>

        <section className="rounded-xl border border-[#DCE4EE] bg-[#FAFBFC] p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-[#EEF6F0] text-[#438252]">
              <FileOutput
                className="size-4"
                aria-hidden
              />
            </span>

            <div>
              <h3 className="text-[15px] font-semibold text-[#30343A]">
                Final Output
              </h3>

              <p className="mt-0.5 text-[11px] text-[#8A9299]">
                Final result returned by the last subagent.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <ContentBlock
              title="Workflow Output"
              value={execution.final_output}
              emptyText="No final output was saved."
            />
          </div>
        </section>
      </div>

      {execution.error ? (
        <div className="mt-5 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#B36A48]">
            Workflow Error
          </p>

          <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#D95117]">
            {execution.error}
          </p>
        </div>
      ) : null}

      <div className="mt-7">
        <h3 className="text-[16px] font-semibold text-[#30343A]">
          Subagent Handoffs
        </h3>

        <p className="mt-1 text-[12px] text-[#8A9299]">
          Expand a subagent to inspect the exact input it received and the output it produced.
        </p>

        {execution.agents.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[#D1D9E1] bg-[#FAFBFC] px-5 py-10 text-center">
            <p className="text-[13px] text-[#8A9299]">
              No subagent input or output data is available.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {execution.agents.map(
              (step) => (
                <AgentInputOutput
                  key={step.id}
                  step={step}
                />
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
