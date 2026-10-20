import type { EmailSummaryResponse, ParsedEmail, StatusResponse } from '../types'

export function parsedEmail(over: Partial<ParsedEmail['email']> = {}, flags: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    email: {
      id: 'e1',
      thread_id: 't1',
      subject: 'Re: your proposal',
      from: 'Alex Doe <alex@acme.com>',
      to: 'me@example.com',
      date: 'Mon, 20 Oct 2026 10:00:00 +0000',
      snippet: 'Sounds great',
      body: 'Sounds great, let us talk.',
      labels: ['INBOX'],
      ...over,
    },
    is_cold_email: false,
    is_reply: true,
    key_topics: ['web_development'],
    action_items: [],
    contact_info: { emails: ['alex@acme.com'], phones: ['+1 415-555-0132'], linkedin: [], websites: [] },
    sentiment: 'positive',
    summary: 'Alex wants to talk',
    ...flags,
  }
}

export const summaryOk: EmailSummaryResponse = {
  ok: true,
  source: 'live',
  period_days: 7,
  total_emails: 12,
  cold_emails: 5,
  replies_received: 3,
  positive_responses: 2,
  action_items: ['Send the pricing sheet to Alex'],
  top_topics: { web_development: 4, ai_ml: 2 },
  emails: [parsedEmail()],
  ms: 5,
}

export const statusOk: StatusResponse = {
  name: 'Tiga',
  brain: 'builtin',
  tts: 'browser',
  metrics_endpoint: false,
  booking_webhook: false,
  gmail_configured: true,
  version: '0.2.0',
  github_repository: 'Baliga04-dev/TIGA',
  agents: ['manager', 'dev', 'tester'],
}

export const gmailNotAuthorized = {
  ok: false,
  error: 'Gmail is not authorized yet. Run `python gmail_auth.py` from the tiga folder to authorize it.',
  ms: 1,
}
