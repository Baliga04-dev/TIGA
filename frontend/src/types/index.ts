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
  mode: 'claude' | 'llm' | 'builtin';
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

export interface FoundLead {
  title: string;
  url: string;
  source: string;
  published: string;
  score: number;
  signals: string[];
}

export interface FindLeadsResponse {
  ok: boolean;
  leads: FoundLead[];
  errors: string[];
}

export type OutreachStatus =
  | 'drafted' | 'approved' | 'sent' | 'replied' | 'interested'
  | 'declined' | 'unsubscribed' | 'bounced' | 'rejected';

export interface OutreachItem {
  id: number;
  email: string;
  company: string;
  lead_url: string;
  source_note: string;
  subject: string;
  body: string;
  status: OutreachStatus;
  warnings: string;
  last_error: string;
  thread_id: string;
  followup_n: number;
  sent_at: string;
  replied_at: string;
}

export interface NewDraft {
  email: string;
  subject: string;
  body: string;
  company?: string;
  lead_url?: string;
  source_note?: string;
}

export interface Scorecard {
  sent_today: number;
  sent_week: number;
  replies: number;
  interested: number;
  declined: number;
  unsubscribed: number;
  bounced: number;
  followups_sent: number;
  awaiting_approval: number;
  daily_cap: number;
  pipeline: Record<string, number>;
}

export interface ReportRow {
  id: number;
  kind: string;
  report_date: string;
  subject: string;
  body: string;
  recipient: string;
  sent_at: string;
  delivery_error: string;
}

export interface ReportPreview {
  ok: true;
  status: 'red' | 'amber' | 'green';
  subject: string;
  body: string;
  date: string;
}

export interface Issue {
  id: number;
  kind: 'bug' | 'improvement';
  title: string;
  body: string;
  status: string;
  severity: string;
  source: string;
  occurrences: number;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
}

export interface Interview {
  id: string;
  slots: Record<string, string>;
  asked: string[];
  status: 'asking' | 'ready';
  question: { slot: string; text: string } | null;
}

export interface Prospect {
  id: number;
  source: 'osm' | 'news';
  name: string;
  category: string;
  website: string;
  email: string;
  email_source: string;
  phone: string;
  address: string;
  link: string;
  title: string;
  signals: string[];
  problems: string[];
  score: number;
  status: string;
  note: string;
}

export interface AnalystStatus {
  ok: true;
  counts: Record<string, number>;
  last: { phase: string; at: string; drafted?: number; new?: number; checked?: number; category?: string; errors: string[] } | null;
  schedule: string;
  enabled: boolean;
}
