export interface Email {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  labels: string[];
}

export interface ParsedEmail {
  email: Email;
  is_cold_email: boolean;
  is_reply: boolean;
  key_topics: string[];
  action_items: string[];
  contact_info: {
    emails: string[];
    phones: string[];
    linkedin: string[];
    websites: string[];
  };
  sentiment: 'positive' | 'negative' | 'neutral';
  summary: string;
}

export interface EmailSummary {
  period_days: number;
  total_emails: number;
  cold_emails: number;
  replies_received: number;
  positive_responses: number;
  action_items: string[];
  top_topics: Record<string, number>;
  emails: ParsedEmail[];
}

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface TemplateResponse {
  ok: boolean;
  source: string;
  template: EmailTemplate;
  ms: number;
  error?: string;
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  is_html?: boolean;
}

export interface SendEmailResponse {
  ok: boolean;
  message_id?: string;
  thread_id?: string;
  error?: string;
  ms: number;
}

export interface FetchEmailsResponse {
  ok: boolean;
  source: string;
  emails: ParsedEmail[];
  count: number;
  ms: number;
  error?: string;
}

export interface EmailSummaryResponse {
  ok: boolean;
  source: string;
  period_days: number;
  total_emails: number;
  cold_emails: number;
  replies_received: number;
  positive_responses: number;
  action_items: string[];
  top_topics: Record<string, number>;
  emails: ParsedEmail[];
  ms: number;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatResponse {
  reply: string;
  actions: ToolAction[];
  mode: 'llm' | 'builtin';
}

export interface ToolAction {
  tool: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface StatusResponse {
  name: string;
  github_repository: string;
  agents: string[];
  brain: string;
  tts: string;
  metrics_endpoint: boolean;
  booking_webhook: boolean;
  gmail_configured: boolean;
  version: string;
}

export type ServiceType = 'web_development' | 'software_development' | 'general';

export interface TemplateGenRequest {
  service_type: ServiceType;
  recipient_name: string;
  company_name: string;
  portfolio_link: string;
}

export interface AgentStatusResponse {
  name: string;
  agents: Array<{ name: string; role: string; status: string }>;
  github: {
    repository: string;
    configured: boolean;
    token_configured: boolean;
    branch: string;
    working_tree: string;
  };
}

export interface AgentCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface AgentRunResponse {
  ok: boolean;
  run_at: string;
  flow: string[];
  manager: { status: string; responsibilities: string[]; next_actions: string[] };
  dev: { status: string; responsibilities: string[] };
  tester: { ok: boolean; status: string; checks: AgentCheck[] };
}

export interface GithubSyncResponse {
  ok: boolean;
  pushed?: boolean;
  commits?: number;
  repository?: string;
  branch?: string;
  detail?: string;
  error?: string;
}

export interface PromptGenerateRequest {
  idea: string;
  outcome: string;
  audience: string;
  stack: string;
  constraints: string;
  research_topic: string;
}

export interface Lead {
  source: string;
  title: string;
  url: string;
  published: string;
  client_signal: string;
}

export interface ResearchLeadsResponse {
  ok: boolean;
  topic: string;
  searched_at: string;
  sources: string[];
  leads: Lead[];
  errors: string[];
  note: string;
}

export interface PromptGenerateResponse {
  ok: boolean;
  generated_at: string;
  prompt: string;
  questions: string[];
  research: ResearchLeadsResponse;
}

export interface DailyReportResponse {
  report: AgentRunResponse;
  delivery: { ok: boolean; error?: string; recipient?: string };
}
