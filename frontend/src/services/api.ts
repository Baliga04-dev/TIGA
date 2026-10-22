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
  GithubSyncResponse,
  FindLeadsResponse,
  OutreachItem,
  NewDraft,
  Scorecard,
  ReportRow,
  ReportPreview,
  Issue,
  AuditEntry,
  Interview,
  Deal,
  MoneySummary,
  Rate,
  DealDocument,
  Reminder,
  Routine,
  Meeting,
  DevStatus,
  Note,
  Briefing,
  AiUsage,
  AiCall,
  ChatLogEntry,
  Prospect,
  AnalystStatus,
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

  findLeads: (topics: string[], limit = 30) => post<FindLeadsResponse>('/leads/find', { topics, limit }),

  listOutreach: (status = '') => request<{ ok: true; items: OutreachItem[] }>(`/outreach${status ? `?status=${status}` : ''}`),

  createDraft: (data: NewDraft) => post<{ ok: true; draft: OutreachItem }>('/outreach/drafts', data),

  autoDraft: (data: { email: string; lead_title?: string; lead_url?: string; signals?: string[]; company?: string; source_note?: string }) =>
    post<{ ok: true; draft: OutreachItem }>('/outreach/auto-draft', data),

  editDraft: (id: number, changes: { subject?: string; body?: string }) =>
    request<{ ok: true; draft: OutreachItem }>(`/outreach/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  approveDraft: (id: number) => post<{ ok: true; draft: OutreachItem }>(`/outreach/${id}/approve`),

  rejectDraft: (id: number) => post<{ ok: true; draft: OutreachItem }>(`/outreach/${id}/reject`),

  sendNext: () => post<{ ok: true; sent: OutreachItem | null }>('/outreach/send-next'),

  checkReplies: () => post<{ ok: true; changed: number }>('/outreach/check-replies'),

  draftFollowups: () => post<{ ok: true; drafts: OutreachItem[] }>('/outreach/followups'),

  getScorecard: () => request<{ ok: true; scorecard: Scorecard }>('/outreach/scorecard'),

  listReports: () => request<{ ok: true; items: ReportRow[] }>('/reports'),

  previewReport: () => request<ReportPreview>('/reports/preview'),

  runDailyNow: () => post<{ ok: true; emailed: boolean; email_error: string }>('/reports/daily/run'),

  listIssues: () => request<{ ok: true; items: Issue[] }>('/issues'),

  transitionIssue: (id: number, status: string) =>
    post<{ ok: true; issue: Issue }>(`/issues/${id}/transition`, { status }),

  getAudit: () => request<{ ok: true; items: AuditEntry[] }>('/audit'),

  startInterview: (idea: string) => post<{ ok: true; interview: Interview }>('/interviews', { idea }),

  answerInterview: (id: string, text: string) =>
    post<{ ok: true; interview: Interview }>(`/interviews/${id}/answer`, { text }),

  generateInterviewPrompt: (id: string) => post<{ ok: true; prompt: string }>(`/interviews/${id}/generate`),

  listDeals: () => request<{ ok: true; items: Deal[]; money: MoneySummary }>('/deals'),

  createDeal: (data: Partial<Deal> & { email: string }) => post<{ ok: true; deal: Deal }>('/deals', data),

  editDeal: (id: number, changes: Partial<Pick<Deal, 'contact' | 'company' | 'phone' | 'service' | 'amount' | 'notes'>>) =>
    request<{ ok: true; deal: Deal }>(`/deals/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  moveDeal: (id: number, stage: string) => post<{ ok: true; deal: Deal }>(`/deals/${id}/move`, { stage }),

  recordPayment: (id: number, kind: 'advance' | 'balance', amount: number) =>
    post<{ ok: true; deal: Deal }>(`/deals/${id}/payment`, { kind, amount }),

  getRates: () => request<{ ok: true; rates: Rate[] }>('/pricing'),

  saveRates: (rates: Rate[]) => request<{ ok: true; rates: Rate[] }>('/pricing', { method: 'PUT', body: JSON.stringify({ rates }) }),

  writeProposal: (dealId: number, items: { rate_id: string; qty: number }[]) =>
    post<{ ok: true; document: { id: number; total: number }; draft: OutreachItem | null }>(`/deals/${dealId}/proposal`, { items }),

  writeInvoice: (dealId: number, kind: 'advance' | 'balance') =>
    post<{ ok: true; document: { id: number; number: string; amount: number }; draft: OutreachItem | null }>(`/deals/${dealId}/invoice`, { kind }),

  listDealDocuments: (dealId: number) => request<{ ok: true; items: DealDocument[] }>(`/deals/${dealId}/documents`),

  getBriefing: () => request<Briefing>('/briefing'),

  dueReminders: () => request<{ ok: true; items: Reminder[] }>('/reminders/due'),

  listReminders: () => request<{ ok: true; items: Reminder[] }>('/reminders'),

  addReminder: (text: string, when: string) => post<{ ok: true; reminder: Reminder }>('/reminders', { text, when }),

  closeReminder: (id: number, outcome: 'done' | 'dismissed') => post<{ ok: boolean }>(`/reminders/${id}/${outcome}`),

  devStatus: () => request<DevStatus>('/dev'),

  runDev: (issueId: number) => post<{ ok: true; started: boolean }>('/dev/run', { issue_id: issueId }),

  listMeetings: () => request<{ ok: true; items: Meeting[] }>('/meetings'),

  getMeeting: (id: number) => request<{ ok: true; meeting: Meeting }>(`/meetings/${id}`),

  deleteMeeting: (id: number) => request<{ ok: boolean }>(`/meetings/${id}`, { method: 'DELETE' }),

  /** The recording goes up as the raw body; the server answers at once and writes the notes in the background. */
  uploadMeeting: (title: string, audio: Blob) =>
    request<{ ok: true; meeting: Meeting }>(`/meetings?title=${encodeURIComponent(title)}`, {
      method: 'POST',
      body: audio,
      headers: { 'Content-Type': audio.type || 'audio/webm' },
    }),

  listRoutines: () => request<{ ok: true; items: Routine[] }>('/routines'),

  addRoutine: (command: string, when: string) => post<{ ok: true; routine: Routine }>('/routines', { command, when }),

  setRoutineActive: (id: number, active: boolean) => post<{ ok: boolean }>(`/routines/${id}`, { active }),

  deleteRoutine: (id: number) => request<{ ok: boolean }>(`/routines/${id}`, { method: 'DELETE' }),

  listNotes: () => request<{ ok: true; items: Note[] }>('/notes'),

  addNote: (text: string) => post<{ ok: true; note: Note }>('/notes', { text }),

  deleteNote: (id: number) => request<{ ok: boolean }>(`/notes/${id}`, { method: 'DELETE' }),

  getBridgeStatus: () => request<{ ok: true; connected: boolean; configured: boolean }>('/bridge/status'),

  getBridgeSetup: () => request<{ ok: true; token: string; server: string }>('/bridge/setup'),

  getAiUsage: (days = 7) => request<AiUsage>(`/ai/usage?days=${days}`),

  listAiCalls: (feature = '') => request<{ ok: true; items: AiCall[] }>(`/ai/calls?limit=100${feature ? `&feature=${encodeURIComponent(feature)}` : ''}`),

  getChatHistory: () => request<{ ok: true; items: ChatLogEntry[] }>('/chat/history?limit=100'),

  confirmAction: (pendingId: string) =>
    post<{ ok: boolean; action?: { ok: boolean; result: Record<string, unknown> }; error?: string }>(`/actions/${pendingId}/confirm`),

  cancelAction: (pendingId: string) => post<{ ok: boolean }>(`/actions/${pendingId}/cancel`),

  getAssistant: () => request<{ ok: true; paused: boolean }>('/assistant'),

  setAssistantPaused: (paused: boolean) => post<{ ok: true; paused: boolean }>('/assistant', { paused }),

  listSkills: () => request<{ ok: true; items: string[] }>('/skills'),

  readSkill: (name: string) => request<{ ok: true; name: string; text: string }>(`/skills/${name}`),

  saveSkill: (name: string, text: string) =>
    request<{ ok: true }>(`/skills/${name}`, { method: 'PUT', body: JSON.stringify({ text }) }),

  runRnd: () => post<{ ok: true; proposals?: number; skipped?: string }>('/rnd/run'),

  getFeatures: () => request<{ learn: boolean }>('/features'),

  listLessons: () => request<{ lessons: { name: string; title: string }[] }>('/learn/lessons'),

  getMission: () => request<{ text: string }>('/learn/mission'),

  listProspects: (status = '') =>
    request<{ ok: true; items: Prospect[]; counts: Record<string, number> }>(`/prospects${status ? `?status=${status}` : ''}`),

  addProspectEmail: (id: number, email: string) =>
    post<{ ok: true; draft: OutreachItem }>(`/prospects/${id}/contact`, { email }),

  skipProspect: (id: number) => post<{ ok: true }>(`/prospects/${id}/skip`),

  getAnalystStatus: () => request<AnalystStatus>('/analyst/status'),

  runAnalyst: (phase: 'collect' | 'write') =>
    post<{ ok: true; result: { phase: string; drafted?: number; new?: number; checked?: number; errors: string[] } }>('/analyst/run', { phase }),

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
