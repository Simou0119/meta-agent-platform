"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { Icon } from "../ui/Icon";
import { saveBuilderInitialMessage } from "../../lib/builder-session";

const suggestedRequirements = [
  "Create a Smart Reading Assistant agent team with a Document Reader, Summarizer, Key Point Extractor, and Final Reviewer.",
  "Create a research agent team that collects sources, analyzes information, summarizes findings, and reviews the final result.",
  "Create a document processing agent team that reads files, extracts structured information, and generates a final report.",
];

export function BuilderStartPage() {
  const router = useRouter();

  const [message, setMessage] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resizeTextarea(
    textarea: HTMLTextAreaElement | null,
  ): void {
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(
      textarea.scrollHeight,
      260,
    )}px`;
  }

  function handleMessageChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    setMessage(event.target.value);
    resizeTextarea(event.target);
  }

  function selectRequirement(requirement: string): void {
    setMessage(requirement);

    window.requestAnimationFrame(() => {
      resizeTextarea(textareaRef.current);
      textareaRef.current?.focus();
    });
  }

  function startWorkflow(): void {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isNavigating) {
      textareaRef.current?.focus();
      return;
    }

    setIsNavigating(true);
    saveBuilderInitialMessage(trimmedMessage);

    router.push("/app/builder/workspace");
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();
    startWorkflow();
  }

  function handleTextareaKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      startWorkflow();
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-124px)] w-full max-w-[976px] flex-col">
      <div className="pt-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-[#2C3036]">
          Agent Team Builder
        </h1>

        <p className="mt-7 max-w-[760px] text-[18px] leading-8 text-[#5C6068]">
          Describe the goal you want your agent team to achieve. The system will
          analyze your request, propose an agent team structure, and
          generate the required agents.
        </p>

        <div className="mt-9 max-w-[850px]">
          {suggestedRequirements.map((requirement) => (
            <button
              key={requirement}
              type="button"
              disabled={isNavigating}
              onClick={() => selectRequirement(requirement)}
              className="flex min-h-[58px] w-full items-center justify-between gap-6 border-b border-[#D9D7D4] px-2 py-3 text-left text-[16px] font-semibold leading-6 text-[#343841] transition hover:bg-white/45 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{requirement}</span>

              <Icon
                name="external"
                className="size-5 shrink-0 text-[#B5B4B2]"
              />
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-auto pb-5 pt-16"
      >
        <div className="min-h-[155px] rounded-[20px] border border-[#D9D7D4] bg-white shadow-[0_8px_24px_rgba(32,37,42,0.08)]">
          <label className="block px-6 pt-7">
            <span className="sr-only">
              Describe the agent team you want to create
            </span>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleMessageChange}
              onKeyDown={handleTextareaKeyDown}
              disabled={isNavigating}
              className="min-h-[68px] max-h-[260px] w-full resize-none overflow-y-auto bg-transparent text-[19px] font-semibold leading-8 text-[#30343A] outline-none placeholder:text-[#A7A9AD] disabled:cursor-wait"
              placeholder="Describe the agent team you want to create..."
            />
          </label>

          <div className="flex items-center justify-between gap-4 px-4 pb-4">
            <p className="px-2 text-[12px] leading-5 text-[#8A9299]">
              Press Enter to open the workspace. Use Shift + Enter for
              a new line.
            </p>

            <button
              type="submit"
              disabled={isNavigating || !message.trim()}
              className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[#3569B8] text-white transition hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:bg-[#D5D6D8]"
              aria-label="Open agent team workspace"
            >
              {isNavigating ? (
                <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <Icon name="arrowUp" className="size-6" />
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}