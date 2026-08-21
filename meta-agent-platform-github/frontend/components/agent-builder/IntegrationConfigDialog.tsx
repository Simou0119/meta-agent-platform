"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  CreatedAgent,
} from "./CreatedAgentCard";

import {
  getApiBaseUrl,
} from "../../lib/api";


export type TriggerType =
  | "manual"
  | "gmail_new_message";


export type ToolType =
  | "gmail_read"
  | "calendar_read"
  | "gmail_create_draft"
  | "gmail_send_reply"
  | "calendar_create"
  | "calendar_cancel";


export type WorkflowIntegrationConfig = {
  trigger: {
    type: TriggerType;

    conditions: Record<
      string,
      string | boolean | number
    >;
  };

  tools: Array<{
    type: ToolType;

    agentOrder: number;

    permissions: string[];

    configuration: Record<
      string,
      string | boolean | number
    >;
  }>;
};


type GoogleConnectionStatus = {
  connected: boolean;
  provider: string;
  account_email: string | null;
  status: string;
  scopes: string[];
  expires_at: string | null;
  updated_at?: string | null;
};


type ErrorResponse = {
  detail?: string;
  message?: string;
};


type Props = {
  workflowName: string;
  agents: CreatedAgent[];
  open: boolean;
  isPublishing: boolean;
  onClose: () => void;
  onConfirm: (
    config: WorkflowIntegrationConfig,
  ) => void;
};


type ToolOption = {
  type: ToolType;
  title: string;
  description: string;
  permissions: string[];
};


const DATA_SOURCE_OPTIONS: ToolOption[] = [
  {
    type: "gmail_read",
    title: "Gmail · Read messages",
    description:
      "Read a complete Gmail message, including sender, subject, body and attachment information.",
    permissions: [
      "read_message",
      "read_attachment",
    ],
  },
  {
    type: "calendar_read",
    title: "Google Calendar · Read events",
    description:
      "Read matching calendar events and give the event details to the selected agent.",
    permissions: [
      "read_event",
    ],
  },
];


const GMAIL_ACTION_OPTIONS: ToolOption[] = [
  {
    type: "gmail_create_draft",
    title: "Gmail · Create draft",
    description:
      "Create a reviewable Gmail draft from the selected agent output.",
    permissions: [
      "create_draft",
    ],
  },
  {
    type: "gmail_send_reply",
    title: "Gmail · Send reply",
    description:
      "Send the selected agent output directly as a reply to the original Gmail message.",
    permissions: [
      "send_reply",
    ],
  },
];


const CALENDAR_ACTION_OPTIONS: ToolOption[] = [
  {
    type: "calendar_create",
    title: "Google Calendar · Create event",
    description:
      "Create a new Google Calendar event from the selected agent output.",
    permissions: [
      "create_event",
    ],
  },
  {
    type: "calendar_cancel",
    title: "Google Calendar · Cancel event",
    description:
      "Find one uniquely matching event and remove it from Google Calendar.",
    permissions: [
      "cancel_event",
    ],
  },
];


const TOOL_OPTIONS: ToolOption[] = [
  ...DATA_SOURCE_OPTIONS,
  ...GMAIL_ACTION_OPTIONS,
  ...CALENDAR_ACTION_OPTIONS,
];


