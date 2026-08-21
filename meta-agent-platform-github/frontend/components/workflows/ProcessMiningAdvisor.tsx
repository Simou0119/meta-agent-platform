"use client";

import {
  AlertTriangle,
  Bot,
  ChevronRight,
  Lightbulb,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { PointerEvent as ReactPointerEvent, useRef, useState } from "react";

import { getApiBaseUrl } from "../../lib/api";

type AdvisorRecommendation = {
  priority: "high" | "medium" | "low";
  title: string;
  evidence: string;
  recommendation: string;
  expected_benefit: string;
  confidence: "high" | "medium" | "low";
};

type AdvisorResponse = {
  workflow_id: number;
  workflow_name: string;
  analyzed_runs: number;
  evidence_strength: "none" | "limited" | "growing" | "stronger";
  overview: string;
  recommendations: AdvisorRecommendation[];
  disclaimer: string;
};

type ApiError = {
  detail?: string;
  message?: string;
};

type Props = {
  workflowId: number;
};

type DragState = {
  pointerId: number;
  startClientY: number;
  startTop: number;
  moved: boolean;
};

const FLOATING_BUTTON_MARGIN = 76;
const DRAG_THRESHOLD = 5;

function priorityClasses(priority: AdvisorRecommendation["priority"]): string {
  if (priority === "high") return "border-[#F0C9AB] bg-[#FFF5EE] text-[#B94A16]";
  if (priority === "medium") return "border-[#E5D8A8] bg-[#FFFBEA] text-[#8A6A12]";
  return "border-[#C9D8EA] bg-[#F4F8FD] text-[#3569B8]";
}

function clampFloatingTop(top: number): number {
  if (typeof window === "undefined") return top;

  const minTop = FLOATING_BUTTON_MARGIN;
  const maxTop = Math.max(minTop, window.innerHeight - FLOATING_BUTTON_MARGIN);
  return Math.min(Math.max(top, minTop), maxTop);
}

export function ProcessMiningAdvisor({ workflowId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<AdvisorResponse | null>(null);
  const [floatingTop, setFloatingTop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const floatingButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  async function generateAdvice() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowId}/process-mining/advisor`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const data = (await response.json().catch(() => null)) as AdvisorResponse | ApiError | null;
      if (!response.ok) {
        const apiError = data as ApiError | null;
        throw new Error(apiError?.detail ?? apiError?.message ?? "Unable to generate Process Mining advice.");
      }

      setAdvice(data as AdvisorResponse);
    } catch (advisorError) {
      setError(advisorError instanceof Error ? advisorError.message : "Unable to generate Process Mining advice.");
    } finally {
      setLoading(false);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    const button = floatingButtonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const currentTop = rect.top + rect.height / 2;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startTop: currentTop,
      moved: false,
    };

    suppressClickRef.current = false;
    button.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - dragState.startClientY;

    if (!dragState.moved && Math.abs(deltaY) >= DRAG_THRESHOLD) {
      dragState.moved = true;
      suppressClickRef.current = true;
      setDragging(true);
    }

    if (!dragState.moved) return;

    event.preventDefault();
    setFloatingTop(clampFloatingTop(dragState.startTop + deltaY));
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const button = floatingButtonRef.current;
    if (button?.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
    setDragging(false);
  }

  function handleFloatingClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    setOpen(true);
  }

  return (
    <>
      <div
        className="fixed right-5 z-40 -translate-y-1/2"
        style={{ top: floatingTop === null ? "50%" : `${floatingTop}px` }}
      >
        <div className="group relative">
          <div className="pointer-events-none absolute right-[68px] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[#DCE4EE] bg-white px-3 py-2 text-[11px] font-medium text-[#59636C] shadow-sm group-hover:block">
            AI Process Advisor · drag to move
          </div>

          <button
            ref={floatingButtonRef}
            type="button"
            onClick={handleFloatingClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            aria-label="Open Process Mining Advisor. Drag vertically to move."
            title="AI Process Advisor — drag vertically to move"
            className={[
              "relative flex size-[60px] touch-none select-none items-center justify-center rounded-full border border-[#2F5FA8] bg-[#3569B8] text-white shadow-[0_8px_20px_rgba(53,105,184,0.24)] transition duration-200",
              dragging
                ? "cursor-grabbing scale-[1.03] shadow-[0_10px_24px_rgba(53,105,184,0.30)]"
                : "cursor-grab hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[#2F5FA8] hover:shadow-[0_10px_24px_rgba(53,105,184,0.28)]",
            ].join(" ")}
          >
            <Star
              className="size-7"
              strokeWidth={1.8}
              fill="currentColor"
              aria-hidden
            />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/15" role="presentation">
          <aside className="absolute bottom-0 right-0 top-0 flex w-full max-w-[430px] flex-col border-l border-[#DCE4EE] bg-white shadow-[-8px_0_24px_rgba(25,50,76,0.10)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E9ED] px-5 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
                    <Bot className="size-4.5" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#202126]">Process Mining Advisor</h3>
                    <p className="mt-0.5 text-[11px] text-[#7D858D]">LLM explanation grounded in mining evidence</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close Process Mining Advisor"
                className="rounded-lg border border-[#DCE4EE] p-2 text-[#68727B] transition hover:bg-[#F6F8FA]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {!advice && !loading && !error ? (
                <div className="rounded-2xl border border-[#DCE4EE] bg-[#F8FAFC] p-5">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="mt-0.5 size-4.5 shrink-0 text-[#3569B8]" aria-hidden />
                    <div>
                      <p className="text-[13px] font-semibold text-[#30343A]">Generate evidence-based advice</p>
                      <p className="mt-1 text-[12px] leading-5 text-[#6F7982]">
                        The advisor receives the current variants, conformance results, bottlenecks, failures, tokens, and latency from Process Mining. It does not read or change the workflow directly.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateAdvice()}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#3569B8] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#2F5FA8]"
                  >
                    <Sparkles className="size-4" aria-hidden />
                    Generate Advice
                  </button>
                </div>
              ) : null}

              {loading ? (
                <div className="flex min-h-[260px] items-center justify-center text-center">
                  <div>
                    <LoaderCircle className="mx-auto size-7 animate-spin text-[#3569B8]" aria-hidden />
                    <p className="mt-3 text-[13px] font-medium text-[#59636C]">Analyzing Process Mining evidence...</p>
                    <p className="mt-1 text-[11px] text-[#8A9299]">No workflow changes are made.</p>
                  </div>
                </div>
              ) : null}

              {error && !loading ? (
                <div className="rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#C84E1B]" aria-hidden />
                    <div>
                      <p className="text-[12px] font-semibold text-[#B94A16]">Advisor unavailable</p>
                      <p className="mt-1 text-[11px] leading-5 text-[#8B5A43]">{error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateAdvice()}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E7C5AF] bg-white px-3 py-2 text-[11px] font-semibold text-[#A24A20]"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Try Again
                  </button>
                </div>
              ) : null}

              {advice && !loading ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[#DCE4EE] bg-[#F8FAFC] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7C8790]">
                      <span>{advice.analyzed_runs} analyzed runs</span>
                      <span>·</span>
                      <span>{advice.evidence_strength} evidence</span>
                    </div>
                    <p className="mt-3 text-[12px] leading-5 text-[#525E68]">{advice.overview}</p>
                  </div>

                  {advice.recommendations.length > 0 ? (
                    <div className="space-y-3">
                      {advice.recommendations.map((item, index) => (
                        <div key={`${item.title}-${index}`} className="rounded-xl border border-[#E1E7ED] bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="flex size-6 items-center justify-center rounded-md bg-[#E8F0FB] text-[10px] font-bold text-[#3569B8]">{index + 1}</span>
                              <p className="text-[13px] font-semibold text-[#30343A]">{item.title}</p>
                            </div>
                            <span className={["rounded-full border px-2 py-1 text-[9px] font-bold uppercase", priorityClasses(item.priority)].join(" ")}>{item.priority}</span>
                          </div>

                          <div className="mt-4 space-y-3 text-[11px] leading-5">
                            <div>
                              <p className="font-semibold text-[#59636C]">Evidence</p>
                              <p className="mt-0.5 text-[#737D85]">{item.evidence}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-[#59636C]">Recommendation</p>
                              <p className="mt-0.5 text-[#737D85]">{item.recommendation}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-[#59636C]">Expected benefit</p>
                              <p className="mt-0.5 text-[#737D85]">{item.expected_benefit}</p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-[#879099]">
                            <ShieldCheck className="size-3.5" aria-hidden />
                            Confidence: {item.confidence}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#DCE4EE] p-4 text-[12px] leading-5 text-[#66727D]">
                      No specific optimization is justified by the current evidence yet. Keep collecting execution history and regenerate advice later.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void generateAdvice()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#DCE4EE] bg-white px-4 py-2.5 text-[11px] font-semibold text-[#59636C] transition hover:bg-[#F6F8FA]"
                  >
                    <RefreshCw className="size-3.5" aria-hidden />
                    Regenerate from Latest Evidence
                  </button>

                  <div className="rounded-xl border border-dashed border-[#D5DEE8] px-4 py-3">
                    <div className="flex items-start gap-2">
                      <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-[#8190A0]" aria-hidden />
                      <p className="text-[10px] leading-4 text-[#7D858D]">{advice.disclaimer}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
