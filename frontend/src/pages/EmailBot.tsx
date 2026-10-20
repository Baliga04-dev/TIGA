import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight, FileText, Loader2, Mail, Plus, RefreshCw, Search, Sparkles,
} from 'lucide-react';
import { useEmails, useEmailSummary } from '../hooks/useApi';
import { PageHeader, Card, Notice, Toast } from '../components/ui';
import { cn, formatRelativeTime, getSentimentColor, getSentimentLabel, isGmailSetupError } from '../lib/utils';
import type { ParsedEmail, ServiceType } from '../types';
import { ComposeDialog } from './email/ComposeDialog';
import { MessageDialog } from './email/MessageDialog';
import { TemplateDialog } from './email/TemplateDialog';
import { emptyDraft, replyDraft, topicLabel, type Draft } from './email/helpers';

type Dialog =
  | { kind: 'message'; email: ParsedEmail }
  | { kind: 'compose'; draft: Draft }
  | { kind: 'template'; service: ServiceType }
  | null;

type Filter = 'all' | 'cold' | 'replies' | 'positive';

const SHORTCUTS = [
  { title: 'Web dev cold email', hint: 'Generate a template for website projects', icon: Mail, tone: 'blue' },
  { title: 'Software dev cold email', hint: 'Generate a template for custom software', icon: Sparkles, tone: 'purple' },
  { title: 'Follow-up email', hint: 'A quick nudge after earlier outreach', icon: ArrowUpRight, tone: 'amber' },
  { title: 'Send proposal', hint: 'Start a proposal to a lead', icon: FileText, tone: 'green' },
] as const;

function matches(email: ParsedEmail, filter: Filter, query: string) {
  if (filter === 'cold' && !email.is_cold_email) return false;
  if (filter === 'replies' && !email.is_reply) return false;
  if (filter === 'positive' && email.sentiment !== 'positive') return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [email.email.subject, email.email.from, email.email.body].some((text) => text.toLowerCase().includes(q));
}

