from typing import Literal

from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    message: str


class BuilderChatMessage(BaseModel):
    role: Literal["user", "assistant"]

    content: str = Field(
        min_length=1,
        max_length=100_000,
    )


class BuilderChatRequest(BaseModel):
    messages: list[BuilderChatMessage]


class LoginRequest(BaseModel):
    username: str
    password: str


# ------------------------------------------------------------------
# Agent schemas
# ------------------------------------------------------------------

class AgentItem(BaseModel):
    id: int
    name: str
    system_prompt: str
    created_at: str


class AgentListResponse(BaseModel):
    agents: list[AgentItem]


class PublishAgentRequest(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=200,
    )

    system_prompt: str = Field(
        min_length=1,
        max_length=100_000,
    )

    role: str = Field(
        default="",
        max_length=2_000,
    )

    description: str = Field(
        default="",
        max_length=10_000,
    )

    order: int = Field(
        default=1,
        ge=1,
    )


# ------------------------------------------------------------------
# Workflow input / output capability schemas
# ------------------------------------------------------------------

UploadFileFormat = Literal["docx", "pdf"]
DownloadFileFormat = Literal["docx", "pdf", "bpmn"]


class WorkflowFileUploadCapability(BaseModel):
    enabled: bool = False
    accepted_formats: list[UploadFileFormat] = Field(default_factory=list)
    multiple: bool = False
    max_files: int = Field(default=1, ge=1, le=10)


class WorkflowInputCapabilities(BaseModel):
    allow_text: bool = True
    file_upload: WorkflowFileUploadCapability = Field(
        default_factory=WorkflowFileUploadCapability
    )


class WorkflowOutputCapabilities(BaseModel):
    download_formats: list[DownloadFileFormat] = Field(default_factory=list)




# ------------------------------------------------------------------
# Workflow routing schemas
# ------------------------------------------------------------------

RoutingOperator = Literal[
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "greater_than",
    "greater_or_equal",
    "less_than",
    "less_or_equal",
    "truthy",
    "falsy",
]


class WorkflowRoutingCondition(BaseModel):
    field: str = Field(min_length=1, max_length=200)
    operator: RoutingOperator = "equals"
    value: str | bool | int | float | None = None


class WorkflowRoutingRule(BaseModel):
    from_agent_order: int = Field(ge=1)
    to_agent_order: int = Field(ge=1)
    condition: WorkflowRoutingCondition
    label: str = Field(default="", max_length=300)
    priority: int = Field(default=100, ge=0, le=10_000)


class WorkflowRoutingConfiguration(BaseModel):
    mode: Literal["sequential", "conditional"] = "sequential"
    rules: list[WorkflowRoutingRule] = Field(default_factory=list, max_length=100)

# ------------------------------------------------------------------
# Workflow publish schemas
# ------------------------------------------------------------------

class PublishTriggerRequest(BaseModel):
    trigger_type: Literal[
        "manual",
        "gmail_new_message",
    ] = "manual"

    conditions: dict[str, str | bool | int] = Field(
        default_factory=dict,
    )


class PublishToolBindingRequest(BaseModel):
    tool_type: Literal[
        "gmail_read",
        "gmail_create_draft",
        "gmail_send_reply",
        "calendar_read",
        "calendar_create",
        "calendar_cancel",
    ]

    agent_order: int = Field(ge=1)
    permissions: list[str] = Field(default_factory=list)
    configuration: dict[str, str | bool | int] = Field(
        default_factory=dict,
    )


class PublishWorkflowRequest(BaseModel):
    workflow_name: str = Field(
        min_length=1,
        max_length=200,
    )

    agents: list[PublishAgentRequest] = Field(
        min_length=1,
        max_length=100,
    )

    trigger: PublishTriggerRequest = Field(
        default_factory=PublishTriggerRequest,
    )

    tools: list[PublishToolBindingRequest] = Field(
        default_factory=list,
        max_length=100,
    )

    input_capabilities: WorkflowInputCapabilities = Field(
        default_factory=WorkflowInputCapabilities
    )

    output_capabilities: WorkflowOutputCapabilities = Field(
        default_factory=WorkflowOutputCapabilities
    )

    routing: WorkflowRoutingConfiguration = Field(
        default_factory=WorkflowRoutingConfiguration
    )


class PublishedAgentItem(BaseModel):
    id: int
    name: str


class PublishWorkflowResponse(BaseModel):
    workflow_id: int
    workflow_name: str
    agents: list[PublishedAgentItem]
    published: bool = True


# ------------------------------------------------------------------
# Workflow list schemas
# ------------------------------------------------------------------

