export type WorkflowMetricsSummary = {
  total_runs: number;
  completed_runs: number;
  failed_runs: number;
  running_runs: number;

  fastest_duration_ms: number | null;
  average_duration_ms: number | null;
  median_duration_ms: number | null;
  p95_duration_ms: number | null;
  slowest_duration_ms: number | null;
  duration_stddev_ms: number | null;

  average_input_tokens: number;
  average_output_tokens: number;
  average_total_tokens: number;

  minimum_total_tokens: number;
  maximum_total_tokens: number;
};

export type WorkflowMetricsTrendItem = {
  run_id: number;
  status: string;
  created_at: string;

  duration_ms: number | null;

  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type AgentMetricsItem = {
  agent_id: number | null;
  agent_name: string;
  agent_order: number;

  run_count: number;
  completed_count: number;
  failed_count: number;

  fastest_duration_ms: number | null;
  average_duration_ms: number | null;
  median_duration_ms: number | null;
  p95_duration_ms: number | null;
  slowest_duration_ms: number | null;
  duration_stddev_ms: number | null;

  average_input_tokens: number;
  average_output_tokens: number;
  average_total_tokens: number;

  minimum_total_tokens: number;
  maximum_total_tokens: number;

  average_duration_percentage: number;
};

export type WorkflowMetricsResponse = {
  workflow_id: number;
  workflow: WorkflowMetricsSummary;
  duration_trend: WorkflowMetricsTrendItem[];
  agents: AgentMetricsItem[];
};

export type ApiErrorResponse = {
  detail?: string;
  message?: string;
};