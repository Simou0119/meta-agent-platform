"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock3,
  Download,
  FileText,
  History,
  Mail,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";

import { getApiBaseUrl } from "../../lib/api";
import {
  WorkflowExecutionGraph,
  type RuntimeAgent,
  type RuntimeAgentStatus,
} from "./WorkflowExecutionGraph";


type WorkflowAgentResponse = {
  id: number;
  name: string;
  system_prompt: string;
  role: string;
  description: string;
  order: number;
  created_at: string;
};


type WorkflowTriggerResponse = {
  trigger_type: string;
  conditions: Record<string, string | boolean | number>;
  listening: boolean;
};

type WorkflowFileUploadCapability = {
  enabled: boolean;
  accepted_formats: Array<"docx" | "pdf">;
  multiple: boolean;
  max_files: number;
};

type WorkflowDetailsResponse = {
  id: number;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  agents: WorkflowAgentResponse[];
  trigger?: WorkflowTriggerResponse | null;
  input_capabilities: {
    allow_text: boolean;
    file_upload: WorkflowFileUploadCapability;
  };
  output_capabilities: {
    download_formats: Array<"docx" | "pdf" | "bpmn">;
  };
};

type UploadedWorkflowFile = {
  id: number;
  workflow_id: number;
  filename: string;
  file_type: "docx" | "pdf";
  mime_type: string;
  size_bytes: number;
  text_preview: string;
};

type RuntimeArtifact = {
  id: number;
  run_id: number;
  artifact_type: "docx" | "pdf" | "bpmn";
  filename: string;
  mime_type: string;
  download_url: string;
  created_at: string;
};


type RuntimeMessage = {
  id: string;
  role: "user" | "workflow";
  content: string;
};


type RuntimeToolStatus =
  | "running"
  | "completed"
  | "failed";


type RuntimeToolResult = {
  id: string;

  bindingId?: number;

  provider: string;
  action: string;

  agentId?: number;
  agentName?: string;

  status: RuntimeToolStatus;

  accountEmail?: string;
  recipient?: string;
  sender?: string;
  subject?: string;

  draftId?: string;
  messageId?: string;
  threadId?: string;

  eventCount?: number;
  rangeStart?: string;
  rangeEnd?: string;
  searchQuery?: string;

  eventId?: string;
  eventTitle?: string;
  eventStart?: string;
  eventEnd?: string;
  eventLocation?: string;
  eventLink?: string;
  conflictCount?: number;
  cancelled?: boolean;

  error?: string;
};


type RuntimeEvent = {
  type?: string;

  run_id?: number;

  workflow_id?: number;
  workflow_name?: string;

  agent_id?: number;
  agent_name?: string;
  order?: number;

  output?: string;
  error?: string;

  final_agent_id?: number;
  final_agent_name?: string;
  final_output?: string;

  binding_id?: number;

  provider?: string;
  action?: string;
  tool_type?: string;

  account_email?: string;

  to?: string;
  from?: string;
  subject?: string;

  draft_id?: string;
  message_id?: string;
  thread_id?: string;

  event_count?: number;
  range_start?: string;
  range_end?: string;
  search_query?: string;

  event_id?: string;
  title?: string;
  start?: string;
  end?: string;
  location?: string;
  html_link?: string;
  conflict_count?: number;
  cancelled?: boolean;

  success?: boolean;
  artifacts?: RuntimeArtifact[];
  artifact_error?: string;
};


type ErrorResponse = {
  detail?: string;
  message?: string;
};


type WorkflowHistoryItem = {
  id: number;
  workflow_id: number;
  input: string;
  final_output: string;
  status: string;
  error: string;
  created_at: string;
  completed_at: string | null;
  artifacts: RuntimeArtifact[];
};


type WorkflowHistoryListResponse = {
  runs: WorkflowHistoryItem[];
};


type WorkflowHistoryStep = {
  id: number;
  agent_id: number | null;
  name: string;
  role: string;
  description: string;
  order: number;
  status: string;
  output: string;
  error: string;
  created_at: string;
};


type WorkflowHistoryDetail = WorkflowHistoryItem & {
  agents: WorkflowHistoryStep[];
};


function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}


function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return filename
    .slice(lastDotIndex + 1)
    .trim()
    .toLowerCase();
}


function createId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}


function createToolResultId(
  event: RuntimeEvent,
): string {
  if (
    typeof event.binding_id ===
    "number"
  ) {
    return `binding-${event.binding_id}`;
  }

  return [
    event.provider ?? "tool",
    event.action ?? "action",
    event.agent_id ?? "agent",
  ].join("-");
}


function getToolDisplayName(
  action: string,
): string {
  if (action === "read_message") {
    return "Gmail Read Message";
  }

  if (action === "create_draft") {
    return "Gmail Create Draft";
  }

  if (action === "send_reply") {
    return "Gmail Send Reply";
  }

  if (action === "read_events") {
    return "Google Calendar Read Events";
  }

  if (action === "create_event") {
    return "Google Calendar Create Event";
  }

  if (action === "cancel_event") {
    return "Google Calendar Cancel Event";
  }

  return "Google Tool";
}


function getToolRunningText(
  action: string,
): string {
  if (action === "read_message") {
    return "Reading Gmail message...";
  }

  if (action === "create_draft") {
    return "Creating Gmail draft...";
  }

  if (action === "send_reply") {
    return "Sending Gmail reply...";
  }

  if (action === "read_events") {
    return "Reading Google Calendar events...";
  }

  if (action === "create_event") {
    return "Creating Google Calendar event...";
  }

  if (action === "cancel_event") {
    return "Cancelling Google Calendar event...";
  }

  return "Running Google tool...";
}


function cloneAgents(
  agents: RuntimeAgent[],
): RuntimeAgent[] {
  return agents.map((agent) => ({
    ...agent,
  }));
}


function createWaitingAgents(
  agents: RuntimeAgent[],
): RuntimeAgent[] {
  return agents.map((agent) => ({
    ...agent,
    status: "waiting",
    output: undefined,
    error: undefined,
  }));
}


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