class WorkflowListItem(BaseModel):
    id: int
    name: str
    status: str
    agent_count: int
    created_at: str


class WorkflowListResponse(BaseModel):
    workflows: list[WorkflowListItem]


# ------------------------------------------------------------------
# Workflow detail schemas
# ------------------------------------------------------------------

class WorkflowAgentItem(BaseModel):
    id: int
    name: str
    system_prompt: str
    role: str
    description: str
    order: int
    created_at: str




class WorkflowTriggerItem(BaseModel):
    trigger_type: str
    conditions: dict[str, str | bool | int] = Field(
        default_factory=dict,
    )
    listening: bool = False


class WorkflowTriggerListeningRequest(BaseModel):
    listening: bool


class WorkflowTriggerListeningResponse(BaseModel):
    workflow_id: int
    trigger_type: str
    listening: bool

class WorkflowDetailResponse(BaseModel):
    id: int
    name: str
    status: str
    created_at: str
    updated_at: str
    agents: list[WorkflowAgentItem]
    trigger: WorkflowTriggerItem | None = None
    input_capabilities: WorkflowInputCapabilities = Field(
        default_factory=WorkflowInputCapabilities
    )
    output_capabilities: WorkflowOutputCapabilities = Field(
        default_factory=WorkflowOutputCapabilities
    )
    routing: WorkflowRoutingConfiguration = Field(
        default_factory=WorkflowRoutingConfiguration
    )


# ------------------------------------------------------------------
# Workflow runtime schemas
# ------------------------------------------------------------------

class WorkflowRunRequest(BaseModel):
    message: str = Field(
        default="",
        max_length=100_000,
    )
    file_ids: list[int] = Field(
        default_factory=list,
        max_length=10,
    )


class WorkflowRunAgent(BaseModel):
    id: int
    name: str
    order: int
    system_prompt: str
    role: str = ""
    description: str = ""


# ------------------------------------------------------------------
# Workflow history schemas
# ------------------------------------------------------------------

class WorkflowArtifactItem(BaseModel):
    id: int
    run_id: int
    artifact_type: str
    filename: str
    mime_type: str
    download_url: str
    created_at: str



class WorkflowRunListItem(BaseModel):
    id: int
    display_number: int
    workflow_id: int
    input: str
    final_output: str
    status: str
    error: str
    duration_ms: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model_name: str = ""
    model_calls: int = 0
    created_at: str
    completed_at: str | None = None
    artifacts: list[WorkflowArtifactItem] = Field(default_factory=list)


class WorkflowRunListResponse(BaseModel):
    runs: list[WorkflowRunListItem]


class WorkflowRunStepItem(BaseModel):
    id: int
    agent_id: int | None
    name: str
    role: str
    description: str
    order: int
    status: str
    input: str
    output: str
    error: str
    started_at: str | None = None
    completed_at: str | None = None
    duration_ms: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model_name: str = ""
    retry_count: int = 0
    response_id: str = ""
    created_at: str


class WorkflowRunDetailResponse(BaseModel):
    id: int
    display_number: int
    workflow_id: int
    input: str
    final_output: str
    status: str
    error: str
    duration_ms: int | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    model_name: str = ""
    model_calls: int = 0
    created_at: str
    completed_at: str | None = None
    agents: list[WorkflowRunStepItem]
    artifacts: list[WorkflowArtifactItem] = Field(default_factory=list)


# ------------------------------------------------------------------
# Workflow metrics schemas
# ------------------------------------------------------------------

class WorkflowMetricsSummary(BaseModel):
    total_runs: int = 0
    completed_runs: int = 0
    failed_runs: int = 0
    running_runs: int = 0

    fastest_duration_ms: int | None = None
    average_duration_ms: float | None = None
    median_duration_ms: float | None = None
    p95_duration_ms: float | None = None
    slowest_duration_ms: int | None = None
    duration_stddev_ms: float | None = None

    average_input_tokens: float = 0
    average_output_tokens: float = 0
    average_total_tokens: float = 0

    minimum_total_tokens: int = 0
    maximum_total_tokens: int = 0


class WorkflowMetricsTrendItem(BaseModel):
    run_id: int
    status: str
    created_at: str

    duration_ms: int | None = None

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class AgentMetricsItem(BaseModel):
    agent_id: int | None
    agent_name: str
    agent_order: int

    run_count: int = 0
    completed_count: int = 0
    failed_count: int = 0

    fastest_duration_ms: int | None = None
    average_duration_ms: float | None = None
    median_duration_ms: float | None = None
    p95_duration_ms: float | None = None
    slowest_duration_ms: int | None = None
    duration_stddev_ms: float | None = None

    average_input_tokens: float = 0
    average_output_tokens: float = 0
    average_total_tokens: float = 0

    minimum_total_tokens: int = 0
    maximum_total_tokens: int = 0

    average_duration_percentage: float = 0


