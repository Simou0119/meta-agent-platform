"use client";

import {
  BarChart3,
  ChevronRight,
  History,
  Route,
  Workflow,
} from "lucide-react";

export type WorkflowDetailTab =
  | "graph"
  | "execution"
  | "metrics"
  | "process-mining";

type WorkflowDetailsSidebarProps = {
  activeTab: WorkflowDetailTab;
  onChange: (
    tab: WorkflowDetailTab,
  ) => void;
};

const navigationItems: Array<{
  id: WorkflowDetailTab;
  label: string;
  description: string;
  icon: typeof Workflow;
}> = [
  {
    id: "graph",
    label: "Run Graph",
    description: "Workflow structure",
    icon: Workflow,
  },
  {
    id: "execution",
    label: "Execution",
    description: "Previous runs",
    icon: History,
  },
  {
    id: "metrics",
    label: "Metrics",
    description: "Runtime statistics",
    icon: BarChart3,
  },
  {
    id: "process-mining",
    label: "Process Mining",
    description: "Execution path analysis",
    icon: Route,
  },
];

export function WorkflowDetailsSidebar({
  activeTab,
  onChange,
}: WorkflowDetailsSidebarProps) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_1px_2px_rgba(25,50,76,0.05)] lg:sticky lg:top-6">
      <div className="border-b border-[#E5E9ED] px-4 py-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#949CA4]">
          Workflow details
        </p>
      </div>

      <nav
        className="space-y-1 p-2"
        aria-label="Workflow details navigation"
      >
        {navigationItems.map(
          (navigationItem) => {
            const Icon =
              navigationItem.icon;

            const selected =
              activeTab ===
              navigationItem.id;

            return (
              <button
                key={navigationItem.id}
                type="button"
                onClick={() => {
                  onChange(
                    navigationItem.id,
                  );
                }}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                  selected
                    ? "bg-[#E8F0FB] text-[#3569B8]"
                    : "text-[#59636C] hover:bg-[#F4F6F8] hover:text-[#202126]",
                ].join(" ")}
                aria-current={
                  selected
                    ? "page"
                    : undefined
                }
              >
                <span
                  className={[
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? "bg-white/70"
                      : "bg-[#F1F4F7]",
                  ].join(" ")}
                >
                  <Icon
                    className="size-4"
                    aria-hidden
                  />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">
                    {
                      navigationItem.label
                    }
                  </span>

                  <span
                    className={[
                      "mt-0.5 block text-[10px]",
                      selected
                        ? "text-[#6587B2]"
                        : "text-[#929AA1]",
                    ].join(" ")}
                  >
                    {
                      navigationItem.description
                    }
                  </span>
                </span>

                <ChevronRight
                  className={[
                    "size-4 shrink-0",
                    selected
                      ? "text-[#3569B8]"
                      : "text-[#B0B6BC]",
                  ].join(" ")}
                  aria-hidden
                />
              </button>
            );
          },
        )}
      </nav>
    </aside>
  );
}