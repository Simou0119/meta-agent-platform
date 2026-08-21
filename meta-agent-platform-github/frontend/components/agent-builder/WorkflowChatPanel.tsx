"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";

import {
  CreatedAgentCard,
  type CreatedAgent,
} from "./CreatedAgentCard";
import { QuickReplyCard } from "./QuickReplyCard";
import { Icon } from "../ui/Icon";
import { getApiBaseUrl } from "../../lib/api";
import type { WorkflowGraph } from "./WorkflowGraphPanel";
import {
  IntegrationConfigDialog,
  type WorkflowIntegrationConfig,
} from "./IntegrationConfigDialog";

type WorkflowChatPanelProps = {
  initialMessage: string;
  onBack?: () => void;
  onWorkflowChange?: (workflow: WorkflowGraph) => void;
  onPublished?: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type WorkflowInputCapabilities = {
  allowText: boolean;
  fileUpload: {
    enabled: boolean;
    acceptedFormats: Array<"docx" | "pdf">;
    multiple: boolean;
    maxFiles: number;
  };
};

type WorkflowOutputCapabilities = {
  downloadFormats: Array<"docx" | "pdf" | "bpmn">;
};

type WorkflowRoutingRule = {
  fromAgentOrder: number;
  toAgentOrder: number;
  condition: {
    field: string;
    operator:
      | "equals" | "not_equals" | "contains" | "not_contains"
      | "greater_than" | "greater_or_equal" | "less_than" | "less_or_equal"
      | "truthy" | "falsy";
    value: string | boolean | number | null;
  };
  label: string;
  priority: number;
};

type WorkflowRouting = {
  mode: "sequential" | "conditional";
  rules: WorkflowRoutingRule[];
};

type CreatedWorkflow = {
  workflowName: string;
  agents: CreatedAgent[];
  inputCapabilities: WorkflowInputCapabilities;
  outputCapabilities: WorkflowOutputCapabilities;
  routing: WorkflowRouting;
};

type BuilderEvent = {
  type?: string;
  content?: string;

  workflow_name?: string;
  workflowName?: string;
  name?: string;

  agents?: unknown;
  subagents?: unknown;
  sub_agents?: unknown;

  agent_id?: number | string;
  agentId?: number | string;

  system_prompt?: string;
  systemPrompt?: string;

  role?: string;
  description?: string;

  input_capabilities?: unknown;
  inputCapabilities?: unknown;
  output_capabilities?: unknown;
  outputCapabilities?: unknown;
  routing?: unknown;
};

type PublishResponse = {
  workflow_name?: string;
  published?: boolean;
  agents?: Array<{
    id: number;
    name: string;
  }>;
};

function MarkdownPreview({
  content,
}: {
  content: string;
}) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mb-4 text-[25px] font-semibold leading-tight text-[#20252A]">
            {children}
          </h1>
        ),

        h2: ({ children }) => (
          <h2 className="mb-3 mt-7 text-[21px] font-semibold leading-tight text-[#20252A]">
            {children}
          </h2>
        ),

        h3: ({ children }) => (
          <h3 className="mb-2 mt-6 text-[17px] font-semibold leading-tight text-[#20252A]">
            {children}
          </h3>
        ),

        p: ({ children }) => (
          <p className="mb-4 text-[15px] leading-7 text-[#20252A]">
            {children}
          </p>
        ),

        ul: ({ children }) => (
          <ul className="mb-5 list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#20252A]">
            {children}
          </ul>
        ),

        ol: ({ children }) => (
          <ol className="mb-5 list-decimal space-y-2 pl-6 text-[15px] leading-7 text-[#20252A]">
            {children}
          </ol>
        ),

        li: ({ children }) => (
          <li className="pl-1">{children}</li>
        ),

        strong: ({ children }) => (
          <strong className="font-semibold text-[#20252A]">
            {children}
          </strong>
        ),

        blockquote: ({ children }) => (
          <blockquote className="mb-5 border-l-4 border-[#C2D7EF] pl-4 text-[#475058]">
            {children}
          </blockquote>
        ),

        code: ({ children }) => (
          <code className="rounded bg-[#EBECEF] px-1.5 py-0.5 text-[13px] text-[#20252A]">
            {children}
          </code>
        ),

        pre: ({ children }) => (
          <pre className="mb-5 overflow-x-auto rounded-md bg-[#20252A] p-4 text-[13px] leading-6 text-white">
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function stripSentinel(text: string): string {
  return text
    .replace(
      /```[a-z]*\s*<!--AGENT_CONFIG:[\s\S]*?-->\s*```/gi,
      "",
    )
    .replace(
      /```[a-z]*\s*<!--WORKFLOW_CONFIG:[\s\S]*?-->\s*```/gi,
      "",
    )
    .replace(
      /<!--AGENT_CONFIG:[\s\S]*?-->/gi,
      "",
    )
    .replace(
      /<!--WORKFLOW_CONFIG:[\s\S]*?-->/gi,
      "",
    )
    .trimEnd();
}

function createMessageId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`
  );
}

function getStringValue(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeAgent(
  rawAgent: unknown,
  index: number,
): CreatedAgent {
  if (typeof rawAgent === "string") {
    return {
      id: index + 1,
      name: rawAgent,
    };
  }

  if (
    typeof rawAgent !== "object" ||
    rawAgent === null
  ) {
    return {
      id: index + 1,
      name: `Subagent ${index + 1}`,
    };
  }

  const agent =
    rawAgent as Record<string, unknown>;

  const rawId =
    agent.id ??
    agent.agent_id ??
    agent.agentId ??
    index + 1;

  const name =
    getStringValue(agent.name) ||
    getStringValue(agent.agent_name) ||
    getStringValue(agent.agentName) ||
    getStringValue(agent.title) ||
    `Subagent ${index + 1}`;

  const systemPrompt =
    getStringValue(agent.system_prompt) ||
    getStringValue(agent.systemPrompt);

  const role =
    getStringValue(agent.role) ||
    getStringValue(agent.agent_role) ||
    getStringValue(agent.agentRole);

  const description =
    getStringValue(agent.description) ||
    getStringValue(agent.instructions) ||
    getStringValue(agent.task) ||
    getStringValue(agent.responsibility);

  return {
    id:
      typeof rawId === "string" ||
      typeof rawId === "number"
        ? rawId
        : index + 1,

    name,
    systemPrompt:
      systemPrompt || undefined,
    role: role || undefined,
    description:
      description || undefined,
  };
}

function normalizeAgents(
  rawAgents: unknown,
): CreatedAgent[] {
  if (!Array.isArray(rawAgents)) {
    return [];
  }

  return rawAgents.map(normalizeAgent);
}

function normalizeInputCapabilities(
  rawValue: unknown,
): WorkflowInputCapabilities {
  const raw =
    rawValue && typeof rawValue === "object"
      ? (rawValue as Record<string, unknown>)
      : {};

  const rawUploadValue =
    raw.file_upload ?? raw.fileUpload;

  const rawUpload =
    rawUploadValue &&
    typeof rawUploadValue === "object"
      ? (rawUploadValue as Record<string, unknown>)
      : {};

  const rawFormats =
    rawUpload.accepted_formats ??
    rawUpload.acceptedFormats;

  const acceptedFormats = Array.isArray(rawFormats)
    ? Array.from(
        new Set(
          rawFormats
            .map((item) =>
              String(item).toLowerCase(),
            )
            .filter(
              (item): item is "docx" | "pdf" =>
                item === "docx" || item === "pdf",
            ),
        ),
      )
    : [];

  const multiple = Boolean(rawUpload.multiple);
  const configuredMaxFiles = Number(
    rawUpload.max_files ?? rawUpload.maxFiles,
  );

  return {
    allowText:
      raw.allow_text !== false &&
      raw.allowText !== false,
    fileUpload: {
      enabled:
        Boolean(rawUpload.enabled) &&
        acceptedFormats.length > 0,
      acceptedFormats,
      multiple,
      maxFiles: Number.isFinite(configuredMaxFiles)
        ? Math.min(10, Math.max(1, configuredMaxFiles))
        : multiple
          ? 5
          : 1,
    },
  };
}

function normalizeOutputCapabilities(
  rawValue: unknown,
): WorkflowOutputCapabilities {
  const raw =
    rawValue && typeof rawValue === "object"
      ? (rawValue as Record<string, unknown>)
      : {};

  const rawFormats =
    raw.download_formats ?? raw.downloadFormats;

  const downloadFormats = Array.isArray(rawFormats)
    ? Array.from(
        new Set(
          rawFormats
            .map((item) =>
              String(item).toLowerCase(),
            )
            .filter(
              (item): item is "docx" | "pdf" | "bpmn" =>
                item === "docx" ||
                item === "pdf" ||
                item === "bpmn",
            ),
        ),
      )
    : [];

  return { downloadFormats };
}

function normalizeRouting(rawValue: unknown): WorkflowRouting {
  const raw = rawValue && typeof rawValue === "object"
    ? (rawValue as Record<string, unknown>)
    : {};
  const rawRules = Array.isArray(raw.rules) ? raw.rules : [];
  const allowed = new Set([
    "equals", "not_equals", "contains", "not_contains",
    "greater_than", "greater_or_equal", "less_than", "less_or_equal",
    "truthy", "falsy",
  ]);
  const rules: WorkflowRoutingRule[] = [];
  for (const item of rawRules) {
    if (!item || typeof item !== "object") continue;
    const rule = item as Record<string, unknown>;
    const conditionRaw = rule.condition && typeof rule.condition === "object"
      ? (rule.condition as Record<string, unknown>) : null;
    if (!conditionRaw) continue;
    const fromAgentOrder = Number(rule.from_agent_order ?? rule.fromAgentOrder);
    const toAgentOrder = Number(rule.to_agent_order ?? rule.toAgentOrder);
    const field = String(conditionRaw.field ?? "").trim();
    const operator = String(conditionRaw.operator ?? "equals");
    if (!Number.isInteger(fromAgentOrder) || !Number.isInteger(toAgentOrder) || !field || !allowed.has(operator)) continue;
    const valueRaw = conditionRaw.value;
    const value = valueRaw === null || ["string", "boolean", "number"].includes(typeof valueRaw)
      ? (valueRaw as string | boolean | number | null)
      : String(valueRaw ?? "");
    rules.push({
      fromAgentOrder, toAgentOrder,
      condition: { field, operator: operator as WorkflowRoutingRule["condition"]["operator"], value },
      label: String(rule.label ?? ""),
      priority: Number(rule.priority ?? 100) || 100,
    });
  }
  return {
    mode: raw.mode === "conditional" && rules.length > 0 ? "conditional" : "sequential",
    rules,
  };
}

function workflowFromEvent(
  event: BuilderEvent,
): CreatedWorkflow {
  return {
    workflowName:
      event.workflow_name ??
      event.workflowName ??
      event.name ??
      "Generated Agent Team",

    agents: normalizeAgents(
      event.agents ??
        event.subagents ??
        event.sub_agents,
    ),

    inputCapabilities:
      normalizeInputCapabilities(
        event.input_capabilities ??
          event.inputCapabilities,
      ),

    outputCapabilities:
      normalizeOutputCapabilities(
        event.output_capabilities ??
          event.outputCapabilities,
      ),
    routing: normalizeRouting(event.routing),
  };
}

export function WorkflowChatPanel({
  initialMessage,
  onBack,
  onWorkflowChange,
  onPublished,
}: WorkflowChatPanelProps) {
  const [message, setMessage] =
    useState("");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [isSending, setIsSending] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    copiedMessageId,
    setCopiedMessageId,
  ] = useState<string | null>(null);

  const [
    createdWorkflow,
    setCreatedWorkflow,
  ] = useState<CreatedWorkflow | null>(
    null,
  );

  const [
    workflowPreview,
    setWorkflowPreview,
  ] = useState<CreatedWorkflow | null>(
    null,
  );

  const [
    isPublishing,
    setIsPublishing,
  ] = useState(false);

  const [isIntegrationDialogOpen, setIsIntegrationDialogOpen] =
    useState(false);

  const [
    isPublished,
    setIsPublished,
  ] = useState(false);

  const [
    publishError,
    setPublishError,
  ] = useState<string | null>(null);

  const inputRef =
    useRef<HTMLTextAreaElement>(null);

  const chatScrollRef =
    useRef<HTMLDivElement>(null);

  const initialMessageSentRef =
    useRef(false);

  const messagesRef =
    useRef<ChatMessage[]>([]);

  const isSendingRef =
    useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isSendingRef.current = isSending;
  }, [isSending]);

  /*
   * 正式创建的 Workflow 同步给父组件。
   *
   * 这里必须通过 useEffect 同步，
   * 不能在 setCreatedWorkflow 的更新函数内部
   * 调用 onWorkflowChange。
   */
  useEffect(() => {
    if (!createdWorkflow) {
      return;
    }

    onWorkflowChange?.({
      workflowName:
        createdWorkflow.workflowName,
      agents: createdWorkflow.agents,
    });
  }, [
    createdWorkflow,
    onWorkflowChange,
  ]);

  /*
   * Preview 单独同步到右侧流程图。
   */
  useEffect(() => {
    if (!workflowPreview) {
      return;
    }

    onWorkflowChange?.({
      workflowName:
        workflowPreview.workflowName,
      agents: workflowPreview.agents,
    });
  }, [
    workflowPreview,
    onWorkflowChange,
  ]);

  function scrollToBottom(): void {
    window.requestAnimationFrame(() => {
      const container =
        chatScrollRef.current;

      if (!container) {
        return;
      }

      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  function updateAssistantContent(
    assistantMessageId: string,
    content: string,
    replace = false,
  ): void {
    setMessages((previousMessages) => {
      const nextMessages =
        previousMessages.map(
          (chatMessage) => {
            if (
              chatMessage.id !==
              assistantMessageId
            ) {
              return chatMessage;
            }

            return {
              ...chatMessage,
              content: replace
                ? content
                : chatMessage.content +
                  content,
            };
          },
        );

      messagesRef.current =
        nextMessages;

      return nextMessages;
    });

    scrollToBottom();
  }

  function handleWorkflowPreview(
    event: BuilderEvent,
  ): void {
    const workflow =
      workflowFromEvent(event);

    setWorkflowPreview(workflow);
  }

  function handleWorkflowCreated(
    event: BuilderEvent,
  ): void {
    const workflow =
      workflowFromEvent(event);

    setCreatedWorkflow(workflow);
    setWorkflowPreview(null);
    setIsPublished(false);
    setPublishError(null);
  }

  function handleAgentCreated(
    event: BuilderEvent,
  ): void {
    const newAgent: CreatedAgent = {
      id:
        event.agent_id ??
        event.agentId ??
        createMessageId(),

      name:
        event.name ??
        "Generated Agent",

      systemPrompt:
        event.system_prompt ??
        event.systemPrompt,

      role: event.role,
      description: event.description,
    };

    /*
     * 这里仅更新当前组件自己的状态。
     * 不调用 onWorkflowChange。
     */
    setCreatedWorkflow(
      (previousWorkflow) => {
        const workflowName =
          previousWorkflow
            ?.workflowName ??
          event.workflow_name ??
          event.workflowName ??
          "Generated Agent Team";

        if (!previousWorkflow) {
          return {
            workflowName,
            agents: [newAgent],
            inputCapabilities:
              normalizeInputCapabilities(undefined),
            outputCapabilities:
              normalizeOutputCapabilities(undefined),
            routing: normalizeRouting(undefined),
          };
        }

        const existingIndex =
          previousWorkflow.agents.findIndex(
            (agent) =>
              agent.id === newAgent.id,
          );

        if (existingIndex >= 0) {
          const nextAgents = [
            ...previousWorkflow.agents,
          ];

          nextAgents[existingIndex] =
            newAgent;

          return {
            ...previousWorkflow,
            agents: nextAgents,
          };
        }

        return {
          ...previousWorkflow,
          agents: [
            ...previousWorkflow.agents,
            newAgent,
          ],
        };
      },
    );

    setWorkflowPreview(null);
    setIsPublished(false);
    setPublishError(null);
  }

  function handleBuilderEvent(
    event: BuilderEvent,
    assistantMessageId: string,
  ): void {
    if (event.type === "text_delta") {
      updateAssistantContent(
        assistantMessageId,
        event.content ?? "",
      );
      return;
    }

    if (event.type === "set_content") {
      updateAssistantContent(
        assistantMessageId,
        event.content ?? "",
        true,
      );
      return;
    }

    if (
      event.type ===
      "workflow_preview"
    ) {
      handleWorkflowPreview(event);
      return;
    }

    if (
      event.type ===
        "workflow_created" ||
      event.type ===
        "workflow_generated" ||
      event.type ===
        "subagents_created"
    ) {
      handleWorkflowCreated(event);
      return;
    }

    if (
      event.type ===
      "agent_created"
    ) {
      handleAgentCreated(event);
      return;
    }

    if (
      event.type ===
      "builder_error"
    ) {
      updateAssistantContent(
        assistantMessageId,
        "",
        true,
      );

      setError(
        event.content ??
          "Unable to generate the agent team.",
      );
    }
  }

  function processSseLine(
    line: string,
    assistantMessageId: string,
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
      const event =
        JSON.parse(
          rawData,
        ) as BuilderEvent;

      handleBuilderEvent(
        event,
        assistantMessageId,
      );
    } catch (parseError) {
      console.warn(
        "Unable to parse builder SSE event:",
        rawData,
        parseError,
      );
    }
  }

  const sendMessage = useCallback(
    async (
      messageOverride?: string,
      previousMessagesOverride?: ChatMessage[],
      endpoint = "/api/chat/builder",
    ): Promise<void> => {
      const trimmedMessage = (
        messageOverride ?? message
      ).trim();

      if (
        !trimmedMessage ||
        isSendingRef.current
      ) {
        return;
      }

      const previousMessages =
        previousMessagesOverride ??
        messagesRef.current;

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmedMessage,
      };

      const assistantMessage: ChatMessage =
        {
          id: createMessageId(),
          role: "assistant",
          content: "",
        };

      const requestMessages = [
        ...previousMessages,
        userMessage,
      ];

      const displayedMessages = [
        ...requestMessages,
        assistantMessage,
      ];

      messagesRef.current =
        displayedMessages;

      isSendingRef.current = true;

      setMessages(displayedMessages);
      setMessage("");
      setError(null);
      setPublishError(null);
      setIsPublished(false);
      setIsSending(true);

      /*
       * 用户继续修改时，
       * 上一个正式草案失效。
       */
      setCreatedWorkflow(null);

      if (inputRef.current) {
        inputRef.current.style.height =
          "auto";
      }

      scrollToBottom();

      try {
        const response = await fetch(
          `${getApiBaseUrl()}${endpoint}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            credentials:
              "include",

            body: JSON.stringify({
              messages:
                requestMessages.map(
                  ({
                    role,
                    content,
                  }) => ({
                    role,
                    content,
                  }),
                ),
            }),
          },
        );

        if (!response.ok) {
          const responseData =
            await response
              .json()
              .catch(() => null);

          throw new Error(
            responseData?.detail ??
              responseData?.message ??
              `Request failed with status ${response.status}.`,
          );
        }

        if (!response.body) {
          throw new Error(
            "The backend returned an empty response.",
          );
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
            buffer +=
              decoder.decode(
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
            processSseLine(
              line,
              assistantMessage.id,
            );
          }

          if (done) {
            break;
          }
        }

        if (buffer.trim()) {
          processSseLine(
            buffer,
            assistantMessage.id,
          );
        }
      } catch (sendError) {
        setMessages(
          (
            previousMessagesState,
          ) => {
            const nextMessages =
              previousMessagesState.filter(
                (chatMessage) =>
                  chatMessage.id !==
                  assistantMessage.id,
              );

            messagesRef.current =
              nextMessages;

            return nextMessages;
          },
        );

        setError(
          sendError instanceof Error
            ? sendError.message
            : "Unable to connect to the Agent Team Builder.",
        );
      } finally {
        isSendingRef.current = false;

        setIsSending(false);
        inputRef.current?.focus();

        scrollToBottom();
      }
    },
    [message],
  );

  useEffect(() => {
    if (
      !initialMessage.trim() ||
      initialMessageSentRef.current
    ) {
      return;
    }

    initialMessageSentRef.current =
      true;

    void sendMessage(
      initialMessage,
      [],
    );
  }, [
    initialMessage,
    sendMessage,
  ]);

  function continueWithDefaultPlan(): void {
    if (isSendingRef.current) {
      return;
    }

    void sendMessage(
      "Continue with the default plan.",
    );
  }

  function createWorkflow(): void {
    if (isSendingRef.current) {
      return;
    }

    void sendMessage(
      "Create Agent Team",
      undefined,
      "/api/chat/builder/create",
    );
  }

  async function publishWorkflow(
    integrationConfig: WorkflowIntegrationConfig,
  ): Promise<void> {
    if (
      !createdWorkflow ||
      isPublishing ||
      isPublished
    ) {
      return;
    }

    const agentsWithoutPrompt =
      createdWorkflow.agents.filter(
        (agent) =>
          !agent.systemPrompt?.trim(),
      );

    if (
      agentsWithoutPrompt.length > 0
    ) {
      setPublishError(
        "The agent team cannot be published because one or more agents do not have a system prompt.",
      );
      return;
    }

    setIsPublishing(true);
    setPublishError(null);

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/workflows/publish`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          credentials:
            "include",

          body: JSON.stringify({
            workflow_name:
              createdWorkflow.workflowName,

            trigger: {
              trigger_type: integrationConfig.trigger.type,
              conditions: integrationConfig.trigger.conditions,
            },

            tools: integrationConfig.tools.map((tool) => ({
              tool_type: tool.type,
              agent_order: tool.agentOrder,
              permissions: tool.permissions,
              configuration: tool.configuration,
            })),

            routing: {
              mode: createdWorkflow.routing.mode,
              rules: createdWorkflow.routing.rules.map((rule) => ({
                from_agent_order: rule.fromAgentOrder,
                to_agent_order: rule.toAgentOrder,
                condition: {
                  field: rule.condition.field,
                  operator: rule.condition.operator,
                  value: rule.condition.value,
                },
                label: rule.label,
                priority: rule.priority,
              })),
            },

            input_capabilities: {
              allow_text:
                createdWorkflow.inputCapabilities.allowText,
              file_upload: {
                enabled:
                  createdWorkflow.inputCapabilities.fileUpload.enabled,
                accepted_formats:
                  createdWorkflow.inputCapabilities.fileUpload.acceptedFormats,
                multiple:
                  createdWorkflow.inputCapabilities.fileUpload.multiple,
                max_files:
                  createdWorkflow.inputCapabilities.fileUpload.maxFiles,
              },
            },

            output_capabilities: {
              download_formats:
                createdWorkflow.outputCapabilities.downloadFormats,
            },

            agents:
              createdWorkflow.agents.map(
                (
                  agent,
                  index,
                ) => ({
                  name: agent.name,

                  system_prompt:
                    agent.systemPrompt?.trim() ??
                    "",

                  role:
                    agent.role?.trim() ??
                    "",

                  description:
                    agent.description?.trim() ??
                    "",

                  order: index + 1,
                }),
              ),
          }),
        },
      );

      const responseData =
        (await response
          .json()
          .catch(() => null)) as
          | PublishResponse
          | {
              detail?: string;
              message?: string;
            }
          | null;

      if (!response.ok) {
        if (
          responseData &&
          "detail" in responseData &&
          responseData.detail
        ) {
          throw new Error(
            responseData.detail,
          );
        }

        if (
          responseData &&
          "message" in responseData &&
          responseData.message
        ) {
          throw new Error(
            responseData.message,
          );
        }

        throw new Error(
          `Publish failed with status ${response.status}.`,
        );
      }

      /*
       * 这里只更新自身状态。
       * 不在 setCreatedWorkflow 回调内
       * 更新 BuilderWorkspace。
       *
       * 上面的 useEffect 会自动同步。
       */
      if (
        responseData &&
        "agents" in responseData &&
        Array.isArray(
          responseData.agents,
        )
      ) {
        setCreatedWorkflow(
          (previousWorkflow) => {
            if (
              !previousWorkflow
            ) {
              return previousWorkflow;
            }

            return {
              ...previousWorkflow,

              agents:
                previousWorkflow.agents.map(
                  (
                    agent,
                    index,
                  ) => ({
                    ...agent,

                    id:
                      responseData
                        .agents?.[
                        index
                      ]?.id ??
                      agent.id,
                  }),
                ),
            };
          },
        );
      }

      setIsPublished(true);
      setIsIntegrationDialogOpen(false);
      onPublished?.();
    } catch (
      publishRequestError
    ) {
      setPublishError(
        publishRequestError instanceof
          Error
          ? publishRequestError.message
          : "Unable to publish the agent team.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function copyAnswer(
    chatMessage: ChatMessage,
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(
        chatMessage.content,
      );

      setCopiedMessageId(
        chatMessage.id,
      );

      window.setTimeout(() => {
        setCopiedMessageId(null);
      }, 1600);
    } catch {
      setError(
        "Unable to copy the answer.",
      );
    }
  }

  function handleTextareaChange(
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    setMessage(event.target.value);

    event.target.style.height =
      "auto";

    event.target.style.height = `${Math.min(
      event.target.scrollHeight,
      180,
    )}px`;
  }

  function handleTextareaKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent
        .isComposing
    ) {
      event.preventDefault();

      void sendMessage();
    }
  }

  const lastAssistantId = [
    ...messages,
  ]
    .reverse()
    .find(
      (chatMessage) =>
        chatMessage.role ===
        "assistant",
    )?.id;

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start gap-4 border-b border-[#DCE3EA] bg-[#F4F7FA] px-6 py-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-[#D9DDE2] bg-white text-[#5E6871] transition hover:bg-[#F7F8F9]"
            aria-label="Back to agent team builder"
          >
            <span className="text-[20px] leading-none">
              ←
            </span>
          </button>
        ) : null}

        <div>
          <h1 className="text-[20px] font-semibold leading-tight text-[#2C3036]">
            Workflow Chat
          </h1>

          <p className="mt-1 text-[13px] leading-5 text-[#7A838B]">
            Refine the agent team through conversation.
          </p>
        </div>
      </header>

      <div
        ref={chatScrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
      >
        {messages.length > 0 ? (
          <div className="space-y-9">
            {messages.map(
              (chatMessage) => (
                <article
                  key={
                    chatMessage.id
                  }
                  className={[
                    "flex w-full",

                    chatMessage.role ===
                    "user"
                      ? "justify-end"
                      : "justify-start",
                  ].join(" ")}
                >
                  {chatMessage.role ===
                  "user" ? (
                    <div className="max-w-[88%] rounded-[26px] bg-[#E7E9EC] px-6 py-4 text-[15px] leading-7 text-[#20252A]">
                      <p className="whitespace-pre-wrap">
                        {
                          chatMessage.content
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="w-full">
                      {chatMessage.content ? (
                        <>
                          <MarkdownPreview
                            content={stripSentinel(
                              chatMessage.content,
                            )}
                          />

                          {!isSending ? (
                            <button
                              type="button"
                              onClick={() => {
                                void copyAnswer(
                                  chatMessage,
                                );
                              }}
                              className="rounded-md px-2 py-1 text-[12px] font-medium text-[#6A757E] transition hover:bg-[#EBECEF]"
                            >
                              {copiedMessageId ===
                              chatMessage.id
                                ? "Copied"
                                : "Copy"}
                            </button>
                          ) : null}
                        </>
                      ) : isSending &&
                        chatMessage.id ===
                          lastAssistantId ? (
                        <p className="text-[15px] leading-7 text-[#73757A]">
                          Agent Team Builder is
                          thinking...
                        </p>
                      ) : null}

                      {!isSending &&
                      !createdWorkflow &&
                      chatMessage.id ===
                        lastAssistantId &&
                      chatMessage.content.trim() ? (
                        <QuickReplyCard
                          onContinue={
                            continueWithDefaultPlan
                          }
                          onCreate={
                            createWorkflow
                          }
                          disabled={
                            isSending
                          }
                        />
                      ) : null}

                      {!isSending &&
                      createdWorkflow &&
                      chatMessage.id ===
                        lastAssistantId ? (
                        <CreatedAgentCard
                          workflowName={
                            createdWorkflow.workflowName
                          }
                          agents={
                            createdWorkflow.agents
                          }
                          onConfigure={() => {
                            setIsIntegrationDialogOpen(true);
                          }}
                          isPublishing={
                            isPublishing
                          }
                          isPublished={
                            isPublished
                          }
                          publishError={
                            publishError
                          }
                        />
                      ) : null}
                    </div>
                  )}
                </article>
              ),
            )}
          </div>
        ) : (
          <p className="text-[14px] text-[#6A757E]">
            Preparing your first agent team proposal...
          </p>
        )}

        {error ? (
          <p className="mt-5 rounded-md bg-[#FBEADA] px-3 py-2 text-[14px] font-medium text-[#D95117]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-[#DCE3EA] bg-[#F4F7FA] p-4">
        {isSending ? (
          <div className="mb-2 flex justify-center">
            <span className="rounded-full border border-[#DDE2E6] bg-white px-3 py-1 text-[12px] font-medium text-[#6A757E]">
              Generating...
            </span>
          </div>
        ) : null}

        <div className="rounded-[18px] border border-[#D9D7D4] bg-white shadow-[0_5px_16px_rgba(32,37,42,0.07)]">
          <label className="block px-5 pt-5">
            <span className="sr-only">
              Continue chatting
            </span>

            <textarea
              ref={inputRef}
              value={message}
              onChange={
                handleTextareaChange
              }
              onKeyDown={
                handleTextareaKeyDown
              }
              disabled={
                isSending ||
                isPublishing
              }
              className="min-h-[58px] max-h-[180px] w-full resize-none overflow-y-auto bg-transparent text-[16px] font-medium leading-7 text-[#30343A] outline-none placeholder:text-[#A7A9AD] disabled:cursor-wait"
              placeholder="Ask for changes or provide more details..."
            />
          </label>

          <div className="flex items-center justify-end gap-2 px-3 pb-3">
            <button
              type="button"
              disabled={
                isSending ||
                isPublishing
              }
              className="flex size-[38px] items-center justify-center rounded-full border border-[#ECEBEA] bg-white text-[#777B83] transition hover:bg-[#F7F7F6] disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Use microphone"
            >
              <Icon
                name="mic"
                className="size-5"
              />
            </button>

            <button
              type="button"
              onClick={() => {
                void sendMessage();
              }}
              disabled={
                isSending ||
                isPublishing ||
                !message.trim()
              }
              className="flex size-[38px] items-center justify-center rounded-full bg-[#3569B8] text-white transition hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:bg-[#D5D6D8]"
              aria-label="Send message"
            >
              <Icon
                name="arrowUp"
                className="size-5"
              />
            </button>
          </div>
        </div>
      </div>

      {createdWorkflow ? (
        <IntegrationConfigDialog
          workflowName={createdWorkflow.workflowName}
          agents={createdWorkflow.agents}
          open={isIntegrationDialogOpen}
          isPublishing={isPublishing}
          onClose={() => setIsIntegrationDialogOpen(false)}
          onConfirm={(config) => {
            void publishWorkflow(config);
          }}
        />
      ) : null}
    </section>
  );
}