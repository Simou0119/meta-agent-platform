"use client";

import type { ComponentType, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  GitBranch,
  Lightbulb,
  RefreshCw,
  Repeat2,
  Route,
  Sparkles,
  XCircle,
} from "lucide-react";

import { getApiBaseUrl } from "../../lib/api";
import { DiscoveredProcessGraph } from "./DiscoveredProcessGraph";
import { ConformanceCheckingPanel, type ProcessMiningConformance } from "./ConformanceCheckingPanel";
import { ProcessMiningAdvisor } from "./ProcessMiningAdvisor";
import { InternalSectionNav } from "./InternalSectionNav";

type ProcessMiningSummary = {
  total_runs: number;
  analyzed_runs: number;
  completed_runs: number;
  failed_runs: number;
  success_rate: number;
  variant_count: number;
  repeated_run_count: number;
  repeated_run_rate: number;
  average_duration_ms: number | null;
  average_total_tokens: number | null;
};

type ProcessMiningVariant = {
  rank: number;
  path: string[];
  count: number;
  percentage: number;
  completed_count: number;
  failed_count: number;
  failure_rate: number;
  run_ids: number[];
};

type ProcessMiningActivity = {
  agent_id: number | null;
  activity: string;
  agent_order: number;
  execution_count: number;
  completed_count: number;
  failed_count: number;
  failure_rate: number;
  average_duration_ms: number | null;
  average_total_tokens: number | null;
};

type ProcessMiningInsight = {
  type: string;
  severity: string | null;
  title: string;
  detail: string;
};

type ProcessMiningRecommendation = {
  type: string;
  title: string;
  detail: string;
};

type ProcessMiningResponse = {
  workflow_id: number;
  summary: ProcessMiningSummary;
  variants: ProcessMiningVariant[];
  activities: ProcessMiningActivity[];
  direct_follows: Array<{
    source: string;
    target: string;
    count: number;
  }>;
  conformance: ProcessMiningConformance;
  issues: ProcessMiningInsight[];
  recommendations: ProcessMiningRecommendation[];
};

type ApiErrorResponse = {
  detail?: string;
  message?: string;
};

type ProcessMiningPanelProps = {
  workflowId: number;
};

function formatDuration(value: number | null): string {
  if (value === null) {
    return "—";
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  const seconds = value / 1000;
  return seconds < 60
    ? `${seconds.toFixed(2)} s`
    : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatNumber(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
  }).format(value);
}


type CollapsibleSectionProps = {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  defaultExpanded?: boolean;
  badge?: ReactNode;
  children: ReactNode;
};

