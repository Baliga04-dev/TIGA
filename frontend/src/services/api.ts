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
} from '../types';

const API_BASE = '/api';

async function fetchJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  async getStatus(): Promise<StatusResponse> {
    return fetchJson<StatusResponse>('/status');
  },

  async chat(message: string, history: ChatMessage[] = []): Promise<ChatResponse> {
    return fetchJson<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ text: message, history }),
    });
  },

  async sendEmail(data: SendEmailRequest): Promise<SendEmailResponse> {
    return fetchJson<SendEmailResponse>('/email/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async fetchEmails(query = '', maxResults = 20, daysBack = 1): Promise<FetchEmailsResponse> {
    return fetchJson<FetchEmailsResponse>('/email/fetch', {
      method: 'POST',
      body: JSON.stringify({ query, max_results: maxResults, days_back: daysBack }),
    });
  },

  async getEmailSummary(days = 1): Promise<EmailSummaryResponse> {
    return fetchJson<EmailSummaryResponse>('/email/summary', {
      method: 'POST',
      body: JSON.stringify({ days }),
    });
  },

  async generateTemplate(data: TemplateGenRequest): Promise<TemplateResponse> {
    return fetchJson<TemplateResponse>('/email/template', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async tts(text: string): Promise<Blob | null> {
    const response = await fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) return null;
    return response.blob();
  },

  async getAgentStatus(): Promise<AgentStatusResponse> {
    return fetchJson<AgentStatusResponse>('/agents/status');
  },

  async runAgents(): Promise<AgentRunResponse> {
    return fetchJson<AgentRunResponse>('/agents/run', { method: 'POST' });
  },

  async syncGithub(): Promise<GithubSyncResponse> {
    return fetchJson<GithubSyncResponse>('/github/sync', { method: 'POST' });
  },

  async generatePrompt(data: PromptGenerateRequest): Promise<PromptGenerateResponse> {
    return fetchJson<PromptGenerateResponse>('/prompt/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};