export function EmailBot() {
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(() =>
    params.get('compose') ? { kind: 'compose', draft: emptyDraft() }
      : params.get('template') ? { kind: 'template', service: 'web_development' }
      : null,
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const { summary, loading: summaryLoading, refetch: refetchSummary } = useEmailSummary(1);
  const { emails, loading: inboxLoading, error: inboxError, refetch: refetchInbox } = useEmails('', 50, 7);

  const close = () => {
    setDialog(null);
    if (params.size > 0) setParams({}, { replace: true });
  };
  const refresh = () => {
    refetchSummary();
    refetchInbox();
  };
  const compose = (draft: Draft) => setDialog({ kind: 'compose', draft });

  const visible = (emails?.emails ?? []).filter((e) => matches(e, filter, query));
  const busy = summaryLoading || inboxLoading;

  const runShortcut = (title: (typeof SHORTCUTS)[number]['title']) => {
    if (title === 'Web dev cold email') setDialog({ kind: 'template', service: 'web_development' });
    else if (title === 'Software dev cold email') setDialog({ kind: 'template', service: 'software_development' });
    else if (title === 'Follow-up email') compose(emptyDraft({ subject: 'Follow up', body: 'Hi,\n\nJust following up on my previous email…\n\nBest,' }));
    else compose(emptyDraft({ subject: 'Proposal', body: "Hi,\n\nThanks for your interest. Here's my proposal…\n\nBest," }));
  };

  return (
    <>
      <PageHeader
        title="Email Bot"
        description="Cold email outreach, inbox monitoring and summaries for freelancing"
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={busy} className="btn btn-secondary btn-sm">
              <RefreshCw className={cn('size-4', busy && 'animate-spin')} aria-hidden="true" />
              Refresh
            </button>
            <button onClick={() => setDialog({ kind: 'template', service: 'web_development' })} className="btn btn-primary btn-sm">
              <Sparkles className="size-4" aria-hidden="true" />
              New template
            </button>
            <button onClick={() => compose(emptyDraft())} className="btn btn-success btn-sm">
              <Plus className="size-4" aria-hidden="true" />
              Compose
            </button>
          </div>
        }
      />

      {inboxError && (
        <div className="mb-6">
          <Notice
            title="Couldn't load your inbox"
            action={
              isGmailSetupError(inboxError) ? (
                <Link to="/settings" className="btn btn-secondary btn-sm shrink-0">Open Settings</Link>
              ) : undefined
            }
          >
            {inboxError}
          </Notice>
        </div>
      )}

      <dl aria-label="Today's summary" className="mb-8 flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4">
        {[
          ['Total emails', summary?.total_emails],
          ['Cold outreach', summary?.cold_emails],
          ['Replies', summary?.replies_received],
          ['Positive', summary?.positive_responses],
        ].map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-2">
            <dd className="font-serif text-3xl font-semibold tabular-nums">{summary ? value : '–'}</dd>
            <dt className="text-sm text-ink-2">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map(({ title, hint, icon: Icon }) => (
          <button key={title} onClick={() => runShortcut(title)} className="btn btn-secondary items-start justify-start p-4 text-left">
            <Icon className="mt-0.5 size-4 shrink-0 text-pen" aria-hidden="true" />
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-xs font-normal text-ink-2">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <Card title="Inbox">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search emails"
              placeholder="Search emails…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="input py-2 px-3 text-sm w-auto">
            <option value="all">All</option>
            <option value="cold">Cold emails</option>
            <option value="replies">Replies</option>
            <option value="positive">Positive</option>
          </select>
        </div>

        <div className="border border-rule rounded-lg overflow-x-auto">
          <table className="w-full text-sm" aria-busy={inboxLoading}>
            <thead>
              <tr className="bg-wash border-b border-rule text-left text-ink-2">
                <th scope="col" className="px-4 py-3 font-medium">Subject</th>
                <th scope="col" className="px-4 py-3 font-medium">From</th>
                <th scope="col" className="px-4 py-3 font-medium w-32">Received</th>
                <th scope="col" className="px-4 py-3 font-medium">Type</th>
                <th scope="col" className="px-4 py-3 font-medium w-24">Sentiment</th>
                <th scope="col" className="px-4 py-3 w-12"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {inboxLoading && !emails ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                    <Loader2 className="size-6 animate-spin mx-auto mb-2 text-pen" aria-hidden="true" />
                    Loading emails…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                    {inboxError
                      ? 'Nothing to show until the inbox loads.'
                      : emails && emails.emails.length > 0
                        ? 'No emails match your search.'
                        : 'No emails in the last 7 days.'}
                  </td>
                </tr>
              ) : (
                visible.map((item) => (
                  <tr key={item.email.id} className="border-b border-rule hover:bg-wash">
                    <td className="px-4 py-3 max-w-xs">
                      <button
                        onClick={() => setDialog({ kind: 'message', email: item })}
                        className="block max-w-full truncate text-left font-medium hover:underline"
                        title={item.email.subject}
                      >
                        {item.email.subject || '(no subject)'}
                      </button>
                      <div className="text-xs text-ink-3 truncate">{item.summary}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={item.email.from}>{item.email.from}</td>
                    <td className="px-4 py-3 text-ink-3">{formatRelativeTime(item.email.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {item.is_cold_email && <span className="badge badge-blue text-xs">Cold</span>}
                        {item.is_reply && <span className="badge badge-amber text-xs">Reply</span>}
                        {item.key_topics.map((t) => <span key={t} className="badge badge-gray text-xs">{topicLabel(t)}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('badge text-xs', getSentimentColor(item.sentiment))}>{getSentimentLabel(item.sentiment)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => compose(replyDraft(item))}
                        className="btn btn-ghost btn-sm p-1.5"
                        aria-label={`Reply to ${item.email.subject || 'this email'}`}
                      >
                        <Mail className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog?.kind === 'message' && (
        <MessageDialog parsed={dialog.email} onClose={close} onReply={() => compose(replyDraft(dialog.email))} />
      )}
      {dialog?.kind === 'compose' && (
        <ComposeDialog
          draft={dialog.draft}
          onClose={close}
          onSent={() => {
            close();
            setToast('Email sent');
            refresh();
          }}
        />
      )}
      {dialog?.kind === 'template' && (
        <TemplateDialog
          service={dialog.service}
          onClose={close}
          onUse={(t) => compose(emptyDraft({ subject: t.subject, body: t.body }))}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
