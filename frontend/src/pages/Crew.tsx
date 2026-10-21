import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Notice } from '../components/ui';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import type { AuditEntry, Issue } from '../types';

/** What the user may do next from each state; everything else is done by the bots. */
const YOUR_MOVES: Record<string, { label: string; to: string }[]> = {
  open: [{ label: 'Triage', to: 'triaged' }, { label: 'Reject', to: 'rejected' }],
  triaged: [{ label: 'Approve for Dev', to: 'approved' }, { label: 'Reject', to: 'rejected' }],
  approved: [{ label: 'Reject', to: 'rejected' }],
  pr_open: [{ label: 'Mark tested', to: 'tested' }, { label: 'Reject', to: 'rejected' }],
  tested: [{ label: 'Mark done', to: 'done' }],
};

export function Crew() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [i, a] = await Promise.all([api.listIssues(), api.getAudit()]);
      setIssues(i.items);
      setAudit(a.items.slice(-15).reverse());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the issue board');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const move = async (issue: Issue, status: string) => {
    try {
      await api.transitionIssue(issue.id, status);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change was refused');
    }
  };

  const open = issues.filter((i) => !['done', 'rejected'].includes(i.status));
  const closed = issues.filter((i) => ['done', 'rejected'].includes(i.status));

  return (
    <>
      <PageHeader
        title="Crew"
        description="Bugs and improvements the Manager, Tester and R&D bots have found. Dev only starts on what you approve."
      />
      {error && <div className="mb-6"><Notice title="Something went wrong">{error}</Notice></div>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title={`Open (${open.length})`} raised>
          {open.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing open. The bots will file issues here as they find them.</p>
          ) : (
            <ul className="space-y-4">
              {open.map((issue) => (
                <li key={issue.id} className="text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">#{issue.id} {issue.title}</span>
                    <span className={cn('badge', issue.kind === 'bug' ? 'badge-red' : 'badge-blue')}>{issue.kind}</span>
                    <span className="badge badge-gray">{issue.status}</span>
                    {issue.occurrences > 1 && <span className="text-xs text-ink-3">seen {issue.occurrences} times</span>}
                  </p>
                  {issue.body && <p className="mt-1 text-ink-2">{issue.body}</p>}
                  <p className="text-xs text-ink-3">filed by {issue.source}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(YOUR_MOVES[issue.status] ?? []).map((m) => (
                      <button key={m.to} className={cn('btn btn-sm', m.to === 'rejected' ? 'btn-ghost' : 'btn-secondary')} onClick={() => move(issue, m.to)}>
                        {m.label} <span className="sr-only">#{issue.id}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {closed.length > 0 && <p className="mt-4 text-xs text-ink-3">{closed.length} closed</p>}
        </Card>

        <Card title="Recent activity">
          {audit.length === 0 ? (
            <p className="text-sm text-ink-2">No activity yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {audit.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.actor}</span> {e.action} <span className="text-ink-2">{e.detail}</span>
                  <span className="ml-2 text-xs text-ink-3">{new Date(e.ts).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
