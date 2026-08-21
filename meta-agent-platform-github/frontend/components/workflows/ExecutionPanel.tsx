"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  History,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { getApiBaseUrl } from "../../lib/api";

export type WorkflowRunListItem = {
  id: number;
  workflow_id: number;
  input: string;
  final_output: string;
  status: string;
  error: string;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  model_name: string;
  model_calls: number;
  created_at: string;
  completed_at: string | null;
};

type WorkflowRunListResponse = {
  runs: WorkflowRunListItem[];
};

type ErrorResponse = {
  detail?: string;
  message?: string;
};

type ExecutionPanelProps = {
  workflowId: number;
  onRunWorkflow: () => void;
};

type ActivityPoint = {
  label: string;
  value: number;
};

const PAGE_SIZE = 8;

function normalizeDateValue(
  value: string,
): string {
  if (!value) {
    return value;
  }

  return value.includes("T")
    ? value
    : value.replace(" ", "T");
}

function parseDate(
  value: string,
): Date | null {
  const date = new Date(
    normalizeDateValue(value),
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDate(
  value: string,
): string {
  const date = parseDate(value);

  if (!date) {
    return value || "Unknown date";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(
  value: string,
): string {
  const date = parseDate(value);

  if (!date) {
    return value || "Unknown date";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDurationMilliseconds(
  run: WorkflowRunListItem,
): number | null {
  if (
    typeof run.duration_ms === "number" &&
    run.duration_ms >= 0
  ) {
    return run.duration_ms;
  }

  if (!run.completed_at) {
    return null;
  }

  const startedAt =
    parseDate(run.created_at);

  const completedAt =
    parseDate(run.completed_at);

  if (!startedAt || !completedAt) {
    return null;
  }

  const duration =
    completedAt.getTime() -
    startedAt.getTime();

  if (duration < 0) {
    return null;
  }

  return duration;
}

function formatDuration(
  milliseconds: number | null,
): string {
  if (milliseconds === null) {
    return "—";
  }

  const totalSeconds = Math.max(
    0,
    Math.round(milliseconds / 1000),
  );

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(
    totalSeconds / 60,
  );

  const seconds =
    totalSeconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  const remainingMinutes =
    minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function createInputTitle(
  input: string,
): string {
  const normalizedInput = input
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedInput) {
    return "Empty input";
  }

  if (normalizedInput.length <= 72) {
    return normalizedInput;
  }

  return `${normalizedInput.slice(0, 72)}…`;
}

function getStatusBadgeClasses(
  status: string,
): string {
  switch (status) {
    case "completed":
      return "bg-[#EEF6F0] text-[#438252]";

    case "failed":
      return "bg-[#FFF0E8] text-[#D95117]";

    case "running":
      return "bg-[#EDF4FC] text-[#3569B8]";

    default:
      return "bg-[#F1F4F7] text-[#68727B]";
  }
}

function StatusIcon({
  status,
}: {
  status: string;
}) {
  if (status === "completed") {
    return (
      <CheckCircle2
        className="size-4 text-[#438252]"
        aria-hidden
      />
    );
  }

  if (status === "failed") {
    return (
      <XCircle
        className="size-4 text-[#D95117]"
        aria-hidden
      />
    );
  }

  if (status === "running") {
    return (
      <LoaderCircle
        className="size-4 animate-spin text-[#3569B8]"
        aria-hidden
      />
    );
  }

  return (
    <Clock3
      className="size-4 text-[#8A9299]"
      aria-hidden
    />
  );
}

function createActivityData(
  runs: WorkflowRunListItem[],
): ActivityPoint[] {
  const points: ActivityPoint[] = [];

  const now = new Date();

  for (
    let offset = 6;
    offset >= 0;
    offset -= 1
  ) {
    const day = new Date(now);

    day.setHours(0, 0, 0, 0);
    day.setDate(
      day.getDate() - offset,
    );

    const nextDay = new Date(day);

    nextDay.setDate(
      nextDay.getDate() + 1,
    );

    const count = runs.filter(
      (run) => {
        const createdAt =
          parseDate(run.created_at);

        if (!createdAt) {
          return false;
        }

        return (
          createdAt >= day &&
          createdAt < nextDay
        );
      },
    ).length;

    points.push({
      label: day.toLocaleDateString(
        "en-US",
        {
          month: "short",
          day: "numeric",
        },
      ),
      value: count,
    });
  }

  return points;
}

function ExecutionActivityChart({
  data,
}: {
  data: ActivityPoint[];
}) {
  const width = 760;
  const height = 210;
  const paddingLeft = 42;
  const paddingRight = 20;
  const paddingTop = 22;
  const paddingBottom = 40;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;

  const maxValue = Math.max(
    1,
    ...data.map(
      (point) => point.value,
    ),
  );

  const points = data.map(
    (point, index) => {
      const x =
        paddingLeft +
        (
          index /
          Math.max(
            data.length - 1,
            1,
          )
        ) *
          chartWidth;

      const y =
        paddingTop +
        chartHeight -
        (point.value / maxValue) *
          chartHeight;

      return {
        ...point,
        x,
        y,
      };
    },
  );

  const polylinePoints = points
    .map(
      (point) =>
        `${point.x},${point.y}`,
    )
    .join(" ");

  const areaPoints = [
    `${paddingLeft},${
      paddingTop + chartHeight
    }`,
    ...points.map(
      (point) =>
        `${point.x},${point.y}`,
    ),
    `${
      paddingLeft + chartWidth
    },${paddingTop + chartHeight}`,
  ].join(" ");

  const gridLines = [0, 0.5, 1];

  return (
    <div className="mt-6 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[640px] w-full"
        role="img"
        aria-label="Workflow executions during the last seven days"
      >
        <defs>
          <linearGradient
            id="execution-area-gradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#8DB0DB"
              stopOpacity="0.34"
            />

            <stop
              offset="100%"
              stopColor="#8DB0DB"
              stopOpacity="0.03"
            />
          </linearGradient>
        </defs>

        {gridLines.map(
          (ratio) => {
            const y =
              paddingTop +
              chartHeight *
                ratio;

            const value = Math.round(
              maxValue *
                (1 - ratio),
            );

            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={
                    paddingLeft +
                    chartWidth
                  }
                  y2={y}
                  stroke="#E5E9ED"
                  strokeWidth="1"
                  strokeDasharray="4 5"
                />

                <text
                  x={
                    paddingLeft - 12
                  }
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#929AA1"
                >
                  {value}
                </text>
              </g>
            );
          },
        )}

        <polygon
          points={areaPoints}
          fill="url(#execution-area-gradient)"
        />

        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#3569B8"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point) => (
          <g key={point.label}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#FFFFFF"
              stroke="#3569B8"
              strokeWidth="3"
            />

            <text
              x={point.x}
              y={
                paddingTop +
                chartHeight +
                25
              }
              textAnchor="middle"
              fontSize="10"
              fill="#7A838B"
            >
              {point.label}
            </text>

            {point.value > 0 ? (
              <text
                x={point.x}
                y={point.y - 11}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#3569B8"
              >
                {point.value}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function ExecutionPanel({
  workflowId,
  onRunWorkflow,
}: ExecutionPanelProps) {
  const router = useRouter();
  const [runs, setRuns] =
    useState<WorkflowRunListItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);




  const [
    deletingRunId,
    setDeletingRunId,
  ] = useState<number | null>(null);

  const [currentPage, setCurrentPage] =
    useState(1);

  const loadRuns =
    useCallback(async (): Promise<void> => {
      if (
        !Number.isInteger(workflowId) ||
        workflowId <= 0
      ) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}/runs`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowRunListResponse
          | ErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load executions.",
          );
        }

        const runData =
          data as WorkflowRunListResponse;

        setRuns(
          runData.runs ?? [],
        );

        setCurrentPage(1);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load executions.",
        );
      } finally {
        setLoading(false);
      }
    }, [workflowId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const statusCounts = useMemo(
    () => ({
      total: runs.length,

      running: runs.filter(
        (run) =>
          run.status === "running",
      ).length,

      completed: runs.filter(
        (run) =>
          run.status === "completed",
      ).length,

      failed: runs.filter(
        (run) =>
          run.status === "failed",
      ).length,
    }),
    [runs],
  );

  const activityData = useMemo(
    () => createActivityData(runs),
    [runs],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(
      runs.length / PAGE_SIZE,
    ),
  );

  const executionNumberById = useMemo(() => {
    const orderedRuns = runs
      .slice()
      .sort(
        (
          firstRun,
          secondRun,
        ) => {
          const firstTime =
            parseDate(
              firstRun.created_at,
            )?.getTime() ??
            firstRun.id;

          const secondTime =
            parseDate(
              secondRun.created_at,
            )?.getTime() ??
            secondRun.id;

          if (
            firstTime !== secondTime
          ) {
            return (
              firstTime -
              secondTime
            );
          }

          return (
            firstRun.id -
            secondRun.id
          );
        },
      );

    return new Map<number, number>(
      orderedRuns.map(
        (
          run,
          index,
        ) => [
          run.id,
          index + 1,
        ],
      ),
    );
  }, [runs]);

  const safeCurrentPage = Math.min(
    currentPage,
    totalPages,
  );

  const paginatedRuns = runs.slice(
    (safeCurrentPage - 1) *
      PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  function openExecution(
    runId: number,
  ): void {
    router.push(
      `/app/workflows/${workflowId}/executions/${runId}`,
    );
  }

  async function deleteExecution(
    event: MouseEvent<HTMLButtonElement>,
    runId: number,
  ): Promise<void> {
    event.stopPropagation();

    if (deletingRunId !== null) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this execution record? This action cannot be undone.",
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingRunId(runId);
      setError(null);

      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowId}/runs/${runId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => null)) as
          | ErrorResponse
          | null;

        throw new Error(
          data?.detail ??
            data?.message ??
            "Unable to delete execution.",
        );
      }

      setRuns(
        (previousRuns) =>
          previousRuns.filter(
            (run) =>
              run.id !== runId,
          ),
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete execution.",
      );
    } finally {
      setDeletingRunId(null);
    }
  }


  const statusCards = [
    {
      label: "Total",
      value: statusCounts.total,
      description: "All executions",
      icon: History,
      iconClasses:
        "bg-[#E8F0FB] text-[#3569B8]",
    },
    {
      label: "Running",
      value: statusCounts.running,
      description: "Active runs",
      icon: LoaderCircle,
      iconClasses:
        "bg-[#EDF4FC] text-[#3569B8]",
    },
    {
      label: "Completed",
      value: statusCounts.completed,
      description: "Successful runs",
      icon: CheckCircle2,
      iconClasses:
        "bg-[#EEF6F0] text-[#438252]",
    },
    {
      label: "Failed",
      value: statusCounts.failed,
      description: "Failed runs",
      icon: XCircle,
      iconClasses:
        "bg-[#FFF0E8] text-[#D95117]",
    },
  ];

  return (
    <>
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#DCE4EE] bg-white p-6 shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[21px] font-semibold text-[#202126]">
                Execution
              </h2>

              <p className="mt-1 text-[14px] leading-6 text-[#73757A]">
                Monitor workflow activity and inspect previous runs.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  void loadRuns();
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-[#D8DEE5] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#4E5963] transition hover:bg-[#F6F8FA] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw
                  className={[
                    "size-3.5",
                    loading
                      ? "animate-spin"
                      : "",
                  ].join(" ")}
                  aria-hidden
                />

                Refresh
              </button>

              <button
                type="button"
                onClick={onRunWorkflow}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3569B8] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#2F5FA8]"
              >
                <Play
                  className="size-3.5"
                  aria-hidden
                />

                Run Workflow
              </button>
            </div>
          </div>

          {error ? (
            <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-3 text-[13px] font-medium text-[#D95117]">
              <span>{error}</span>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                }}
                className="shrink-0"
                aria-label="Dismiss error"
              >
                <XCircle
                  className="size-4"
                  aria-hidden
                />
              </button>
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-[#E1E6EB] bg-[#FAFBFC] px-5 py-5">
            <div>
              <h3 className="text-[16px] font-semibold text-[#30343A]">
                Execution Activity
              </h3>

              <p className="mt-1 text-[12px] text-[#8A9299]">
                Workflow runs during the last seven days.
              </p>
            </div>

            {loading ? (
              <div className="flex min-h-[230px] items-center justify-center">
                <div className="text-center">
                  <div className="mx-auto size-7 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

                  <p className="mt-3 text-[12px] text-[#8A9299]">
                    Loading activity...
                  </p>
                </div>
              </div>
            ) : (
              <ExecutionActivityChart
                data={activityData}
              />
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {statusCards.map((card) => {
            const Icon = card.icon;

            return (
              <article
                key={card.label}
                className="rounded-xl border border-[#DCE4EE] bg-white p-5 shadow-[0_1px_2px_rgba(25,50,76,0.05)]"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={[
                      "flex size-10 items-center justify-center rounded-xl",
                      card.iconClasses,
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "size-4",
                        card.label ===
                        "Running" &&
                        statusCounts.running >
                          0
                          ? "animate-spin"
                          : "",
                      ].join(" ")}
                      aria-hidden
                    />
                  </span>

                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#949CA4]">
                    {card.label}
                  </span>
                </div>

                <p className="mt-5 text-[30px] font-semibold tracking-[-0.03em] text-[#202126]">
                  {card.value}
                </p>

                <p className="mt-1 text-[12px] text-[#73757A]">
                  {card.description}
                </p>
              </article>
            );
          })}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_1px_2px_rgba(25,50,76,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E3E8ED] px-6 py-5">
            <div>
              <h3 className="text-[18px] font-semibold text-[#202126]">
                Execution History
              </h3>

              <p className="mt-1 text-[13px] text-[#8A9299]">
                Review inputs, status, duration, and outputs.
              </p>
            </div>

            <span className="rounded-full bg-[#F1F4F7] px-3 py-1 text-[11px] font-semibold text-[#68727B]">
              {runs.length}{" "}
              {runs.length === 1
                ? "record"
                : "records"}
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="text-center">
                <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

                <p className="mt-4 text-[14px] text-[#73757A]">
                  Loading executions...
                </p>
              </div>
            </div>
          ) : runs.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <History
                className="mx-auto size-8 text-[#A0A8AF]"
                aria-hidden
              />

              <h4 className="mt-4 text-[17px] font-semibold text-[#30343A]">
                No executions yet
              </h4>

              <p className="mt-2 text-[13px] text-[#73757A]">
                Run the workflow to create its first execution record.
              </p>

              <button
                type="button"
                onClick={onRunWorkflow}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#3569B8] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#2F5FA8]"
              >
                <Play
                  className="size-4"
                  aria-hidden
                />

                Run Workflow
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#E3E8ED] bg-[#FAFBFC]">
                      <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                        Input
                      </th>

                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                        Status
                      </th>

                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                        Duration
                      </th>

                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                        Created
                      </th>

                      <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A9299]">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedRuns.map(
                      (run) => (
                        <tr
                          key={run.id}
                          onClick={() => {
                            openExecution(
                              run.id,
                            );
                          }}
                          className="cursor-pointer border-b border-[#EDF0F3] transition last:border-b-0 hover:bg-[#FAFBFC]"
                        >
                          <td className="max-w-[360px] px-5 py-4">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F1F4F7]">
                                <StatusIcon
                                  status={
                                    run.status
                                  }
                                />
                              </span>

                              <div className="min-w-0">
                                <p
                                  className="truncate text-[13px] font-semibold text-[#30343A]"
                                  title={run.input}
                                >
                                  {createInputTitle(
                                    run.input,
                                  )}
                                </p>

                                <p className="mt-1 text-[10px] text-[#949CA4]">
                                  Execution #
                                  {executionNumberById.get(
                                    run.id,
                                  ) ?? run.id}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={[
                                "inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.06em]",
                                getStatusBadgeClasses(
                                  run.status,
                                ),
                              ].join(" ")}
                            >
                              {run.status}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-[12px] font-medium text-[#59636C]">
                            {formatDuration(
                              getDurationMilliseconds(
                                run,
                              ),
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <p className="text-[12px] text-[#59636C]">
                              {formatShortDate(
                                run.created_at,
                              )}
                            </p>

                            <p className="mt-1 text-[10px] text-[#A0A8AF]">
                              {formatDate(
                                run.created_at,
                              )}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(
                                  event,
                                ) => {
                                  event.stopPropagation();

                                  openExecution(
                                    run.id,
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DEE5] bg-white px-3 py-2 text-[11px] font-semibold text-[#4E5963] transition hover:border-[#B9CBE0] hover:bg-[#F6F8FA] hover:text-[#3569B8]"
                              >
                                <Eye
                                  className="size-3.5"
                                  aria-hidden
                                />

                                View
                              </button>

                              <button
                                type="button"
                                onClick={(
                                  event,
                                ) => {
                                  void deleteExecution(
                                    event,
                                    run.id,
                                  );
                                }}
                                disabled={
                                  deletingRunId !==
                                  null
                                }
                                className="flex size-8 items-center justify-center rounded-lg text-[#8A9299] transition hover:bg-[#FFF0E8] hover:text-[#D95117] disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Delete execution ${run.id}`}
                              >
                                {deletingRunId ===
                                run.id ? (
                                  <LoaderCircle
                                    className="size-4 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Trash2
                                    className="size-4"
                                    aria-hidden
                                  />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E3E8ED] bg-[#FAFBFC] px-5 py-4">
                <p className="text-[11px] text-[#8A9299]">
                  Showing{" "}
                  {(safeCurrentPage - 1) *
                    PAGE_SIZE +
                    1}
                  –
                  {Math.min(
                    safeCurrentPage *
                      PAGE_SIZE,
                    runs.length,
                  )}{" "}
                  of {runs.length}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(
                        (previousPage) =>
                          Math.max(
                            1,
                            previousPage -
                              1,
                          ),
                      );
                    }}
                    disabled={
                      safeCurrentPage <= 1
                    }
                    className="flex size-8 items-center justify-center rounded-lg border border-[#D8DEE5] bg-white text-[#59636C] transition hover:bg-[#F1F4F7] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft
                      className="size-4"
                      aria-hidden
                    />
                  </button>

                  <span className="min-w-[82px] text-center text-[11px] font-medium text-[#59636C]">
                    Page {safeCurrentPage} of{" "}
                    {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage(
                        (previousPage) =>
                          Math.min(
                            totalPages,
                            previousPage +
                              1,
                          ),
                      );
                    }}
                    disabled={
                      safeCurrentPage >=
                      totalPages
                    }
                    className="flex size-8 items-center justify-center rounded-lg border border-[#D8DEE5] bg-white text-[#59636C] transition hover:bg-[#F1F4F7] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight
                      className="size-4"
                      aria-hidden
                    />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}