export type ExecutionStep = {
  id: number;
  agent_id: number | null;

  name: string;
  role: string;
  description: string;

  order: number;
  status: string;

  input: string;
  output: string;
  error: string;

  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;

  input_tokens: number;
  output_tokens: number;
  total_tokens: number;

  model_name: string;
  retry_count: number;
  response_id: string;

  created_at: string;
};

export type ExecutionDetails = {
  id: number;
  display_number: number;
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

  agents: ExecutionStep[];
};

export type ApiErrorResponse = {
  detail?: string;
  message?: string;
};