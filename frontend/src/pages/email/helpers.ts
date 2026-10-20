import type { ParsedEmail } from '../../types';
import { formatDate } from '../../lib/utils';

export interface Draft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

export const emptyDraft = (over: Partial<Draft> = {}): Draft => ({ to: '', cc: '', bcc: '', subject: '', body: '', ...over });

/** "Alex Doe <alex@acme.com>" -> "alex@acme.com" */
export function senderAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

export function replyDraft(parsed: ParsedEmail): Draft {
  const { email } = parsed;
  return emptyDraft({
    to: senderAddress(email.from),
    subject: `Re: ${email.subject.replace(/^(\s*re\s*:\s*)+/i, '')}`,
    body: `\n\n---\nOn ${formatDate(email.date)}, ${email.from} wrote:\n${email.body}`,
  });
}

const TOPIC_LABELS: Record<string, string> = {
  web_development: 'Web dev',
  mobile_development: 'Mobile',
  ai_ml: 'AI/ML',
  freelance: 'Freelance',
  agency: 'Agency',
  ecommerce: 'E-commerce',
  saas: 'SaaS',
};

export const topicLabel = (topic: string) => TOPIC_LABELS[topic] ?? topic.replace(/_/g, ' ');

/** Only http(s) links are ever rendered as links. */
export function safeUrl(value: string): string | null {
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  return /^https?:\/\//i.test(url) ? url : null;
}
