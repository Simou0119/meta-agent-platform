"use client";

type QuickReplyCardProps = {
  onContinue: () => void;
  onCreate: () => void;
  disabled?: boolean;
};

export function QuickReplyCard({
  onContinue,
  onCreate,
  disabled = false,
}: QuickReplyCardProps) {
  return (
    <div className="mt-5 rounded-2xl border border-[#D7E2EF] bg-white px-5 py-5 shadow-[0_4px_14px_rgba(32,37,42,0.06)]">
      <p className="text-[15px] font-semibold text-[#20252A]">
        What would you like to do next?
      </p>

      <p className="mt-1 text-[13px] leading-5 text-[#6A757E]">
        Accept the proposed plan, create the agent team now, or continue
        chatting to request changes.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={disabled}
          className="rounded-lg border border-[#C7D5E5] bg-white px-5 py-2.5 text-[14px] font-semibold text-[#3569B8] transition hover:bg-[#F1F6FC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Continue with Default Plan
        </button>

        <button
          type="button"
          onClick={onCreate}
          disabled={disabled}
          className="rounded-lg bg-[#3569B8] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:bg-[#AEBED3]"
        >
          Create Agent Team
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-5 text-[#7A838B]">
        You can also type below to change agents, tools, permissions,
        execution order, or output requirements.
      </p>
    </div>
  );
}