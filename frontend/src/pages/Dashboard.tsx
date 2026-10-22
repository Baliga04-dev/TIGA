import { Link } from 'react-router-dom';
import { Bot, Loader2, Mail, RefreshCw, Sparkles } from 'lucide-react';
import { useEmailSummary } from '../hooks/useApi';
import { PageHeader, Card, Notice } from '../components/ui';
import { DeskSummary } from '../components/DeskSummary';
import { RemindersNotes, TodayPanel } from '../components/TodayPanel';
import { cn, formatRelativeTime, isGmailSetupError } from '../lib/utils';

/** "Alex Doe <alex@acme.com>" -> "Alex Doe" */
const senderName = (from: string) => from.replace(/<.*>/, '').trim() || from;

export function Dashboard() {
  const { summary, loading, error, refetch } = useEmailSummary(7);
  const count = (n: number | undefined) => (summary ? n ?? 0 : '–');

  const figures = [
    { label: 'Total Emails', value: count(summary?.total_emails) },
    { label: 'Cold Outreach', value: count(summary?.cold_emails) },
    { label: 'Replies Received', value: count(summary?.replies_received) },
    { label: 'Positive Responses', value: count(summary?.positive_responses) },
  ];
  const positive = (summary?.emails ?? []).filter((e) => e.sentiment === 'positive').slice(0, 8);
  const topics = Object.entries(summary?.top_topics ?? {});
  const topCount = Math.max(1, ...topics.map(([, n]) => n));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What to do next, and how outreach is going."
        action={
          <button onClick={refetch} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      <TodayPanel />
      <div className="mb-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <RemindersNotes />
        <DeskSummary />
      </div>

      <h2 className="mb-1 text-lg font-semibold">Inbox, last 7 days</h2>
      <p className="mb-4 text-sm text-ink-2">From your Gmail, once it's connected.</p>
      {error && (
        <div className="mb-8">
          <Notice
            title="Couldn't load your email numbers"
            action={
              isGmailSetupError(error) ? (
                <Link to="/settings" className="btn btn-secondary btn-sm shrink-0">Open Settings</Link>
              ) : undefined
            }
          >
            {error}
          </Notice>
        </div>
      )}

      {!(error && isGmailSetupError(error)) && (
        <>
      <dl className="mb-10 flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4">
        {figures.map((f) => (
          <div key={f.label} className="flex items-baseline gap-2">
            <dd className="figure text-3xl">{f.value}</dd>
            <dt className="text-sm text-ink-2">{f.label}</dt>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-5">
        <div className="space-y-10 lg:col-span-3">
          <Card title="Recent positive replies">
            {positive.length > 0 ? (
              <ul className="divide-y divide-rule">
                {positive.map((item) => (
                  <li key={item.email.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{senderName(item.email.from)}</p>
                      <p className="truncate text-sm text-ink-2">{item.email.subject}</p>
                      <p className="mt-1 text-sm text-ink-2">{item.summary}</p>
                    </div>
                    <span className="shrink-0 text-sm text-ink-3">{formatRelativeTime(item.email.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">No positive responses this week.</p>
            )}
          </Card>

          <Card title="Top topics this week">
            {loading ? (
              <Loader2 className="size-6 animate-spin text-pen" aria-label="Loading" />
            ) : topics.length > 0 ? (
              <ul className="space-y-3">
                {topics.map(([topic, n]) => (
                  <li key={topic} className="grid grid-cols-[10rem_1fr_2rem] items-center gap-3">
                    <span className="truncate">{topic.replace(/_/g, ' ')}</span>
                    <span className="h-2 rounded-sm bg-wash" aria-hidden="true">
                      <span className="block h-full rounded-sm bg-pen" style={{ width: `${(n / topCount) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-ink-2">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">No topic data yet.</p>
            )}
          </Card>
        </div>

        <div className="space-y-10 lg:col-span-2">
          <Card title="Action items">
            {summary && summary.action_items.length > 0 ? (
              <ul className="space-y-3">
                {summary.action_items.slice(0, 8).map((item, i) => (
                  <li key={`${i}-${item}`} className="leading-relaxed">
                    <span className="highlight">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-3">Nothing to do yet. Action items from replies will show up here.</p>
            )}
          </Card>

          <Card title="Quick start">
            <div className="flex flex-col gap-2">
              <Link to="/email?template=1" className="btn btn-primary justify-start gap-3">
                <Sparkles className="size-4" aria-hidden="true" />
                <span>Generate Cold Email Template</span>
              </Link>
              <Link to="/email?compose=1" className="btn btn-secondary justify-start gap-3">
                <Mail className="size-4" aria-hidden="true" />
                <span>Compose New Email</span>
              </Link>
              <Link to="/chat" className="btn btn-secondary justify-start gap-3">
                <Bot className="size-4" aria-hidden="true" />
                <span>Chat with Tiga</span>
              </Link>
            </div>
          </Card>
        </div>
      </div>
        </>
      )}
    </>
  );
}