function CollapsibleSection({
  title,
  description,
  icon: Icon,
  defaultExpanded = true,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="size-4 text-[#3569B8]" aria-hidden /> : null}
            <h3 className="text-[16px] font-semibold text-[#202126]">{title}</h3>
          </div>
          {description ? <p className="mt-1 text-[12px] leading-5 text-[#7D858D]">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE4EE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#59636C] transition hover:bg-[#F6F8FA]"
          >
            {expanded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronRight className="size-3.5" aria-hidden />}
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {expanded ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

export function ProcessMiningPanel({
  workflowId,
}: ProcessMiningPanelProps) {
  const [analysis, setAnalysis] =
    useState<ProcessMiningResponse | null>(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState<string | null>(null);

  const loadAnalysis = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowId}/process-mining`,
        { credentials: "include" },
      );

      const data = (await response
        .json()
        .catch(() => null)) as
        | ProcessMiningResponse
        | ApiErrorResponse
        | null;

      if (!response.ok) {
        const errorData = data as ApiErrorResponse | null;
        throw new Error(
          errorData?.detail ??
            errorData?.message ??
            "Unable to load process mining analysis.",
        );
      }

      setAnalysis(data as ProcessMiningResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load process mining analysis.",
      );
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void loadAnalysis();
  }, [loadAnalysis]);

  if (loading) {
    return (
      <section className="flex min-h-[520px] items-center justify-center rounded-2xl border border-[#DCE4EE] bg-white">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />
          <p className="mt-4 text-[14px] text-[#73757A]">
            Analyzing workflow execution paths...
          </p>
        </div>
      </section>
    );
  }

  if (error || !analysis) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6">
        <div className="rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-5 py-4">
          <p className="text-[14px] font-medium text-[#D95117]">
            {error ?? "Process mining analysis is unavailable."}
          </p>
          <button
            type="button"
            onClick={() => void loadAnalysis()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#3569B8] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#2F5FA8]"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Try Again
          </button>
        </div>
      </section>
    );
  }

  const { summary } = analysis;

  if (summary.analyzed_runs === 0) {
    return (
      <section className="rounded-2xl border border-[#DCE4EE] bg-white p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
          <Route className="size-5" aria-hidden />
        </div>
        <h2 className="mt-4 text-[18px] font-semibold text-[#202126]">
          No execution paths to analyze yet
        </h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[13px] leading-6 text-[#73757A]">
          Run this workflow first. Process Mining is read-only and will analyze the existing execution history without changing the workflow.
        </p>
      </section>
    );
  }

  const summaryCards = [
    {
      label: "Analyzed Runs",
      value: String(summary.analyzed_runs),
      icon: Route,
    },
    {
      label: "Variants",
      value: String(summary.variant_count),
      icon: GitBranch,
    },
    {
      label: "Success Rate",
      value: `${summary.success_rate.toFixed(1)}%`,
      icon: CheckCircle2,
    },
    {
      label: "Repeated Runs",
      value: `${summary.repeated_run_rate.toFixed(1)}%`,
      icon: Repeat2,
    },
    {
      label: "Avg. Duration",
      value: formatDuration(summary.average_duration_ms),
      icon: Clock3,
    },
    {
      label: "Avg. Tokens",
      value: formatNumber(summary.average_total_tokens),
      icon: Sparkles,
    },
  ];

  const processMiningSections = [
    { id: "process-overview", label: "Overview" },
    { id: "process-discovery", label: "Process Map" },
    { id: "process-conformance", label: "Conformance" },
    { id: "process-variants", label: "Variants" },
    { id: "process-issues", label: "Issues" },
    { id: "process-recommendations", label: "Recommendations" },
    { id: "process-agent-performance", label: "Agent Performance" },
  ];

  return (
    <section className="space-y-5">
      <InternalSectionNav items={processMiningSections} />

      <div id="process-overview" className="scroll-mt-24">
      <CollapsibleSection
        title="Observed Workflow Behavior"
        description="Read-only analysis of actual execution history. It detects common paths, repeated agent calls, bottlenecks, and failure-prone variants without modifying the workflow."
        icon={Route}
        badge={
          <button
            type="button"
            onClick={() => void loadAnalysis()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#DCE4EE] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#59636C] transition hover:bg-[#F6F8FA]"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-xl border border-[#E5E9ED] bg-[#FAFBFC] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8B949D]">{card.label}</p>
                  <Icon className="size-4 text-[#3569B8]" aria-hidden />
                </div>
                <p className="mt-2 text-[22px] font-semibold text-[#202126]">{card.value}</p>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
      </div>

      <div id="process-discovery" className="scroll-mt-24">
      <CollapsibleSection
        title="Discovered Process"
        description="A directly-follows graph reconstructed from real workflow executions. Edge labels show occurrence count and share of analyzed runs."
        icon={Route}
        badge={<span className="rounded-full border border-[#DCE4EE] bg-[#F8FAFC] px-3 py-1 text-[10px] font-semibold text-[#6C7883]">Read-only · execution history</span>}
      >
        <DiscoveredProcessGraph
          activities={analysis.activities}
          directFollows={analysis.direct_follows}
          analyzedRuns={summary.analyzed_runs}
        />
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[#87919A]">
          <span>Node badge = executions</span>
          <span>Node footer = average duration · failure rate</span>
          <span>Edge = directly-follows frequency</span>
        </div>
      </CollapsibleSection>
      </div>

      <div id="process-conformance" className="scroll-mt-24">
        <ConformanceCheckingPanel conformance={analysis.conformance} />
      </div>

      <div id="process-variants" className="scroll-mt-24">
      <CollapsibleSection
        title="Execution Variants"
        description="The most common real execution paths found in previous runs."
        icon={GitBranch}
      >
        <div className="space-y-3">
          {analysis.variants.map((variant) => (
            <div key={`${variant.rank}-${variant.path.join("-")}`} className="rounded-xl border border-[#E5E9ED] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-[#E8F0FB] px-2 py-1 text-[11px] font-bold text-[#3569B8]">#{variant.rank}</span>
                  <span className="text-[12px] font-semibold text-[#59636C]">{variant.count} run{variant.count === 1 ? "" : "s"} · {variant.percentage.toFixed(1)}%</span>
                </div>
                <span className={["rounded-full px-2.5 py-1 text-[10px] font-semibold", variant.failed_count > 0 ? "bg-[#FFF0EA] text-[#C84E1B]" : "bg-[#EAF7EF] text-[#287A48]"].join(" ")}>
                  {variant.failed_count > 0 ? `${variant.failure_rate.toFixed(1)}% failure` : "No failures"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {variant.path.map((activity, index) => (
                  <div key={`${variant.rank}-${index}-${activity}`} className="flex items-center gap-2">
                    <span className="rounded-lg border border-[#DCE4EE] bg-[#F8FAFC] px-3 py-2 text-[12px] font-semibold text-[#3F4850]">{activity}</span>
                    {index < variant.path.length - 1 ? <span className="text-[#A0A8B0]">→</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div id="process-issues" className="scroll-mt-24">
        <CollapsibleSection title="Detected Issues" icon={AlertTriangle}>
          <div className="space-y-3">
            {analysis.issues.map((issue, index) => {
              const IssueIcon = issue.severity === "success" ? CheckCircle2 : issue.severity === "warning" ? AlertTriangle : XCircle;
              return (
                <div key={`${issue.type}-${index}`} className="rounded-xl border border-[#E5E9ED] bg-[#FAFBFC] p-4">
                  <div className="flex items-start gap-3">
                    <IssueIcon className="mt-0.5 size-4 shrink-0 text-[#6C7780]" aria-hidden />
                    <div>
                      <p className="text-[13px] font-semibold text-[#30343A]">{issue.title}</p>
                      <p className="mt-1 text-[12px] leading-5 text-[#737B82]">{issue.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
        </div>

        <div id="process-recommendations" className="scroll-mt-24">
        <CollapsibleSection title="Optimization Suggestions" icon={Lightbulb}>
          <div className="space-y-3">
            {analysis.recommendations.map((recommendation, index) => (
              <div key={`${recommendation.type}-${index}`} className="rounded-xl border border-[#DCE4EE] bg-[#F7FAFE] p-4">
                <p className="text-[13px] font-semibold text-[#315F9D]">{recommendation.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-[#66727D]">{recommendation.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-[#CFD9E5] px-4 py-3 text-[11px] leading-5 text-[#7D858D]">
            Suggestions are advisory only. This version never edits, replaces, or automatically regenerates your workflow.
          </div>
        </CollapsibleSection>
        </div>
      </div>

      <div id="process-agent-performance" className="scroll-mt-24">
      <CollapsibleSection title="Agent Performance in the Process" icon={Clock3}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E5E9ED] text-[10px] font-bold uppercase tracking-[0.08em] text-[#929AA1]">
                <th className="px-3 py-3">Agent</th><th className="px-3 py-3">Executions</th><th className="px-3 py-3">Avg. Time</th><th className="px-3 py-3">Avg. Tokens</th><th className="px-3 py-3">Failure Rate</th>
              </tr>
            </thead>
            <tbody>
              {analysis.activities.map((activity) => (
                <tr key={`${activity.agent_id ?? "none"}-${activity.activity}-${activity.agent_order}`} className="border-b border-[#EEF1F4] last:border-0">
                  <td className="px-3 py-3 text-[12px] font-semibold text-[#3A4148]">{activity.activity}</td>
                  <td className="px-3 py-3 text-[12px] text-[#69737C]">{activity.execution_count}</td>
                  <td className="px-3 py-3 text-[12px] text-[#69737C]">{formatDuration(activity.average_duration_ms)}</td>
                  <td className="px-3 py-3 text-[12px] text-[#69737C]">{formatNumber(activity.average_total_tokens)}</td>
                  <td className="px-3 py-3 text-[12px] text-[#69737C]">{activity.failure_rate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      </div>
      <ProcessMiningAdvisor workflowId={workflowId} />
    </section>
  );
}