class WorkflowMetricsResponse(BaseModel):
    workflow_id: int
    workflow: WorkflowMetricsSummary
    duration_trend: list[WorkflowMetricsTrendItem]
    agents: list[AgentMetricsItem]

class GmailReadTestRequest(BaseModel):
    message_id: str = Field(
        min_length=1,
        max_length=200,
    )


class GmailDraftTestRequest(BaseModel):
    to: str = Field(
        min_length=3,
        max_length=320,
    )

    subject: str = Field(
        min_length=1,
        max_length=998,
    )

    body: str = Field(
        min_length=1,
        max_length=100_000,
    )

# ------------------------------------------------------------------
# Process mining schemas (read-only workflow execution analysis)
# ------------------------------------------------------------------

class ProcessMiningSummary(BaseModel):
    total_runs: int = 0
    analyzed_runs: int = 0
    completed_runs: int = 0
    failed_runs: int = 0
    success_rate: float = 0
    variant_count: int = 0
    repeated_run_count: int = 0
    repeated_run_rate: float = 0
    average_duration_ms: float | None = None
    average_total_tokens: float | None = None


class ProcessMiningVariant(BaseModel):
    rank: int
    path: list[str]
    count: int
    percentage: float
    completed_count: int
    failed_count: int
    failure_rate: float
    run_ids: list[int] = Field(default_factory=list)


class ProcessMiningActivity(BaseModel):
    agent_id: int | None
    activity: str
    agent_order: int
    execution_count: int
    completed_count: int
    failed_count: int
    failure_rate: float
    average_duration_ms: float | None = None
    average_total_tokens: float | None = None


class ProcessMiningDirectFollow(BaseModel):
    source: str
    target: str
    count: int


class ProcessMiningConformanceDeviation(BaseModel):
    type: str
    after_activity: str
    expected_activity: str
    observed_activity: str
    detail: str


class ProcessMiningRoutingDecision(BaseModel):
    from_activity: str
    expected_next: str | None = None
    observed_next: str | None = None
    matched_rule_label: str = ""
    matched_rule: bool = False


class ProcessMiningConformanceRun(BaseModel):
    run_id: int
    status: str
    path: list[str] = Field(default_factory=list)
    conformant: bool
    deviation_count: int = 0
    deviations: list[ProcessMiningConformanceDeviation] = Field(default_factory=list)
    routing_decisions: list[ProcessMiningRoutingDecision] = Field(default_factory=list)


class ProcessMiningDesignedEdge(BaseModel):
    source: str
    target: str
    kind: str
    label: str


class ProcessMiningConformance(BaseModel):
    mode: str = "sequential"
    checked_runs: int = 0
    conformant_runs: int = 0
    nonconformant_runs: int = 0
    conformance_score: float = 0
    designed_path: list[str] = Field(default_factory=list)
    designed_edges: list[ProcessMiningDesignedEdge] = Field(default_factory=list)
    deviation_counts: dict[str, int] = Field(default_factory=dict)
    runs: list[ProcessMiningConformanceRun] = Field(default_factory=list)


class ProcessMiningInsight(BaseModel):
    type: str
    severity: str | None = None
    title: str
    detail: str


class ProcessMiningRecommendation(BaseModel):
    type: str
    title: str
    detail: str


class ProcessMiningResponse(BaseModel):
    workflow_id: int
    summary: ProcessMiningSummary
    variants: list[ProcessMiningVariant] = Field(default_factory=list)
    activities: list[ProcessMiningActivity] = Field(default_factory=list)
    direct_follows: list[ProcessMiningDirectFollow] = Field(default_factory=list)
    conformance: ProcessMiningConformance = Field(default_factory=ProcessMiningConformance)
    issues: list[ProcessMiningInsight] = Field(default_factory=list)
    recommendations: list[ProcessMiningRecommendation] = Field(default_factory=list)

class ProcessMiningAdvisorRecommendation(BaseModel):
    priority: Literal["high", "medium", "low"]
    title: str
    evidence: str
    recommendation: str
    expected_benefit: str
    confidence: Literal["high", "medium", "low"]


class ProcessMiningAdvisorResponse(BaseModel):
    workflow_id: int
    workflow_name: str
    analyzed_runs: int = 0
    evidence_strength: Literal["none", "limited", "growing", "stronger"] = "none"
    overview: str
    recommendations: list[ProcessMiningAdvisorRecommendation] = Field(default_factory=list)
    disclaimer: str
