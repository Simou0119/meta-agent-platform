export type ViewId = "agents" | "builder" | "chat";

export type Agent = {
  id: number;
  name: string;
  system_prompt: string;
  created_at: string;
};
