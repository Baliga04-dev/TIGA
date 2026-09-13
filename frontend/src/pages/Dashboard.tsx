import { useEmailSummary } from '../hooks/useApi';
import { Layout, PageHeader, Card } from '../components/Layout';
import { cn, formatRelativeTime } from '../lib/utils';
import {
  Mail,
  TrendingUp,
  ArrowUpRight,
  Clock,
  CheckCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Bot,
} from 'lucide-react';

export function Dashboard() {
  const { summary, loading, error, refetch } = useEmailSummary(7);

  const stats = [
    { label: 'Total Emails', value: summary?.total_emails || 0, icon: Mail, color: 'text-[var(--accent-blue)]' },
    { label: 'Cold Outreach', value: summary?.cold_emails || 0, icon: ArrowUpRight, color: 'text-[var(--accent-blue)]' },
    { label: 'Replies Received', value: summary?.replies_received || 0, icon: CheckCircle, color: 'text-[var(--accent-green)]' },
    { label: 'Positive Responses', value: summary?.positive_responses || 0, icon: TrendingUp, color: 'text-[var(--accent-amber)]' },
  ];

  return (
    <Layout>
      <PageHeader
        title="Dashboard"
        description="Overview of your email outreach and freelancing pipeline"
        action={
          <button onClick={refetch} disabled={loading} className="btn btn-secondary btn-sm">
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, i) => (
          <Card key={i} className="hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', stat.color + '/10')}>
                <stat.icon className={cn('size-6', stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</p>
                <p className="text-sm text-[var(--text-muted)]">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card title="Top Topics This Week">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-8 animate-spin text-[var(--accent-blue)]" />
            </div>
          ) : error ? (
            <p className="text-[var(--accent-red)]">{error}</p>
          ) : summary?.top_topics && Object.keys(summary.top_topics).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(summary.top_topics).map(([topic, count]) => (
                <div key={topic} className="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <span className="font-medium">{topic.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-[var(--border-color)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--accent-blue)] rounded-full transition-all"
                        style={{ width: `${(count / (summary.total_emails || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono text-[var(--text-secondary)] w-10 text-right">{count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">No topic data available</p>
          )}
        </Card>

        <Card title="Action Items">
          {summary?.action_items && summary.action_items.length > 0 ? (
            <ul className="space-y-3">
              {summary.action_items.slice(0, 8).map((item, i) => (
                <li key={i} className="flex items-start gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <Clock className="size-5 text-[var(--accent-amber)] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[var(--text-secondary)]">{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">No action items extracted</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Recent Positive Responses" className="lg:col-span-2">
          {summary?.emails && summary.emails.length > 0 ? (
            <div className="space-y-3">
              {summary.emails
                .filter(e => e.sentiment === 'positive')
                .slice(0, 10)
                .map((email) => (
                  <div
                    key={email.email.id}
                    className="p-3 bg-[var(--bg-tertiary)] rounded-lg hover:bg-[var(--border-color)]/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{email.email.subject}</p>
                        <p className="text-sm text-[var(--text-muted)] truncate">{email.email.from}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">{email.summary}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span>{formatRelativeTime(email.email.date)}</span>
                        <span className={cn('badge text-xs', 'badge-green')}>Positive</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-8">No positive responses this week</p>
          )}
        </Card>

        <Card title="Quick Start">
          <div className="space-y-3">
            <button className="btn btn-primary w-full justify-start gap-3" onClick={() => window.location.href = '/email'}>
              <Sparkles className="size-5" />
              <span>Generate Cold Email Template</span>
            </button>
            <button className="btn btn-secondary w-full justify-start gap-3" onClick={() => window.location.href = '/email'}>
              <Mail className="size-5" />
              <span>Compose New Email</span>
            </button>
            <button className="btn btn-secondary w-full justify-start gap-3" onClick={() => window.location.href = '/chat'}>
              <Bot className="size-5" />
              <span>Chat with Tiga</span>
            </button>
            <div className="divider" />
            <p className="text-sm text-[var(--text-muted)]">
              Need help? Ask Tiga: <br />
              <span className="font-mono">"Generate a web dev cold email template"</span>
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}