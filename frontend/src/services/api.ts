import type {
  SendEmailRequest,
  SendEmailResponse,
  FetchEmailsResponse,
  EmailSummaryResponse,
  TemplateGenRequest,
  TemplateResponse,
  ChatResponse,
  StatusResponse,
  ChatMessage,
  AgentStatusResponse,
  AgentRunResponse,
  PromptGenerateRequest,
  PromptGenerateResponse,
  GithubSyncResponse,
  ResearchLeadsResponse,
  FindLeadsResponse,
  OutreachItem,
  NewDraft,
  Scorecard,
} from '../types';

const API_BASE = '/api';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Pull a human-readable message out of a FastAPI `detail` or a Tiga `error` body. */
function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const { detail, error } = body as { detail?: unknown; error?: unknown };
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const field = (d.loc ?? []).filter((p) => p !== 'body').join('.');
          return field ? `${field}: ${d.msg}` : String(d.msg);
        })
        .join('; ');
    }
    if (typeof error === 'string' && error) return error;
  }
  return `Request failed (HTTP ${status})`;
}

async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError("Can't reach the Tiga backend. Check that it is running on port 8000.");
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new ApiError(messageFrom(body, response.status), response.status);

  // Tiga reports many failures as HTTP 200 with { ok: false, error }.
  if (body && typeof body === 'object') {
    const { ok, error } = body as { ok?: unknown; error?: unknown };
    if (ok === false && typeof error === 'string' && error) throw new ApiError(error, response.status);
  }
  return body as T;
}

const post = <T>(endpoint: string, data?: unknown) =>
  request<T>(endpoint, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  getStatus: () => request<StatusResponse>('/status'),

  chat: (message: string, history: ChatMessage[] = []) =>
    post<ChatResponse>('/chat', {
      text: message,
      history: history.map(({ role, content }) => ({ role, content })),
    }),

  sendEmail: (data: SendEmailRequest) => post<SendEmailResponse>('/email/send', data),

  fetchEmails: (query = '', maxResults = 20, daysBack = 1) =>
    post<FetchEmailsResponse>('/email/fetch', { query, max_results: maxResults, days_back: daysBack }),

  getEmailSummary: (days = 1) => post<EmailSummaryResponse>('/email/summary', { days }),

  generateTemplate: (data: TemplateGenRequest) => post<TemplateResponse>('/email/template', data),

  async tts(text: string): Promise<Blob | null> {
    try {
      const response = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      return response.ok ? await response.blob() : null;
    } catch {
      return null;
    }
  },

  getAgentStatus: () => request<AgentStatusResponse>('/agents/status'),

  runAgents: () => post<AgentRunResponse>('/agents/run'),

  syncGithub: () => post<GithubSyncResponse>('/github/sync'),

  researchLeads: (topic: string, limit = 10) =>
    post<ResearchLeadsResponse>('/research/leads', { topic, limit }),

  findLeads: (topics: string[], limit = 30) => post<FindLeadsResponse>('/leads/find', { topics, limit }),

  listOutreach: (status = '') => request<{ ok: true; items: OutreachItem[] }>(`/outreach${status ? `?status=${status}` : ''}`),

  createDraft: (data: NewDraft) => post<{ ok: true; draft: OutreachItem }>('/outreach/drafts', data),

  editDraft: (id: number, changes: { subject?: string; body?: string }) =>
    request<{ ok: true; draft: OutreachItem }>(`/outreach/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  approveDraft: (id: number) => post<{ ok: true; draft: OutreachItem }>(`/outreach/${id}/approve`),

  rejectDraft: (id: number) => post<{ ok: true; draft: OutreachItem }>(`/outreach/${id}/reject`),

  sendNext: () => post<{ ok: true; sent: OutreachItem | null }>('/outreach/send-next'),

  checkReplies: () => post<{ ok: true; changed: number }>('/outreach/check-replies'),

  draftFollowups: () => post<{ ok: true; drafts: OutreachItem[] }>('/outreach/followups'),

  getScorecard: () => request<{ ok: true; scorecard: Scorecard }>('/outreach/scorecard'),

  generatePrompt: (data: PromptGenerateRequest) => post<PromptGenerateResponse>('/prompt/generate', data),

  async getEnvExample(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/env-example`);
    } catch {
      throw new ApiError("Can't reach the Tiga backend. Check that it is running on port 8000.");
    }
    if (!response.ok) throw new ApiError(`Request failed (HTTP ${response.status})`, response.status);
    return response.text();
  },
};
