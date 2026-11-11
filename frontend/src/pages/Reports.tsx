import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Loader2, Send } from 'lucide-react';
import { PageHeader, Card, Notice, Toast } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import { cn } from '../lib/utils';
import { REPORT_GROUPS, groupOf, parseReport, reportDate, type ReportGroup } from '../lib/report';
import { ReportView } from './reports/ReportView';
import type { Issue, ReportPreview, ReportRow } from '../types';

const DOT = { red: 'bg-flag', amber: 'bg-mark', green: 'bg-ledger' } as const;
const KIND_LABEL: Record<string, string> = { improvement: 'Proposal', idea: 'Business idea', bug: 'Bug' };
const LIST_LABEL: Record<string, string> = { daily: 'Daily report', weekly: 'Research report', research: 'Research report, run by hand', marketing: 'Marketing report' };

/** What the owner has to do about an issue: a research proposal's first step, or the first line of its note. */
function nextStep(body: string): string {
  const step = /^First step:\s*(.+)$/m.exec(body);
  return (step ? step[1] : body.split('\n')[0]).trim();
}

/** What the bots have proposed and are waiting on the owner for, in one place. */
function WaitingOnYou({ issues }: { issues: Issue[] | null }) {
  if (!issues) return <div aria-busy="true" aria-label="Loading what's waiting" className="h-20 animate-pulse rounded-lg bg-wash" />;
  return (
    <Card title={`Waiting for your decision (${issues.length})`} raised>
      {issues.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing waiting. New proposals from the research report show up here.</p>
      ) : (
        <ul className="divide-y divide-rule text-sm">
          {issues.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <span className="figure w-8 text-ink-3">#{i.id}</span>
              <span className="min-w-0 flex-1">
                {i.title}
                {i.body && <span className="mt-0.5 block text-ink-2">{nextStep(i.body)}</span>}
              </span>
              <span className="badge badge-gray">{KIND_LABEL[i.kind] ?? i.kind}</span>
              {i.occurrences > 1 && <span className="text-xs text-ink-3">seen {i.occurrences} times</span>}
            </li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <p className="mt-3 text-sm text-ink-2">Read the reasons on the <Link to="/crew" className="text-pen underline">Crew page</Link>, then approve or reject each one.</p>
      )}
    </Card>
  );
}

export function Reports() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [filter, setFilter] = useState<ReportGroup | 'all'>('all');
  const [openId, setOpenId] = useState<number | 'preview' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows((await api.listReports()).items);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load reports');
    }
    api.listIssues().then((r) => setIssues(r.items.filter((i) => i.status === 'open' || i.status === 'triaged'))).catch(() => setIssues([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const preview = useAction<[], ReportPreview>(async () => {
    const out = await api.previewReport();
    setOpenId('preview');
    return out;
  });
  const run = useAction(async () => {
    const out = await api.runDailyNow();
    await refresh();
    setOpenId(null);
    setToast(out.emailed ? "Today's report was emailed and saved here." : 'Report saved here. It was not emailed: ' + (out.email_error || 'already sent today') + '.');
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows ?? []) { const g = groupOf(r.kind); if (g) c[g] = (c[g] ?? 0) + 1; }
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => filter === 'all' || groupOf(r.kind) === filter);
  const open = openId === 'preview' ? null : shown.find((r) => r.id === openId) ?? shown[0];

  return (
    <>
      <PageHeader
        title="Reports"
        description="The daily report, the weekly research report and the weekly marketing report, all saved here whether or not email works."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => preview.run()} disabled={preview.pending}>
              {preview.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              Preview today's report
            </button>
            <button className="btn btn-primary" onClick={() => run.run()} disabled={run.pending}>
              {run.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              Build and send now
            </button>
          </div>
        }
      />
      {loadError && <div className="mb-6"><Notice title="Couldn't load reports">{loadError}</Notice></div>}
      {preview.error && <div className="mb-6"><Notice>{preview.error}</Notice></div>}
      {run.error && <div className="mb-6"><Notice>{run.error}</Notice></div>}

      <div className="mb-8"><WaitingOnYou issues={issues} /></div>

      <div role="group" aria-label="Show reports" className="mb-4 flex flex-wrap gap-2">
        {[{ id: 'all' as const, label: 'All' }, ...REPORT_GROUPS].map((g) => (
          <button key={g.id} className="btn btn-secondary btn-sm aria-pressed:border-pen aria-pressed:bg-pen/10" aria-pressed={filter === g.id}
            onClick={() => { setFilter(g.id); setOpenId(null); }}>
            {g.label} <span className="figure text-ink-2">{counts[g.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <nav aria-label="Saved reports" className="min-w-0">
          {rows === null && !loadError && <div aria-busy="true" aria-label="Loading reports" className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-wash" />)}</div>}
          {rows && shown.length === 0 && <p className="text-sm text-ink-2">No reports of this kind yet.</p>}
          <ul className="space-y-1.5">
            {preview.result && (
              <li>
                <button onClick={() => setOpenId('preview')} aria-current={openId === 'preview' ? 'true' : undefined}
                  className={cn('w-full rounded-lg border px-3 py-2 text-left text-sm', openId === 'preview' ? 'border-pen bg-pen/10' : 'border-dashed border-rule hover:bg-wash')}>
                  <span className="font-medium">Today, as it stands</span>
                  <span className="block text-xs text-ink-3">Preview, not saved or sent</span>
                </button>
              </li>
            )}
            {shown.map((r) => {
              const status = groupOf(r.kind) === 'daily' ? parseReport(r.body).status : '';
              const current = openId !== 'preview' && open?.id === r.id;
              return (
                <li key={r.id}>
                  <button onClick={() => setOpenId(r.id)} aria-current={current ? 'true' : undefined}
                    className={cn('flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm', current ? 'border-pen bg-pen/10' : 'border-transparent hover:bg-wash')}>
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', status ? DOT[status] : 'bg-rule')} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium">{LIST_LABEL[r.kind] ?? r.subject}</span>
                      <span className={cn('block text-xs', current ? 'text-ink-2' : 'text-ink-3')}>{reportDate(r.report_date)}, {r.sent_at ? 'emailed' : 'saved here'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <Card raised className="min-w-0">
          {openId === 'preview' && preview.result ? (
            <ReportView label="Report preview" body={preview.result.body} kind="daily" date={preview.result.date}
              delivery="Preview: nothing has been saved or sent." />
          ) : open ? (
            <ReportView label="Report body" body={open.body} kind={open.kind} date={open.report_date}
              delivery={open.sent_at ? `Emailed to ${open.recipient}.` : `Saved here, not emailed${open.delivery_error ? `: ${open.delivery_error}` : ''}.`} />
          ) : (
            <p className="text-sm text-ink-2">Pick a report on the left, or preview today's.</p>
          )}
        </Card>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