function formatHistoryTime(
  value: string,
): string {
  const date = new Date(
    normalizeDateValue(value),
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function createHistoryTitle(
  input: string,
): string {
  const normalizedInput = input
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedInput.length <= 42) {
    return normalizedInput;
  }

  return `${normalizedInput.slice(0, 42)}…`;
}


function mapHistoryStatus(
  status: string,
): RuntimeAgentStatus {
  switch (status) {
    case "completed":
      return "completed";

    case "failed":
      return "failed";

    case "running":
      return "running";

    default:
      return "waiting";
  }
}


function PlainTextMessage({
  content,
}: {
  content: string;
}) {
  const lines = content
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const firstContentIndex =
    lines.findIndex(
      (line) => line.trim().length > 0,
    );

  return (
    <div className="break-words text-[15px] leading-7 text-[#25292E]">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();

        if (!line) {
          return (
            <div
              key={`blank-${index}`}
              className="h-3"
              aria-hidden
            />
          );
        }

        const nextLine =
          lines[index + 1]?.trim() ?? "";

        const isMainTitle =
          index === firstContentIndex &&
          nextLine.length === 0 &&
          !line.endsWith(":") &&
          line.length <= 120;

        if (isMainTitle) {
          return (
            <h2
              key={`title-${index}`}
              className="mb-1 text-[20px] font-semibold tracking-[-0.02em] text-[#20252A]"
            >
              {line}
            </h2>
          );
        }

        const isSectionTitle =
          line.endsWith(":") &&
          line.length <= 100 &&
          !/^\d+[.)]\s/.test(line);

        if (isSectionTitle) {
          return (
            <h3
              key={`section-${index}`}
              className="mb-1 mt-2 text-[15px] font-semibold text-[#20252A]"
            >
              {line}
            </h3>
          );
        }

        const numberedItem =
          line.match(/^(\d+)[.)]\s+(.+)$/);

        if (numberedItem) {
          return (
            <div
              key={`number-${index}`}
              className="mb-1 flex items-start gap-2"
            >
              <span className="min-w-5 shrink-0 font-semibold text-[#59636C]">
                {numberedItem[1]}.
              </span>

              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                {numberedItem[2]}
              </span>
            </div>
          );
        }

        const bulletItem =
          line.match(/^[•●▪-]\s+(.+)$/);

        if (bulletItem) {
          return (
            <div
              key={`bullet-${index}`}
              className="mb-1 flex items-start gap-2"
            >
              <span
                className="shrink-0 font-semibold text-[#59636C]"
                aria-hidden
              >
                •
              </span>

              <span className="min-w-0 flex-1 whitespace-pre-wrap">
                {bulletItem[1]}
              </span>
            </div>
          );
        }

        const labelledLine =
          line.match(/^([^:：]{1,50})[:：]\s+(.+)$/);

        if (labelledLine) {
          return (
            <p
              key={`label-${index}`}
              className="mb-1 whitespace-pre-wrap"
            >
              <span className="font-semibold text-[#20252A]">
                {labelledLine[1]}:
              </span>{" "}
              {labelledLine[2]}
            </p>
          );
        }

        return (
          <p
            key={`paragraph-${index}`}
            className="mb-1 whitespace-pre-wrap"
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}



export function WorkflowRuntimePage() {
  const router = useRouter();

  const params = useParams<{
    workflowId: string;
  }>();

  const workflowId = Number(
    params.workflowId,
  );

  const [workflow, setWorkflow] =
    useState<WorkflowDetailsResponse | null>(
      null,
    );

  const [agents, setAgents] =
    useState<RuntimeAgent[]>([]);

  const [messages, setMessages] =
    useState<RuntimeMessage[]>([]);

  const [toolResults, setToolResults] =
    useState<RuntimeToolResult[]>([]);

  const [uploadedFiles, setUploadedFiles] =
    useState<UploadedWorkflowFile[]>([]);

  const [uploadingFile, setUploadingFile] =
    useState(false);

  const [artifacts, setArtifacts] =
    useState<RuntimeArtifact[]>([]);

  const [historyItems, setHistoryItems] =
    useState<WorkflowHistoryItem[]>([]);

  const [
    selectedHistoryId,
    setSelectedHistoryId,
  ] = useState<number | null>(null);

  const [
    historyCollapsed,
    setHistoryCollapsed,
  ] = useState(false);

  const [
    historyLoading,
    setHistoryLoading,
  ] = useState(false);

  const [
    historyDetailLoading,
    setHistoryDetailLoading,
  ] = useState(false);

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [isRunning, setIsRunning] =
    useState(false);

  const [triggerUpdating, setTriggerUpdating] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const scrollRef =
    useRef<HTMLDivElement>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const agentsRef =
    useRef<RuntimeAgent[]>([]);

  const latestHistoryRef =
    useRef<{
      id: number;
      status: string;
    } | null>(null);


  const scrollToBottom =
    useCallback((): void => {
      window.requestAnimationFrame(() => {
        const container =
          scrollRef.current;

        if (!container) {
          return;
        }

        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      });
    }, []);


  const loadHistory =
    useCallback(async (): Promise<void> => {
      if (
        !Number.isInteger(workflowId) ||
        workflowId <= 0
      ) {
        return;
      }

      try {
        setHistoryLoading(true);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}/runs`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowHistoryListResponse
          | ErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load workflow history.",
          );
        }

        const historyData =
          data as WorkflowHistoryListResponse;

        const nextHistoryItems =
          historyData.runs ?? [];

        setHistoryItems(
          nextHistoryItems,
        );

        const latestHistoryItem =
          nextHistoryItems[0];

        latestHistoryRef.current =
          latestHistoryItem
            ? {
                id: latestHistoryItem.id,
                status:
                  latestHistoryItem.status,
              }
            : null;
      } catch (historyError) {
        setError(
          historyError instanceof Error
            ? historyError.message
            : "Unable to load workflow history.",
        );
      } finally {
        setHistoryLoading(false);
      }
    }, [workflowId]);


  useEffect(() => {
    let active = true;

    async function loadWorkflow(): Promise<void> {
      if (
        !Number.isInteger(workflowId) ||
        workflowId <= 0
      ) {
        setError("Invalid workflow ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}`,
          {
            credentials: "include",
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowDetailsResponse
          | ErrorResponse
          | null;

        if (!response.ok) {
          const errorData =
            data as ErrorResponse | null;

          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              "Unable to load workflow.",
          );
        }

        if (!active) {
          return;
        }

        const workflowData =
          data as WorkflowDetailsResponse;

        const orderedAgents =
          workflowData.agents
            .slice()
            .sort(
              (
                firstAgent,
                secondAgent,
              ) =>
                firstAgent.order -
                secondAgent.order,
            );

        const runtimeAgents =
          orderedAgents.map(
            (agent): RuntimeAgent => ({
              id: agent.id,
              name: agent.name,
              role: agent.role,
              description:
                agent.description,
              order: agent.order,
              status: "waiting",
              output: undefined,
              error: undefined,
            }),
          );

        setWorkflow({
          ...workflowData,
          agents: orderedAgents,
        });

        agentsRef.current =
          cloneAgents(runtimeAgents);

        setAgents(
          cloneAgents(runtimeAgents),
        );
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load workflow.",
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      active = false;
    };
  }, [workflowId]);


  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);


  useEffect(() => {
    scrollToBottom();
  }, [
    messages,
    isRunning,
    scrollToBottom,
  ]);


  function replaceAgents(
    nextAgents: RuntimeAgent[],
  ): void {
    agentsRef.current =
      cloneAgents(nextAgents);

    setAgents(
      cloneAgents(nextAgents),
    );
  }


  function updateAgent(
    agentId: number,
    patch: Partial<RuntimeAgent>,
  ): void {
    const nextAgents =
      agentsRef.current.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              ...patch,
            }
          : agent,
      );

    replaceAgents(nextAgents);
  }


  function updateToolResult(
    toolId: string,
    nextResult: RuntimeToolResult,
  ): void {
    setToolResults(
      (previousResults) => {
        const existingIndex =
          previousResults.findIndex(
            (item) =>
              item.id === toolId,
          );

        if (existingIndex === -1) {
          return [
            ...previousResults,
            nextResult,
          ];
        }

        return previousResults.map(
          (item, index) =>
            index === existingIndex
              ? {
                  ...item,
                  ...nextResult,
                }
              : item,
        );
      },
    );
  }


  function resetAgentStates(): void {
    replaceAgents(
      createWaitingAgents(
        agentsRef.current,
      ),
    );
  }


  function startNewChat(): void {
    if (isRunning) {
      return;
    }

    setMessages([]);
    setToolResults([]);
    setUploadedFiles([]);
    setArtifacts([]);
    setInput("");
    setError(null);
    setSelectedHistoryId(null);

    resetAgentStates();

    if (textareaRef.current) {
      textareaRef.current.style.height =
        "auto";

      textareaRef.current.focus();
    }
  }


  async function selectHistoryItem(
    historyItem: WorkflowHistoryItem,
  ): Promise<void> {
    if (
      isRunning ||
      historyDetailLoading
    ) {
      return;
    }

    try {
      setError(null);
      setHistoryDetailLoading(true);
      setSelectedHistoryId(
        historyItem.id,
      );

      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowId}/runs/${historyItem.id}`,
        {
          credentials: "include",
        },
      );

      const data = (await response
        .json()
        .catch(() => null)) as
        | WorkflowHistoryDetail
        | ErrorResponse
        | null;

      if (!response.ok) {
        const errorData =
          data as ErrorResponse | null;

        throw new Error(
          errorData?.detail ??
            errorData?.message ??
            "Unable to load workflow history.",
        );
      }

      const detail =
        data as WorkflowHistoryDetail;

      const restoredMessages:
        RuntimeMessage[] = [
          {
            id: `${detail.id}-user`,
            role: "user",
            content: detail.input,
          },
        ];

      const responseContent =
        detail.final_output.trim() ||
        detail.error.trim();

      if (responseContent) {
        restoredMessages.push({
          id: `${detail.id}-workflow`,
          role: "workflow",
          content: responseContent,
        });
      }

      setMessages(restoredMessages);
      setArtifacts(detail.artifacts ?? []);
      setUploadedFiles([]);

      /*
       * Start with the current workflow agents so that a failed or
       * incomplete run still displays all workflow nodes.
       */
      const restoredAgents =
        createWaitingAgents(
          agentsRef.current,
        );

      for (
        const historyStep
        of detail.agents
      ) {
        const matchingIndex =
          restoredAgents.findIndex(
            (agent) =>
              (
                historyStep.agent_id !==
                  null &&
                agent.id ===
                  historyStep.agent_id
              ) ||
              agent.order ===
                historyStep.order,
          );

        const restoredAgent:
          RuntimeAgent = {
            id:
              historyStep.agent_id ??
              historyStep.id,
            name: historyStep.name,
            role: historyStep.role,
            description:
              historyStep.description,
            order: historyStep.order,
            status: mapHistoryStatus(
              historyStep.status,
            ),
            output:
              historyStep.output ||
              undefined,
            error:
              historyStep.error ||
              undefined,
          };

        if (matchingIndex >= 0) {
          restoredAgents[
            matchingIndex
          ] = {
            ...restoredAgents[
              matchingIndex
            ],
            ...restoredAgent,
          };
        } else {
          restoredAgents.push(
            restoredAgent,
          );
        }
      }

      restoredAgents.sort(
        (firstAgent, secondAgent) =>
          firstAgent.order -
          secondAgent.order,
      );

      replaceAgents(restoredAgents);
      scrollToBottom();
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Unable to load workflow history.",
      );
    } finally {
      setHistoryDetailLoading(false);
    }
  }


  useEffect(() => {
    if (
      !workflow?.trigger?.listening ||
      !Number.isInteger(workflowId) ||
      workflowId <= 0
    ) {
      return;
    }

    let active = true;
    let requestInProgress = false;

    async function pollHistory(): Promise<void> {
      if (
        requestInProgress ||
        isRunning ||
        historyDetailLoading
      ) {
        return;
      }

      requestInProgress = true;

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflowId}/runs`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );

        if (!response.ok) {
          return;
        }

        const data = (await response
          .json()
          .catch(() => null)) as
          | WorkflowHistoryListResponse
          | null;

        if (!active || !data) {
          return;
        }

        const nextHistoryItems =
          data.runs ?? [];

        setHistoryItems(
          nextHistoryItems,
        );

        const latestHistoryItem =
          nextHistoryItems[0];

        if (!latestHistoryItem) {
          latestHistoryRef.current =
            null;
          return;
        }

        const previousLatest =
          latestHistoryRef.current;

        const isNewRun =
          previousLatest !== null &&
          latestHistoryItem.id !==
            previousLatest.id;

        const justFinished =
          previousLatest !== null &&
          latestHistoryItem.id ===
            previousLatest.id &&
          previousLatest.status ===
            "running" &&
          latestHistoryItem.status !==
            "running";

        latestHistoryRef.current = {
          id: latestHistoryItem.id,
          status:
            latestHistoryItem.status,
        };

        if (
          (isNewRun || justFinished) &&
          latestHistoryItem.status !==
            "running"
        ) {
          await selectHistoryItem(
            latestHistoryItem,
          );
        }
      } catch (pollError) {
        console.warn(
          "Unable to refresh workflow history:",
          pollError,
        );
      } finally {
        requestInProgress = false;
      }
    }

    const intervalId =
      window.setInterval(() => {
        void pollHistory();
      }, 3000);

    return () => {
      active = false;
      window.clearInterval(
        intervalId,
      );
    };
    // selectHistoryItem intentionally uses the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workflow?.trigger?.listening,
    workflowId,
    isRunning,
    historyDetailLoading,
  ]);


  async function deleteHistoryItem(
    event: MouseEvent<HTMLButtonElement>,
    historyId: number,
  ): Promise<void> {
    event.stopPropagation();

    if (isRunning) {
      return;
    }

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowId}/runs/${historyId}`,
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
            "Unable to delete workflow history.",
        );
      }

      setHistoryItems(
        (previousItems) =>
          previousItems.filter(
            (item) =>
              item.id !== historyId,
          ),
      );

      if (
        selectedHistoryId === historyId
      ) {
        startNewChat();
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete workflow history.",
      );
    }
  }


  async function clearAllHistory(): Promise<void> {
    if (isRunning) {
      return;
    }

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflowId}/runs`,
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
            "Unable to clear workflow history.",
        );
      }

      setHistoryItems([]);
      startNewChat();
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Unable to clear workflow history.",
      );
    }
  }


  function handleRuntimeEvent(
    event: RuntimeEvent,
  ): void {
    if (event.type === "tool_started") {
      const toolId =
        createToolResultId(event);

      updateToolResult(
        toolId,
        {
          id: toolId,
          bindingId:
            event.binding_id,
          provider:
            event.provider ??
            "gmail",
          action:
            event.action ??
            "create_draft",
          agentId:
            event.agent_id,
          agentName:
            event.agent_name,
          status: "running",
          accountEmail:
            event.account_email,
          recipient:
            event.to,
          sender:
            event.from,
          subject:
            event.subject,
          draftId:
            event.draft_id,
          messageId:
            event.message_id,
          threadId:
            event.thread_id,
          eventCount:
            event.event_count,
          rangeStart:
            event.range_start,
          rangeEnd:
            event.range_end,
          searchQuery:
            event.search_query,
          eventId:
            event.event_id,
          eventTitle:
            event.title,
          eventStart:
            event.start,
          eventEnd:
            event.end,
          eventLocation:
            event.location,
          eventLink:
            event.html_link,
          conflictCount:
            event.conflict_count,
          cancelled:
            event.cancelled,
          error: undefined,
        },
      );

      return;
    }

    if (event.type === "tool_completed") {
      const toolId =
        createToolResultId(event);

      updateToolResult(
        toolId,
        {
          id: toolId,
          bindingId:
            event.binding_id,
          provider:
            event.provider ??
            "gmail",
          action:
            event.action ??
            "create_draft",
          agentId:
            event.agent_id,
          agentName:
            event.agent_name,
          status: "completed",
          accountEmail:
            event.account_email,
          recipient:
            event.to,
          sender:
            event.from,
          subject:
            event.subject,
          draftId:
            event.draft_id,
          messageId:
            event.message_id,
          threadId:
            event.thread_id,
          eventCount:
            event.event_count,
          rangeStart:
            event.range_start,
          rangeEnd:
            event.range_end,
          searchQuery:
            event.search_query,
          eventId:
            event.event_id,
          eventTitle:
            event.title,
          eventStart:
            event.start,
          eventEnd:
            event.end,
          eventLocation:
            event.location,
          eventLink:
            event.html_link,
          conflictCount:
            event.conflict_count,
          cancelled:
            event.cancelled,
          error: undefined,
        },
      );

      return;
    }

    if (event.type === "tool_failed") {
      const toolId =
        createToolResultId(event);

      updateToolResult(
        toolId,
        {
          id: toolId,
          bindingId:
            event.binding_id,
          provider:
            event.provider ??
            "gmail",
          action:
            event.action ??
            "create_draft",
          agentId:
            event.agent_id,
          agentName:
            event.agent_name,
          status: "failed",
          accountEmail:
            event.account_email,
          recipient:
            event.to,
          sender:
            event.from,
          subject:
            event.subject,
          draftId:
            event.draft_id,
          messageId:
            event.message_id,
          threadId:
            event.thread_id,
          eventCount:
            event.event_count,
          rangeStart:
            event.range_start,
          rangeEnd:
            event.range_end,
          searchQuery:
            event.search_query,
          eventId:
            event.event_id,
          eventTitle:
            event.title,
          eventStart:
            event.start,
          eventEnd:
            event.end,
          eventLocation:
            event.location,
          eventLink:
            event.html_link,
          conflictCount:
            event.conflict_count,
          cancelled:
            event.cancelled,
          error:
            event.error ??
            "Tool execution failed.",
        },
      );

      return;
    }

    if (
      event.type === "agent_started" &&
      typeof event.agent_id ===
        "number"
    ) {
      updateAgent(event.agent_id, {
        status: "running",
        output: undefined,
        error: undefined,
      });

      return;
    }

    if (
      event.type ===
        "agent_completed" &&
      typeof event.agent_id ===
        "number"
    ) {
      updateAgent(event.agent_id, {
        status: "completed",
        output: event.output ?? "",
        error: undefined,
      });

      return;
    }

    if (
      event.type === "agent_failed" &&
      typeof event.agent_id ===
        "number"
    ) {
      updateAgent(event.agent_id, {
        status: "failed",
        error:
          event.error ??
          "Agent execution failed.",
      });

      return;
    }

    if (
      event.type ===
        "workflow_completed"
    ) {
      const finalOutput =
        event.final_output?.trim() ??
        "";

      if (!finalOutput) {
        setError(
          "The workflow completed but returned an empty final result.",
        );

        return;
      }

      setMessages(
        (previousMessages) => [
          ...previousMessages,
          {
            id: createId(),
            role: "workflow",
            content: finalOutput,
          },
        ],
      );

      setArtifacts(event.artifacts ?? []);

      if (event.artifact_error) {
        setError(
          `The workflow completed, but one or more files could not be generated: ${event.artifact_error}`,
        );
      }

      if (
        typeof event.run_id ===
        "number"
      ) {
        setSelectedHistoryId(
          event.run_id,
        );
      }

      void loadHistory();

      return;
    }

    if (
      event.type ===
        "workflow_failed"
    ) {
      setError(
        event.error ??
          "Workflow execution failed.",
      );

      if (
        typeof event.run_id ===
        "number"
      ) {
        setSelectedHistoryId(
          event.run_id,
        );
      }

      void loadHistory();
    }
  }


  function processSseLine(
    line: string,
  ): void {
    const trimmedLine =
      line.trim();

    if (
      !trimmedLine ||
      trimmedLine.startsWith(":") ||
      !trimmedLine.startsWith(
        "data:",
      )
    ) {
      return;
    }

    const rawData =
      trimmedLine.slice(5).trim();

    if (
      !rawData ||
      rawData === "[DONE]"
    ) {
      return;
    }

    try {
      const event = JSON.parse(
        rawData,
      ) as RuntimeEvent;

      handleRuntimeEvent(event);
    } catch (parseError) {
      console.warn(
        "Unable to parse workflow runtime event:",
        rawData,
        parseError,
      );
    }
  }


  async function runWorkflow(): Promise<void> {
    const userMessage =
      input.trim();

    if (
      (!userMessage && uploadedFiles.length === 0) ||
      isRunning ||
      !workflow
    ) {
      return;
    }

    const filesForRun = [...uploadedFiles];
    const visibleInput = userMessage ||
      `Uploaded files: ${filesForRun
        .map((file) => file.filename)
        .join(", ")}`;

    setInput("");
    setError(null);
    setIsRunning(true);
    setSelectedHistoryId(null);
    setToolResults([]);
    setArtifacts([]);

    resetAgentStates();

    setMessages([
      {
        id: createId(),
        role: "user",
        content: visibleInput,
      },
    ]);

    if (textareaRef.current) {
      textareaRef.current.style.height =
        "auto";
    }

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflow.id}/run`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          credentials: "include",

          body: JSON.stringify({
            message: userMessage,
            file_ids: filesForRun.map((file) => file.id),
          }),
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
            `Workflow execution failed with status ${response.status}.`,
        );
      }

      if (!response.body) {
        throw new Error(
          "The server returned an empty response.",
        );
      }

      setUploadedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let buffer = "";

      while (true) {
        const { value, done } =
          await reader.read();

        if (value) {
          buffer += decoder.decode(
            value,
            {
              stream: !done,
            },
          );
        }

        const lines =
          buffer.split(/\r?\n/);

        buffer =
          lines.pop() ?? "";

        for (const line of lines) {
          processSseLine(line);
        }

        if (done) {
          break;
        }
      }

      if (buffer.trim()) {
        processSseLine(buffer);
      }
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Unable to run workflow.",
      );

      void loadHistory();
    } finally {
      setIsRunning(false);
      textareaRef.current?.focus();
    }
  }


  async function setGmailListening(
    listening: boolean,
  ): Promise<void> {
    if (!workflow || triggerUpdating) {
      return;
    }

    try {
      setTriggerUpdating(true);
      setError(null);

      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflow.id}/trigger/listening`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ listening }),
        },
      );

      const data = (await response.json().catch(() => null)) as
        | { listening?: boolean; detail?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.detail ??
            data?.message ??
            "Unable to update Gmail listening.",
        );
      }

      setWorkflow((current) =>
        current
          ? {
              ...current,
              trigger: current.trigger
                ? { ...current.trigger, listening }
                : current.trigger,
            }
          : current,
      );
    } catch (triggerError) {
      setError(
        triggerError instanceof Error
          ? triggerError.message
          : "Unable to update Gmail listening.",
      );
    } finally {
      setTriggerUpdating(false);
    }
  }


  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    if (!workflow || uploadingFile || isRunning) {
      return;
    }

    const selectedFiles = Array.from(
      event.target.files ?? [],
    );

    if (selectedFiles.length === 0) {
      return;
    }

    const capability =
      workflow.input_capabilities.file_upload;

    const unsupportedFile =
      selectedFiles.find((selectedFile) => {
        const extension =
          getFileExtension(selectedFile.name);

        return !capability.accepted_formats.includes(
          extension as "docx" | "pdf",
        );
      });

    if (unsupportedFile) {
      setError(
        `Unsupported file type: ${unsupportedFile.name}. ` +
          `Allowed formats: ${capability.accepted_formats
            .map((format) => format.toUpperCase())
            .join(", ")}. ` +
          "Legacy .doc files are not supported; save them as .docx first.",
      );
      event.target.value = "";
      return;
    }

    if (!capability.multiple && uploadedFiles.length > 0) {
      setError("Remove the current file before uploading another one.");
      event.target.value = "";
      return;
    }

    const availableSlots = Math.max(
      0,
      capability.max_files - uploadedFiles.length,
    );

    if (selectedFiles.length > availableSlots) {
      setError(
        `This workflow accepts at most ${capability.max_files} file(s).`,
      );
      event.target.value = "";
      return;
    }

    try {
      setUploadingFile(true);
      setError(null);

      const uploadedResults: UploadedWorkflowFile[] = [];

      for (const selectedFile of selectedFiles) {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${workflow.id}/files`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | UploadedWorkflowFile
          | ErrorResponse
          | null;

        if (!response.ok) {
          const errorData = data as ErrorResponse | null;
          throw new Error(
            errorData?.detail ??
              errorData?.message ??
              `Unable to upload ${selectedFile.name}.`,
          );
        }

        uploadedResults.push(
          data as UploadedWorkflowFile,
        );
      }

      setUploadedFiles((previousFiles) => [
        ...previousFiles,
        ...uploadedResults,
      ]);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload the selected file.",
      );
    } finally {
      setUploadingFile(false);
      event.target.value = "";
    }
  }


  async function removeUploadedFile(
    fileId: number,
  ): Promise<void> {
    if (!workflow || isRunning) {
      return;
    }

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/${workflow.id}/files/${fileId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => null)) as ErrorResponse | null;

        throw new Error(
          data?.detail ??
            data?.message ??
            "Unable to remove the uploaded file.",
        );
      }

      setUploadedFiles((previousFiles) =>
        previousFiles.filter((file) => file.id !== fileId),
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove the uploaded file.",
      );
    }
  }


  async function downloadArtifact(
    artifact: RuntimeArtifact,
  ): Promise<void> {
    try {
      setError(null);

      const response = await fetch(
        `${getApiBaseUrl()}${artifact.download_url}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => null)) as ErrorResponse | null;
        throw new Error(
          data?.detail ??
            data?.message ??
            "Unable to download the generated file.",
        );
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = artifact.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download the generated file.",
      );
    }
  }


  function handleInputChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    setInput(event.target.value);

    event.target.style.height =
      "auto";

    event.target.style.height = `${Math.min(
      event.target.scrollHeight,
      180,
    )}px`;
  }


  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();

      void runWorkflow();
    }
  }


  const activeAgent =
    agents.find(
      (agent) =>
        agent.status === "running",
    ) ?? null;


  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

          <p className="mt-4 text-[15px] text-[#73757A]">
            Loading workflow...
          </p>
        </div>
      </div>
    );
  }


  if (error && !workflow) {
    return (
      <div className="mx-auto max-w-[760px] py-8">
        <button
          type="button"
          onClick={() => {
            router.push("/app/chat");
          }}
          className="flex items-center gap-2 text-[14px] font-semibold text-[#3569B8]"
        >
          <ArrowLeft
            className="size-4"
            aria-hidden
          />

          Back to Workflow Selection
        </button>

        <div className="mt-8 rounded-xl border border-[#F0C9AB] bg-[#FFF3EC] px-5 py-4 text-[14px] font-medium text-[#D95117]">
          {error}
        </div>
      </div>
    );
  }


  if (!workflow) {
    return null;
  }


  return (
    <section className="flex h-[calc(100vh-64px)] min-h-[640px] overflow-hidden bg-white">
      <aside
        className={[
          "relative z-50 flex shrink-0 flex-col border-r border-[#E1E6EB] bg-[#F8FAFC] transition-[width] duration-200",
          historyCollapsed
            ? "w-[58px]"
            : "w-[270px]",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-[72px] shrink-0 items-center border-b border-[#E1E6EB]",
            historyCollapsed
              ? "justify-center px-2"
              : "justify-between px-4",
          ].join(" ")}
        >
          {historyCollapsed ? (
            <History
              className="size-5 text-[#59636C]"
              aria-hidden
            />
          ) : (
            <div className="flex items-center gap-2">
              <History
                className="size-4 text-[#59636C]"
                aria-hidden
              />

              <h2 className="text-[14px] font-semibold text-[#30343A]">
                History
              </h2>
            </div>
          )}

          {!historyCollapsed ? (
            <button
              type="button"
              onClick={() => {
                setHistoryCollapsed(
                  true,
                );
              }}
              className="flex size-8 items-center justify-center rounded-lg text-[#737C84] transition hover:bg-[#E9EDF1] hover:text-[#202126]"
              aria-label="Collapse history"
            >
              <ChevronLeft
                className="size-4"
                aria-hidden
              />
            </button>
          ) : null}
        </div>

        {historyCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setHistoryCollapsed(
                  false,
                );
              }}
              className="flex size-9 items-center justify-center rounded-lg text-[#66717A] transition hover:bg-[#E9EDF1] hover:text-[#202126]"
              aria-label="Open history"
            >
              <ChevronRight
                className="size-4"
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={startNewChat}
              disabled={isRunning}
              className="flex size-9 items-center justify-center rounded-lg bg-[#3569B8] text-white transition hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="New chat"
            >
              <MessageSquarePlus
                className="size-4"
                aria-hidden
              />
            </button>
          </div>
        ) : (
          <>
            <div className="shrink-0 p-3">
              <button
                type="button"
                onClick={startNewChat}
                disabled={isRunning}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3569B8] px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MessageSquarePlus
                  className="size-4"
                  aria-hidden
                />

                New chat
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {historyLoading ? (
                <div className="px-2 py-8 text-center">
                  <div className="mx-auto size-5 animate-spin rounded-full border-2 border-[#D5DEE9] border-t-[#3569B8]" />

                  <p className="mt-3 text-[12px] text-[#8A9299]">
                    Loading history...
                  </p>
                </div>
              ) : historyItems.length ===
                0 ? (
                <div className="px-2 py-8 text-center">
                  <Clock3
                    className="mx-auto size-5 text-[#A0A8AF]"
                    aria-hidden
                  />

                  <p className="mt-3 text-[12px] leading-5 text-[#8A9299]">
                    Completed workflow runs will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {historyItems.map(
                    (historyItem) => (
                      <div
                        key={
                          historyItem.id
                        }
                        className={[
                          "group relative rounded-lg transition",
                          selectedHistoryId ===
                          historyItem.id
                            ? "bg-[#E5EEF9]"
                            : "hover:bg-[#EDF1F5]",
                          isRunning
                            ? "opacity-60"
                            : "",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            void selectHistoryItem(
                              historyItem,
                            );
                          }}
                          disabled={
                            isRunning ||
                            historyDetailLoading
                          }
                          className="w-full rounded-lg px-3 py-3 pr-10 text-left disabled:cursor-not-allowed"
                        >
                          <p className="line-clamp-2 text-[13px] font-medium leading-5 text-[#30343A]">
                            {createHistoryTitle(
                              historyItem.input,
                            )}
                          </p>

                          <div className="mt-1.5 flex items-center gap-2">
                            <p className="text-[10px] text-[#8A9299]">
                              {formatHistoryTime(
                                historyItem.created_at,
                              )}
                            </p>

                            {historyItem.status ===
                            "failed" ? (
                              <span className="rounded-full bg-[#FFF0E8] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#D95117]">
                                Failed
                              </span>
                            ) : null}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={(
                            event,
                          ) => {
                            void deleteHistoryItem(
                              event,
                              historyItem.id,
                            );
                          }}
                          disabled={
                            isRunning
                          }
                          className="absolute right-2 top-2 hidden size-7 items-center justify-center rounded-md text-[#8A9299] transition hover:bg-white hover:text-[#D95117] disabled:cursor-not-allowed group-hover:flex"
                          aria-label="Delete history item"
                        >
                          <Trash2
                            className="size-3.5"
                            aria-hidden
                          />
                        </button>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            {historyItems.length > 0 ? (
              <div className="shrink-0 border-t border-[#E1E6EB] p-3">
                <button
                  type="button"
                  onClick={() => {
                    void clearAllHistory();
                  }}
                  disabled={isRunning}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-[#7A838B] transition hover:bg-[#FFF0E8] hover:text-[#D95117] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2
                    className="size-3.5"
                    aria-hidden
                  />

                  Clear history
                </button>
              </div>
            ) : null}
          </>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-40 shrink-0 border-b border-[#E3E7EB] bg-white px-6">
          <div className="mx-auto flex min-h-[72px] max-w-[1040px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  router.push(
                    "/app/chat",
                  );
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#646D75] transition hover:bg-[#F1F3F5] hover:text-[#202126]"
                aria-label="Back to workflow selection"
              >
                <ArrowLeft
                  className="size-5"
                  aria-hidden
                />
              </button>

              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F0FB] text-[#3569B8]">
                <Bot
                  className="size-5"
                  aria-hidden
                />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-[18px] font-semibold text-[#202126]">
                  {workflow.name}
                </h1>

                <p className="mt-0.5 text-[12px] text-[#818990]">
                  {workflow.agents.length}{" "}
                  {workflow.agents.length ===
                  1
                    ? "subagent"
                    : "subagents"}{" "}
                  run automatically in sequence
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {workflow.trigger?.trigger_type ===
              "gmail_new_message" ? (
                <div className="flex items-center gap-2 rounded-lg border border-[#D8DEE5] bg-[#F8FAFC] px-2 py-1.5">
                  <span
                    className={[
                      "size-2 rounded-full",
                      workflow.trigger.listening
                        ? "bg-[#42A66A]"
                        : "bg-[#A7AFB7]",
                    ].join(" ")}
                  />

                  <span className="text-[12px] font-medium text-[#59636C]">
                    {workflow.trigger.listening
                      ? "Gmail Listening"
                      : "Gmail Stopped"}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      void setGmailListening(
                        !workflow.trigger?.listening,
                      );
                    }}
                    disabled={triggerUpdating}
                    className={[
                      "rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60",
                      workflow.trigger.listening
                        ? "bg-[#D95117] hover:bg-[#BF4614]"
                        : "bg-[#3569B8] hover:bg-[#2F5FA8]",
                    ].join(" ")}
                  >
                    {triggerUpdating
                      ? "Updating..."
                      : workflow.trigger.listening
                        ? "Stop Listening"
                        : "Start Listening"}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={startNewChat}
                disabled={isRunning}
                className="inline-flex items-center gap-2 rounded-lg border border-[#D8DEE5] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#4E5963] transition hover:bg-[#F6F8FA] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw
                  className="size-3.5"
                  aria-hidden
                />

                New chat
              </button>
            </div>
          </div>
        </header>

        <WorkflowExecutionGraph
          agents={agents}
        />

        <main
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto bg-white"
        >
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-[760px] items-center justify-center px-6 py-16">
              <div className="w-full text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#E8F0FB] text-[#3569B8]">
                  <Sparkles
                    className="size-6"
                    aria-hidden
                  />
                </div>

                <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-[#202126]">
                  What should this workflow do?
                </h2>

                <p className="mx-auto mt-3 max-w-[540px] text-[15px] leading-7 text-[#737A81]">
                  Enter one task. The workflow will pass each
                  subagent&apos;s response to the next subagent and
                  return only the final result here.
                </p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[820px] px-6 py-10">
              <div className="space-y-10">
                {messages.map(
                  (chatMessage) => (
                    <article
                      key={
                        chatMessage.id
                      }
                      className={
                        chatMessage.role ===
                        "user"
                          ? "flex justify-end"
                          : "flex justify-start"
                      }
                    >
                      {chatMessage.role ===
                      "user" ? (
                        <div className="max-w-[76%] rounded-[22px] rounded-br-md bg-[#E9EDF1] px-5 py-3.5 text-[15px] leading-7 text-[#25292E]">
                          <p className="whitespace-pre-wrap">
                            {
                              chatMessage.content
                            }
                          </p>
                        </div>
                      ) : (
                        <div className="flex w-full items-start gap-4">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[#3569B8]">
                            <Bot
                              className="size-4"
                              aria-hidden
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="mb-3 text-[12px] font-semibold text-[#6F7880]">
                              {workflow.name}
                            </p>

                            <div className="text-[#25292E]">
                              <PlainTextMessage
                                content={
                                  chatMessage.content
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  ),
                )}

                {toolResults.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A9299]">
                      Tools
                    </p>

                    {toolResults.map(
                      (toolResult) => (
                        <div
                          key={toolResult.id}
                          className={[
                            "rounded-xl border px-4 py-3",
                            toolResult.status ===
                            "completed"
                              ? "border-[#BFDCCB] bg-[#F3FAF6]"
                              : toolResult.status ===
                                  "failed"
                                ? "border-[#F0C9AB] bg-[#FFF3EC]"
                                : "border-[#D7E2F0] bg-[#F5F8FC]",
                          ].join(" ")}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={[
                                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                                toolResult.status ===
                                "completed"
                                  ? "bg-[#DFF2E6] text-[#2F7D4A]"
                                  : toolResult.status ===
                                      "failed"
                                    ? "bg-[#FFE5D5] text-[#D95117]"
                                    : "bg-[#E5EEF9] text-[#3569B8]",
                              ].join(" ")}
                            >
                              {toolResult.status ===
                              "completed" ? (
                                <CheckCircle2
                                  className="size-4"
                                  aria-hidden
                                />
                              ) : toolResult.status ===
                                "failed" ? (
                                <XCircle
                                  className="size-4"
                                  aria-hidden
                                />
                              ) : toolResult.provider ===
                                "google_calendar" ? (
                                <CalendarDays
                                  className="size-4"
                                  aria-hidden
                                />
                              ) : (
                                <Mail
                                  className="size-4"
                                  aria-hidden
                                />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-[14px] font-semibold text-[#30343A]">
                                    {getToolDisplayName(
                                      toolResult.action,
                                    )}
                                  </p>

                                  {toolResult.agentName ? (
                                    <p className="mt-0.5 text-[11px] text-[#8A9299]">
                                      Bound to{" "}
                                      {toolResult.agentName}
                                    </p>
                                  ) : null}
                                </div>

                                <span
                                  className={[
                                    "rounded-full px-2 py-1 text-[10px] font-semibold uppercase",
                                    toolResult.status ===
                                    "completed"
                                      ? "bg-[#DFF2E6] text-[#2F7D4A]"
                                      : toolResult.status ===
                                          "failed"
                                        ? "bg-[#FFE5D5] text-[#D95117]"
                                        : "bg-[#E5EEF9] text-[#3569B8]",
                                  ].join(" ")}
                                >
                                  {toolResult.status}
                                </span>
                              </div>

                              {toolResult.status ===
                              "running" ? (
                                <p className="mt-2 text-[13px] text-[#59636C]">
                                  {getToolRunningText(
                                    toolResult.action,
                                  )}
                                </p>
                              ) : null}

                              {toolResult.status ===
                                "completed" ? (
                                <div className="mt-2 space-y-1 text-[12px] leading-5 text-[#59636C]">
                                  <p>
                                    {toolResult.action ===
                                    "read_message"
                                      ? "Gmail message read successfully."
                                      : toolResult.action ===
                                          "send_reply"
                                        ? "Gmail reply sent successfully."
                                        : toolResult.action ===
                                            "read_events"
                                          ? "Google Calendar events read successfully."
                                          : toolResult.action ===
                                              "create_event"
                                            ? "Google Calendar event created successfully."
                                            : toolResult.action ===
                                                "cancel_event"
                                              ? "Google Calendar event cancelled successfully."
                                              : "Draft created successfully."}
                                  </p>

                                  {toolResult.action ===
                                    "read_message" &&
                                  toolResult.sender ? (
                                    <p>
                                      From:{" "}
                                      {toolResult.sender}
                                    </p>
                                  ) : null}

                                  {(toolResult.action ===
                                    "create_draft" ||
                                    toolResult.action ===
                                      "send_reply") &&
                                  toolResult.recipient ? (
                                    <p>
                                      Recipient:{" "}
                                      {toolResult.recipient}
                                    </p>
                                  ) : null}

                                  {toolResult.subject ? (
                                    <p>
                                      Subject:{" "}
                                      {toolResult.subject}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "read_message" &&
                                  toolResult.messageId ? (
                                    <p>
                                      Message ID:{" "}
                                      {toolResult.messageId}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "send_reply" &&
                                  toolResult.messageId ? (
                                    <p>
                                      Sent message ID:{" "}
                                      {toolResult.messageId}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "send_reply" &&
                                  toolResult.threadId ? (
                                    <p>
                                      Thread ID:{" "}
                                      {toolResult.threadId}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "read_events" &&
                                  typeof toolResult.eventCount ===
                                    "number" ? (
                                    <p>
                                      Events found:{" "}
                                      {toolResult.eventCount}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "read_events" &&
                                  toolResult.rangeStart ? (
                                    <p>
                                      Range start:{" "}
                                      {formatHistoryTime(
                                        toolResult.rangeStart,
                                      )}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "read_events" &&
                                  toolResult.rangeEnd ? (
                                    <p>
                                      Range end:{" "}
                                      {formatHistoryTime(
                                        toolResult.rangeEnd,
                                      )}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "read_events" &&
                                  toolResult.searchQuery ? (
                                    <p>
                                      Title query:{" "}
                                      {toolResult.searchQuery}
                                    </p>
                                  ) : null}

                                  {(toolResult.action ===
                                    "create_event" ||
                                    toolResult.action ===
                                      "cancel_event") &&
                                  toolResult.eventTitle ? (
                                    <p>
                                      Event: {" "}
                                      {toolResult.eventTitle}
                                    </p>
                                  ) : null}

                                  {(toolResult.action ===
                                    "create_event" ||
                                    toolResult.action ===
                                      "cancel_event") &&
                                  toolResult.eventStart ? (
                                    <p>
                                      Start: {" "}
                                      {formatHistoryTime(
                                        toolResult.eventStart,
                                      )}
                                    </p>
                                  ) : null}

                                  {(toolResult.action ===
                                    "create_event" ||
                                    toolResult.action ===
                                      "cancel_event") &&
                                  toolResult.eventEnd ? (
                                    <p>
                                      End: {" "}
                                      {formatHistoryTime(
                                        toolResult.eventEnd,
                                      )}
                                    </p>
                                  ) : null}

                                  {(toolResult.action ===
                                    "create_event" ||
                                    toolResult.action ===
                                      "cancel_event") &&
                                  toolResult.eventLocation ? (
                                    <p>
                                      Location: {" "}
                                      {toolResult.eventLocation}
                                    </p>
                                  ) : null}

                                  {(toolResult.action ===
                                    "create_event" ||
                                    toolResult.action ===
                                      "cancel_event") &&
                                  toolResult.eventId ? (
                                    <p>
                                      Event ID: {" "}
                                      {toolResult.eventId}
                                    </p>
                                  ) : null}

                                  {toolResult.action ===
                                    "create_event" &&
                                  typeof toolResult.conflictCount ===
                                    "number" ? (
                                    <p>
                                      Existing overlaps found: {" "}
                                      {toolResult.conflictCount}
                                    </p>
                                  ) : null}

                                  {toolResult.eventLink ? (
                                    <p>
                                      <a
                                        href={toolResult.eventLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-semibold text-[#3569B8] underline underline-offset-2"
                                      >
                                        Open in Google Calendar
                                      </a>
                                    </p>
                                  ) : null}

                                  {toolResult.accountEmail ? (
                                    <p>
                                      Google account:{" "}
                                      {toolResult.accountEmail}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}

                              {toolResult.status ===
                                "failed" ? (
                                <p className="mt-2 text-[13px] leading-5 text-[#D95117]">
                                  {toolResult.error ??
                                    "Tool execution failed."}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ) : null}

                {artifacts.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A9299]">
                      Generated files
                    </p>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {artifacts.map((artifact) => (
                        <button
                          key={artifact.id}
                          type="button"
                          onClick={() => {
                            void downloadArtifact(artifact);
                          }}
                          className="flex items-center gap-3 rounded-xl border border-[#D7E2F0] bg-[#F7FAFD] px-4 py-3 text-left transition hover:border-[#9BB9DE] hover:bg-[#EEF5FC]"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#E5EEF9] text-[#3569B8]">
                            <FileText
                              className="size-4"
                              aria-hidden
                            />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-[#30343A]">
                              {artifact.filename}
                            </span>
                            <span className="mt-0.5 block text-[10px] font-semibold uppercase text-[#78838D]">
                              {artifact.artifact_type}
                            </span>
                          </span>

                          <Download
                            className="size-4 shrink-0 text-[#3569B8]"
                            aria-hidden
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {isRunning ? (
                  <div className="flex items-start gap-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FB] text-[#3569B8]">
                      <span className="size-4 animate-spin rounded-full border-2 border-[#9BB9DE] border-t-[#3569B8]" />
                    </div>

                    <div className="pt-1">
                      <p className="text-[14px] font-medium text-[#4E5963]">
                        {activeAgent
                          ? `${activeAgent.name} is working...`
                          : toolResults.some(
                                (toolResult) =>
                                  toolResult.status ===
                                  "running",
                              )
                            ? "Running connected tools..."
                            : "Starting workflow..."}
                      </p>

                      <p className="mt-1 text-[12px] text-[#939AA1]">
                        {toolResults.some(
                          (toolResult) =>
                            toolResult.status ===
                            "running",
                        )
                          ? "The workflow result is being sent to the configured tool."
                          : "The result will automatically pass to the next subagent."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

            </div>
          )}
        </main>

        {error ? (
          <div className="shrink-0 border-t border-[#F0C9AB] bg-[#FFF8F3] px-6 py-3">
            <div className="mx-auto flex max-w-[820px] items-start justify-between gap-4 rounded-lg border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-3">
              <p className="text-[13px] font-medium leading-5 text-[#D95117]">
                {error}
              </p>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                }}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#A96648] transition hover:bg-white hover:text-[#D95117]"
                aria-label="Dismiss error"
              >
                <X
                  className="size-3.5"
                  aria-hidden
                />
              </button>
            </div>
          </div>
        ) : null}

        <footer className="relative z-40 shrink-0 border-t border-[#E3E7EB] bg-white px-6 pb-5 pt-4">
          <div className="mx-auto max-w-[820px]">
            <div className="rounded-[20px] border border-[#D4DAE0] bg-white shadow-[0_8px_28px_rgba(32,37,42,0.08)] transition focus-within:border-[#9BB9DE] focus-within:shadow-[0_8px_28px_rgba(53,105,184,0.12)]">
              {uploadedFiles.length > 0 ? (
                <div className="flex flex-wrap gap-2 px-4 pt-4">
                  {uploadedFiles.map((uploadedFile) => (
                    <div
                      key={uploadedFile.id}
                      className="flex max-w-full items-center gap-2 rounded-lg border border-[#D7E2F0] bg-[#F5F8FC] px-3 py-2"
                    >
                      <FileText
                        className="size-4 shrink-0 text-[#3569B8]"
                        aria-hidden
                      />

                      <div className="min-w-0">
                        <p className="max-w-[260px] truncate text-[12px] font-semibold text-[#4E5963]">
                          {uploadedFile.filename}
                        </p>
                        <p className="text-[10px] uppercase text-[#8A9299]">
                          {uploadedFile.file_type} · {formatFileSize(uploadedFile.size_bytes)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void removeUploadedFile(uploadedFile.id);
                        }}
                        disabled={isRunning}
                        className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#8A9299] transition hover:bg-white hover:text-[#D95117] disabled:opacity-50"
                        aria-label={`Remove ${uploadedFile.filename}`}
                      >
                        <X
                          className="size-3.5"
                          aria-hidden
                        />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {workflow.input_capabilities.allow_text ? (
                <label className="block px-5 pt-4">
                  <span className="sr-only">
                    Ask this workflow
                  </span>

                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    disabled={isRunning}
                    rows={1}
                    className="max-h-[180px] min-h-[52px] w-full resize-none overflow-y-auto bg-transparent text-[15px] leading-7 text-[#30343A] outline-none placeholder:text-[#A0A6AC] disabled:cursor-wait"
                    placeholder={
                      workflow.input_capabilities.file_upload.enabled
                        ? "Add an instruction for the uploaded document..."
                        : "Message this workflow..."
                    }
                  />
                </label>
              ) : null}

              <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-2">
                <div className="flex min-w-0 items-center gap-2">
                  {workflow.input_capabilities.file_upload.enabled ? (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={workflow.input_capabilities.file_upload.accepted_formats
                          .map((format) => `.${format}`)
                          .join(",")}
                        multiple={workflow.input_capabilities.file_upload.multiple}
                        onChange={(event) => {
                          void handleFileUpload(event);
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                        disabled={
                          isRunning ||
                          uploadingFile ||
                          uploadedFiles.length >=
                            workflow.input_capabilities.file_upload.max_files
                        }
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-[#59636C] transition hover:bg-[#EEF3F8] hover:text-[#3569B8] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {uploadingFile ? (
                          <span className="size-3.5 animate-spin rounded-full border-2 border-[#B7C6D8] border-t-[#3569B8]" />
                        ) : (
                          <Paperclip
                            className="size-4"
                            aria-hidden
                          />
                        )}
                        {uploadingFile ? "Uploading..." : "Upload file"}
                      </button>
                    </>
                  ) : null}

                  <p className="truncate text-[11px] text-[#9AA1A8]">
                    {workflow.input_capabilities.file_upload.enabled
                      ? `${workflow.input_capabilities.file_upload.accepted_formats
                          .map((format) => format.toUpperCase())
                          .join(" / ")} · max ${workflow.input_capabilities.file_upload.max_files}`
                      : "Enter to send · Shift + Enter for a new line"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    void runWorkflow();
                  }}
                  disabled={
                    isRunning ||
                    uploadingFile ||
                    (!input.trim() && uploadedFiles.length === 0)
                  }
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3569B8] text-white transition hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:bg-[#D5D9DD]"
                  aria-label="Run workflow"
                >
                  {isRunning ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <Send
                      className="size-4"
                      aria-hidden
                    />
                  )}
                </button>
              </div>
            </div>

            <p className="mt-2 text-center text-[11px] text-[#A0A6AC]">
              Each subagent reads the previous subagent&apos;s response.
              Only the final result is shown in the chat.
            </p>
          </div>
        </footer>
      </div>
    </section>
  );
}