export function IntegrationConfigDialog({
  workflowName,
  agents,
  open,
  isPublishing,
  onClose,
  onConfirm,
}: Props) {
  const [
    triggerType,
    setTriggerType,
  ] = useState<TriggerType>(
    "manual",
  );

  const [
    gmailSender,
    setGmailSender,
  ] = useState("");

  const [
    gmailSubject,
    setGmailSubject,
  ] = useState("");

  const [
    gmailHasAttachment,
    setGmailHasAttachment,
  ] = useState(false);

  const [
    toolAssignments,
    setToolAssignments,
  ] = useState<
    Partial<
      Record<ToolType, number>
    >
  >({});

  const [
    draftRecipient,
    setDraftRecipient,
  ] = useState("");

  const [
    draftSubject,
    setDraftSubject,
  ] = useState(
    `${workflowName} Result`,
  );

  const [
    sendReplyConfirmed,
    setSendReplyConfirmed,
  ] = useState(false);

  const [
    calendarCreateConfirmed,
    setCalendarCreateConfirmed,
  ] = useState(false);

  const [
    calendarCancelConfirmed,
    setCalendarCancelConfirmed,
  ] = useState(false);

  const [
    blockCalendarConflicts,
    setBlockCalendarConflicts,
  ] = useState(true);

  const [
    calendarTimezone,
    setCalendarTimezone,
  ] = useState("Europe/Berlin");

  const [
    googleConnection,
    setGoogleConnection,
  ] = useState<
    GoogleConnectionStatus | null
  >(null);

  const [
    googleStatusLoading,
    setGoogleStatusLoading,
  ] = useState(false);

  const [
    googleStatusError,
    setGoogleStatusError,
  ] = useState<string | null>(
    null,
  );


  const agentOptions =
    useMemo(
      () =>
        agents.map(
          (
            agent,
            index,
          ) => ({
            order: index + 1,
            name: agent.name,
          }),
        ),
      [agents],
    );


  const googleConnected =
    googleConnection?.connected ===
    true;


  const scopes =
    googleConnection?.scopes ?? [];


  const hasGmailReadScope =
    scopes.some((scope) =>
      scope.includes(
        "gmail.readonly",
      ),
    );


  const hasGmailWriteScope =
    scopes.some(
      (scope) =>
        scope.includes(
          "gmail.compose",
        ) ||
        scope.includes(
          "gmail.send",
        ) ||
        scope.includes(
          "gmail.modify",
        ),
    );


  const hasCalendarReadScope =
    scopes.some(
      (scope) =>
        scope.includes(
          "calendar.events.readonly",
        ) ||
        scope.endsWith(
          "/auth/calendar.events",
        ) ||
        scope.endsWith(
          "/auth/calendar.events.owned",
        ) ||
        scope.endsWith(
          "/auth/calendar",
        ),
    );


  const hasCalendarWriteScope =
    scopes.some(
      (scope) =>
        scope.endsWith(
          "/auth/calendar.events",
        ) ||
        scope.endsWith(
          "/auth/calendar.events.owned",
        ) ||
        scope.endsWith(
          "/auth/calendar",
        ),
    );


  const gmailReadEnabled =
    Boolean(
      toolAssignments.gmail_read,
    );

  const calendarReadEnabled =
    Boolean(
      toolAssignments.calendar_read,
    );

  const gmailDraftEnabled =
    Boolean(
      toolAssignments.gmail_create_draft,
    );

  const gmailSendReplyEnabled =
    Boolean(
      toolAssignments.gmail_send_reply,
    );

  const calendarCreateEnabled =
    Boolean(
      toolAssignments.calendar_create,
    );

  const calendarCancelEnabled =
    Boolean(
      toolAssignments.calendar_cancel,
    );


  useEffect(() => {
    if (!open) {
      return;
    }

    setDraftSubject(
      (currentSubject) =>
        currentSubject.trim()
          ? currentSubject
          : `${workflowName} Result`,
    );

    void loadGoogleStatus();
  }, [
    open,
    workflowName,
  ]);


  async function loadGoogleStatus(): Promise<void> {
    try {
      setGoogleStatusLoading(true);
      setGoogleStatusError(null);

      const response = await fetch(
        `${getApiBaseUrl()}/api/integrations/google/status`,
        {
          credentials: "include",
        },
      );

      const data = (await response
        .json()
        .catch(() => null)) as
        | GoogleConnectionStatus
        | ErrorResponse
        | null;

      if (!response.ok) {
        const errorData =
          data as ErrorResponse | null;

        throw new Error(
          errorData?.detail ??
            errorData?.message ??
            "Unable to load Google connection status.",
        );
      }

      setGoogleConnection(
        data as GoogleConnectionStatus,
      );
    } catch (statusError) {
      setGoogleConnection(null);

      setGoogleStatusError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to load Google connection status.",
      );
    } finally {
      setGoogleStatusLoading(false);
    }
  }


  function connectGoogle(): void {
    window.location.href =
      `${getApiBaseUrl()}/api/integrations/google/connect`;
  }


  function defaultAgentOrder(): number {
    return (
      agentOptions[0]?.order ??
      1
    );
  }


  function toggleDataSource(
    toolType: ToolType,
  ): void {
    if (!googleConnected) {
      setGoogleStatusError(
        "Connect a Google account before enabling this tool.",
      );
      return;
    }

    setGoogleStatusError(null);

    setToolAssignments(
      (current) => {
        const next = {
          ...current,
        };

        if (next[toolType]) {
          delete next[toolType];
        } else {
          next[toolType] =
            defaultAgentOrder();
        }

        return next;
      },
    );
  }


  function chooseGmailAction(
    toolType: ToolType | null,
  ): void {
    if (
      toolType &&
      !googleConnected
    ) {
      setGoogleStatusError(
        "Connect a Google account before enabling this action.",
      );
      return;
    }

    setGoogleStatusError(null);
    setSendReplyConfirmed(false);

    setToolAssignments(
      (current) => {
        const next = {
          ...current,
        };

        delete next.gmail_create_draft;
        delete next.gmail_send_reply;

        if (toolType) {
          next[toolType] =
            defaultAgentOrder();
        }

        return next;
      },
    );
  }


  function chooseCalendarAction(
    toolType: ToolType | null,
  ): void {
    if (
      toolType &&
      !googleConnected
    ) {
      setGoogleStatusError(
        "Connect a Google account before enabling this action.",
      );
      return;
    }

    setGoogleStatusError(null);
    setCalendarCreateConfirmed(false);
    setCalendarCancelConfirmed(false);

    setToolAssignments(
      (current) => {
        const next = {
          ...current,
        };

        delete next.calendar_create;
        delete next.calendar_cancel;

        if (toolType) {
          next[toolType] =
            defaultAgentOrder();
        }

        return next;
      },
    );
  }


  function updateAgentAssignment(
    toolType: ToolType,
    agentOrder: number,
  ): void {
    setToolAssignments(
      (current) => ({
        ...current,
        [toolType]: agentOrder,
      }),
    );
  }


  function buildConfiguration(
    toolType: ToolType,
  ): Record<
    string,
    string | boolean | number
  > {
    if (
      toolType ===
      "gmail_create_draft"
    ) {
      return {
        recipient:
          draftRecipient.trim(),
        subject:
          draftSubject.trim(),
      };
    }

    if (
      toolType ===
      "gmail_send_reply"
    ) {
      return {
        confirm_send:
          sendReplyConfirmed,
      };
    }

    if (
      toolType ===
      "calendar_read"
    ) {
      return {
        calendar_id: "primary",
        timezone:
          calendarTimezone.trim() ||
          "Europe/Berlin",
        max_results: 50,
      };
    }

    if (
      toolType ===
      "calendar_create"
    ) {
      return {
        calendar_id: "primary",
        timezone:
          calendarTimezone.trim() ||
          "Europe/Berlin",
        block_on_conflict:
          blockCalendarConflicts,
        send_updates: "all",
        confirm_calendar_create:
          calendarCreateConfirmed,
      };
    }

    if (
      toolType ===
      "calendar_cancel"
    ) {
      return {
        calendar_id: "primary",
        timezone:
          calendarTimezone.trim() ||
          "Europe/Berlin",
        send_updates: "all",
        confirm_calendar_cancel:
          calendarCancelConfirmed,
      };
    }

    return {};
  }


  function buildConfig():
    WorkflowIntegrationConfig {
    const conditions: Record<
      string,
      string | boolean | number
    > = {};

    if (
      triggerType ===
      "gmail_new_message"
    ) {
      conditions.sender_contains =
        gmailSender.trim();
      conditions.subject_contains =
        gmailSubject.trim();
      conditions.has_attachment =
        gmailHasAttachment;
    }

    return {
      trigger: {
        type: triggerType,
        conditions,
      },
      tools:
        TOOL_OPTIONS.flatMap(
          (tool) => {
            const agentOrder =
              toolAssignments[
                tool.type
              ];

            if (!agentOrder) {
              return [];
            }

            return [
              {
                type: tool.type,
                agentOrder,
                permissions:
                  tool.permissions,
                configuration:
                  buildConfiguration(
                    tool.type,
                  ),
              },
            ];
          },
        ),
    };
  }


  function confirmPublish(): void {
    if (
      triggerType ===
        "gmail_new_message" &&
      !googleConnected
    ) {
      setGoogleStatusError(
        "Connect Google before using the New Gmail Message trigger.",
      );
      return;
    }

    if (
      triggerType ===
        "gmail_new_message" &&
      !hasGmailReadScope
    ) {
      setGoogleStatusError(
        "Reconnect Google and grant Gmail read access before publishing this trigger.",
      );
      return;
    }

    if (
      gmailReadEnabled &&
      !hasGmailReadScope
    ) {
      setGoogleStatusError(
        "Reconnect Google and grant Gmail read access before publishing with Gmail Read Messages.",
      );
      return;
    }

    if (
      (gmailDraftEnabled ||
        gmailSendReplyEnabled) &&
      !hasGmailWriteScope
    ) {
      setGoogleStatusError(
        "Reconnect Google and grant Gmail compose/send access before publishing this Gmail action.",
      );
      return;
    }

    if (
      gmailDraftEnabled &&
      !draftRecipient.trim()
    ) {
      setGoogleStatusError(
        "Enter a recipient for the Gmail draft.",
      );
      return;
    }

    if (
      gmailDraftEnabled &&
      !draftSubject.trim()
    ) {
      setGoogleStatusError(
        "Enter a subject for the Gmail draft.",
      );
      return;
    }

    if (
      gmailSendReplyEnabled &&
      !gmailReadEnabled
    ) {
      setGoogleStatusError(
        "Enable Gmail Read Messages before using Gmail Send Reply.",
      );
      return;
    }

    if (
      gmailSendReplyEnabled &&
      !sendReplyConfirmed
    ) {
      setGoogleStatusError(
        "Confirm that this workflow may send Gmail replies automatically.",
      );
      return;
    }

    if (
      calendarReadEnabled &&
      !hasCalendarReadScope
    ) {
      setGoogleStatusError(
        "Reconnect Google and grant Calendar event access before publishing with Google Calendar Read Events.",
      );
      return;
    }

    if (
      (calendarCreateEnabled ||
        calendarCancelEnabled) &&
      !hasCalendarWriteScope
    ) {
      setGoogleStatusError(
        "Reconnect Google and grant Calendar event write access before publishing this Calendar action.",
      );
      return;
    }

    if (
      calendarCreateEnabled &&
      !calendarCreateConfirmed
    ) {
      setGoogleStatusError(
        "Confirm that this workflow may create Google Calendar events.",
      );
      return;
    }

    if (
      calendarCancelEnabled &&
      !calendarCancelConfirmed
    ) {
      setGoogleStatusError(
        "Confirm that this workflow may cancel Google Calendar events.",
      );
      return;
    }

    if (!calendarTimezone.trim()) {
      setGoogleStatusError(
        "Enter a Calendar timezone.",
      );
      return;
    }

    setGoogleStatusError(null);
    onConfirm(buildConfig());
  }


  function AgentSelect({
    toolType,
  }: {
    toolType: ToolType;
  }) {
    const value =
      toolAssignments[toolType] ??
      defaultAgentOrder();

    return (
      <select
        value={value}
        onChange={(event) => {
          updateAgentAssignment(
            toolType,
            Number(
              event.target.value,
            ),
          );
        }}
        disabled={isPublishing}
        className="min-w-[220px] rounded-lg border border-[#CDD7E1] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#3569B8] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {agentOptions.map(
          (agent) => (
            <option
              key={agent.order}
              value={agent.order}
            >
              Agent {agent.order}: {agent.name}
            </option>
          ),
        )}
      </select>
    );
  }


  function ToolCard({
    tool,
    selected,
    mode,
    onSelect,
  }: {
    tool: ToolOption;
    selected: boolean;
    mode: "checkbox" | "radio";
    onSelect: () => void;
  }) {
    return (
      <div
        className={[
          "rounded-xl border p-4",
          selected
            ? "border-[#9DBADC] bg-[#F4F8FD]"
            : "border-[#DCE3EA] bg-white",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
            <input
              type={mode}
              checked={selected}
              onChange={onSelect}
              disabled={
                isPublishing ||
                !googleConnected
              }
              className="mt-1 size-4"
            />

            <span>
              <span className="block text-[14px] font-semibold text-[#20252A]">
                {tool.title}
              </span>

              <span className="mt-1 block text-[12px] leading-5 text-[#6A757E]">
                {tool.description}
              </span>
            </span>
          </label>

          {selected ? (
            <AgentSelect
              toolType={tool.type}
            />
          ) : null}
        </div>
      </div>
    );
  }


  if (!open) {
    return null;
  }


  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#13202D]/55 p-6 backdrop-blur-[2px]">
      <div className="max-h-[90vh] w-full max-w-[900px] overflow-y-auto rounded-2xl border border-[#DCE3EA] bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-[#E4E9EE] px-7 py-6">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#3569B8]">
              Before Publish
            </p>

            <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#202126]">
              Configure trigger and actions
            </h2>

            <p className="mt-2 text-[13px] leading-5 text-[#6A757E]">
              A trigger starts the workflow. Data sources provide information. Actions run after the agents finish.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-lg border border-[#D5DDE5] px-3 py-1.5 text-[13px] font-semibold text-[#59636C] hover:bg-[#F3F6F8] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </header>

        <div className="space-y-8 px-7 py-6">
          <section>
            <h3 className="text-[16px] font-semibold text-[#20252A]">
              1. Google connection
            </h3>

            <div className="mt-4 rounded-xl border border-[#DCE3EA] bg-[#F8FAFC] p-5">
              {googleStatusLoading ? (
                <div className="flex items-center gap-3">
                  <span className="size-5 animate-spin rounded-full border-2 border-[#C4D2E2] border-t-[#3569B8]" />
                  <p className="text-[13px] text-[#6A757E]">
                    Checking Google connection...
                  </p>
                </div>
              ) : googleConnected ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[#42A66A]" />
                      <p className="text-[14px] font-semibold text-[#20252A]">
                        Google connected
                      </p>
                    </div>

                    <p className="mt-2 text-[13px] text-[#59636C]">
                      {googleConnection?.account_email ?? "Connected account"}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void loadGoogleStatus();
                      }}
                      disabled={isPublishing}
                      className="rounded-lg border border-[#CBD5DF] bg-white px-4 py-2 text-[13px] font-semibold text-[#4E5963] hover:bg-[#F2F5F7] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Refresh
                    </button>

                    <button
                      type="button"
                      onClick={connectGoogle}
                      disabled={isPublishing}
                      className="rounded-lg bg-[#3569B8] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[14px] font-semibold text-[#20252A]">
                      Google not connected
                    </p>
                    <p className="mt-2 text-[13px] text-[#6A757E]">
                      Connect Google before enabling Gmail or Calendar tools.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={connectGoogle}
                    disabled={isPublishing}
                    className="rounded-lg bg-[#3569B8] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Connect Google
                  </button>
                </div>
              )}
            </div>

            {googleStatusError ? (
              <div className="mt-3 rounded-lg border border-[#F0C9AB] bg-[#FFF3EC] px-4 py-3 text-[13px] font-medium text-[#D95117]">
                {googleStatusError}
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-[16px] font-semibold text-[#20252A]">
              2. Trigger
            </h3>

            <p className="mt-1 text-[13px] text-[#6A757E]">
              Choose one event that starts the workflow.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {([
                [
                  "manual",
                  "Manual",
                  "Run the workflow from Chat with Workflow when needed.",
                ],
                [
                  "gmail_new_message",
                  "New Gmail message",
                  "Automatically run when a matching Inbox email arrives.",
                ],
              ] as const).map(
                ([value, title, description]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTriggerType(value);
                    }}
                    disabled={isPublishing}
                    className={[
                      "rounded-xl border p-4 text-left transition",
                      triggerType === value
                        ? "border-[#3569B8] bg-[#EEF5FD] ring-2 ring-[#3569B8]/10"
                        : "border-[#DCE3EA] hover:border-[#AFC5DD]",
                    ].join(" ")}
                  >
                    <p className="text-[14px] font-semibold text-[#20252A]">
                      {title}
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-[#6A757E]">
                      {description}
                    </p>
                  </button>
                ),
              )}
            </div>

            {triggerType ===
            "gmail_new_message" ? (
              <div className="mt-4 grid gap-4 rounded-xl border border-[#DCE3EA] bg-[#F7F9FB] p-5 md:grid-cols-2">
                <label className="text-[13px] font-medium text-[#30383F]">
                  Sender contains (optional)
                  <input
                    value={gmailSender}
                    onChange={(event) => {
                      setGmailSender(event.target.value);
                    }}
                    placeholder="e.g. professor@tum.de"
                    className="mt-2 w-full rounded-lg border border-[#CDD7E1] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#3569B8]"
                  />
                </label>

                <label className="text-[13px] font-medium text-[#30383F]">
                  Subject contains (optional)
                  <input
                    value={gmailSubject}
                    onChange={(event) => {
                      setGmailSubject(event.target.value);
                    }}
                    placeholder="e.g. meeting request"
                    className="mt-2 w-full rounded-lg border border-[#CDD7E1] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#3569B8]"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-lg border border-[#DCE3EA] bg-white px-4 py-3 text-[13px] font-medium text-[#30383F] md:col-span-2">
                  <input
                    type="checkbox"
                    checked={gmailHasAttachment}
                    onChange={(event) => {
                      setGmailHasAttachment(event.target.checked);
                    }}
                    className="size-4"
                  />
                  Only trigger for emails with attachments
                </label>
              </div>
            ) : null}
          </section>

          <section>
            <h3 className="text-[16px] font-semibold text-[#20252A]">
              3. Data sources
            </h3>

            <p className="mt-1 text-[13px] text-[#6A757E]">
              These tools provide real email or calendar data to the selected agents. Both may be enabled together.
            </p>

            <div className="mt-4 space-y-3">
              {DATA_SOURCE_OPTIONS.map(
                (tool) => (
                  <div key={tool.type}>
                    <ToolCard
                      tool={tool}
                      selected={Boolean(
                        toolAssignments[
                          tool.type
                        ],
                      )}
                      mode="checkbox"
                      onSelect={() => {
                        toggleDataSource(
                          tool.type,
                        );
                      }}
                    />

                    {tool.type ===
                      "gmail_read" &&
                    gmailReadEnabled ? (
                      <div className="mt-2 rounded-lg border border-[#D7E2EF] bg-[#F8FAFC] px-4 py-3 text-[12px] leading-5 text-[#59636C]">
                        {triggerType ===
                        "gmail_new_message"
                          ? "The triggering email is supplied automatically."
                          : "For a manual run, provide Gmail message ID: ... or Gmail subject: ... in the chat input."}
                      </div>
                    ) : null}

                    {tool.type ===
                      "calendar_read" &&
                    calendarReadEnabled ? (
                      <div className="mt-2 rounded-lg border border-[#D7E2EF] bg-[#F8FAFC] px-4 py-3 text-[12px] leading-5 text-[#59636C]">
                        Examples: Read my calendar today; Read my calendar this week; Calendar date: 2026-08-03; Calendar title: Project Meeting.
                      </div>
                    ) : null}
                  </div>
                ),
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[16px] font-semibold text-[#20252A]">
              4. Gmail action
            </h3>

            <p className="mt-1 text-[13px] text-[#6A757E]">
              Choose at most one Gmail action after the agents finish.
            </p>

            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-[#DCE3EA] bg-white p-4">
              <input
                type="radio"
                checked={
                  !gmailDraftEnabled &&
                  !gmailSendReplyEnabled
                }
                onChange={() => {
                  chooseGmailAction(null);
                }}
                name="gmail-action"
                className="size-4"
              />
              <span className="text-[14px] font-semibold text-[#20252A]">
                No Gmail action
              </span>
            </label>

            <div className="mt-3 space-y-3">
              {GMAIL_ACTION_OPTIONS.map(
                (tool) => {
                  const selected =
                    Boolean(
                      toolAssignments[
                        tool.type
                      ],
                    );

                  return (
                    <div key={tool.type}>
                      <ToolCard
                        tool={tool}
                        selected={selected}
                        mode="radio"
                        onSelect={() => {
                          chooseGmailAction(
                            tool.type,
                          );
                        }}
                      />

                      {tool.type ===
                        "gmail_create_draft" &&
                      selected ? (
                        <div className="mt-2 grid gap-4 rounded-lg border border-[#D7E2EF] bg-[#F8FAFC] p-4 md:grid-cols-2">
                          <label className="text-[13px] font-medium text-[#30383F]">
                            Draft recipient
                            <input
                              type="email"
                              value={draftRecipient}
                              onChange={(event) => {
                                setDraftRecipient(event.target.value);
                              }}
                              placeholder="example@gmail.com"
                              className="mt-2 w-full rounded-lg border border-[#CDD7E1] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#3569B8]"
                            />
                          </label>

                          <label className="text-[13px] font-medium text-[#30383F]">
                            Draft subject
                            <input
                              value={draftSubject}
                              onChange={(event) => {
                                setDraftSubject(event.target.value);
                              }}
                              className="mt-2 w-full rounded-lg border border-[#CDD7E1] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#3569B8]"
                            />
                          </label>
                        </div>
                      ) : null}

                      {tool.type ===
                        "gmail_send_reply" &&
                      selected ? (
                        <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-[#F0B899] bg-[#FFF7F2] px-4 py-3 text-[12px] leading-5 text-[#7A3D20]">
                          <input
                            type="checkbox"
                            checked={sendReplyConfirmed}
                            onChange={(event) => {
                              setSendReplyConfirmed(event.target.checked);
                            }}
                            className="mt-1 size-4"
                          />
                          <span className="font-medium">
                            I understand that this action sends a Gmail reply immediately without creating a draft.
                          </span>
                        </label>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>
          </section>

          <section>
            <h3 className="text-[16px] font-semibold text-[#20252A]">
              5. Calendar action
            </h3>

            <p className="mt-1 text-[13px] text-[#6A757E]">
              Choose at most one Calendar action. Create and Cancel cannot run together.
            </p>

            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-[#DCE3EA] bg-white p-4">
              <input
                type="radio"
                checked={
                  !calendarCreateEnabled &&
                  !calendarCancelEnabled
                }
                onChange={() => {
                  chooseCalendarAction(null);
                }}
                name="calendar-action"
                className="size-4"
              />
              <span className="text-[14px] font-semibold text-[#20252A]">
                No Calendar action
              </span>
            </label>

            <div className="mt-3 space-y-3">
              {CALENDAR_ACTION_OPTIONS.map(
                (tool) => {
                  const selected =
                    Boolean(
                      toolAssignments[
                        tool.type
                      ],
                    );

                  return (
                    <div key={tool.type}>
                      <ToolCard
                        tool={tool}
                        selected={selected}
                        mode="radio"
                        onSelect={() => {
                          chooseCalendarAction(
                            tool.type,
                          );
                        }}
                      />

                      {tool.type ===
                        "calendar_create" &&
                      selected ? (
                        <div className="mt-2 space-y-3 rounded-lg border border-[#D7E2EF] bg-[#F8FAFC] p-4 text-[12px] leading-5 text-[#59636C]">
                          <p>
                            The selected agent must provide Calendar title, start and end. The backend creates the event only after validation.
                          </p>

                          <label className="flex items-start gap-3 rounded-lg border border-[#DCE3EA] bg-white px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={blockCalendarConflicts}
                              onChange={(event) => {
                                setBlockCalendarConflicts(event.target.checked);
                              }}
                              className="mt-1 size-4"
                            />
                            <span>
                              Block event creation when another event overlaps the requested time.
                            </span>
                          </label>

                          <label className="flex items-start gap-3 rounded-lg border border-[#E9C5B1] bg-[#FFF7F2] px-3 py-2.5 text-[#67351E]">
                            <input
                              type="checkbox"
                              checked={calendarCreateConfirmed}
                              onChange={(event) => {
                                setCalendarCreateConfirmed(event.target.checked);
                              }}
                              className="mt-1 size-4"
                            />
                            <span className="font-medium">
                              I understand that this workflow can automatically create events in my Google Calendar.
                            </span>
                          </label>
                        </div>
                      ) : null}

                      {tool.type ===
                        "calendar_cancel" &&
                      selected ? (
                        <div className="mt-2 space-y-3 rounded-lg border border-[#F0B899] bg-[#FFF7F2] p-4 text-[12px] leading-5 text-[#7A3D20]">
                          <p>
                            Cancellation requires an Event ID or one unique exact title/date match. The backend refuses ambiguous matches.
                          </p>

                          <label className="flex items-start gap-3 rounded-lg border border-[#E9C5B1] bg-white px-3 py-2.5 text-[#67351E]">
                            <input
                              type="checkbox"
                              checked={calendarCancelConfirmed}
                              onChange={(event) => {
                                setCalendarCancelConfirmed(event.target.checked);
                              }}
                              className="mt-1 size-4"
                            />
                            <span className="font-medium">
                              I understand that this workflow can automatically cancel Google Calendar events and notify attendees.
                            </span>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>

            {(calendarReadEnabled ||
              calendarCreateEnabled ||
              calendarCancelEnabled) ? (
              <label className="mt-4 block text-[13px] font-medium text-[#30383F]">
                Calendar timezone
                <input
                  value={calendarTimezone}
                  onChange={(event) => {
                    setCalendarTimezone(event.target.value);
                  }}
                  placeholder="Europe/Berlin"
                  className="mt-2 w-full rounded-lg border border-[#CDD7E1] bg-white px-3 py-2.5 text-[14px] outline-none focus:border-[#3569B8]"
                />
              </label>
            ) : null}
          </section>

          <div className="rounded-xl border border-[#BFDCCB] bg-[#F3FAF6] px-4 py-3 text-[12px] leading-5 text-[#356A49]">
            Available triggers: Manual and New Gmail Message. Gmail Read and Calendar Read may be combined. Gmail actions are mutually exclusive, and Calendar actions are mutually exclusive.
          </div>
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-[#E4E9EE] bg-[#F8FAFC] px-7 py-5">
          <p className="text-[12px] text-[#6A757E]">
            Manual trigger with no tools is still supported.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPublishing}
              className="rounded-lg border border-[#CBD5DF] bg-white px-5 py-2.5 text-[14px] font-semibold text-[#475058] hover:bg-[#F2F5F7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={confirmPublish}
              disabled={isPublishing}
              className="flex min-w-[150px] items-center justify-center rounded-lg bg-[#3569B8] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#2F5FA8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPublishing
                ? "Publishing..."
                : "Confirm & Publish"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}