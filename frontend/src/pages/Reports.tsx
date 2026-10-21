import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, Send } from 'lucide-react';
import { PageHeader, Card, Notice, Toast } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import { cn } from '../lib/utils';
import type { ReportPreview, ReportRow } from '../types';

const TONE = { red: 'badge-red', amber: 'badge-amber', green: 'badge-green' } as const;

export function Reports() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows((await api.listReports()).items);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load reports');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const preview = useAction<[], ReportPreview>(() => api.previewReport());
  const run = useAction(async () => {
    await api.runDailyNow();
    await refresh();
    setToast("Today's report was sent, or it had already gone out.");
  });

  const open = rows.find((r) => r.id === openId);

  return (
    <>
      <PageHeader
        title="Reports"
        description="The daily mail, with the outreach numbers first. Preview it, send it now, or read any past one."
      />
      {loadError && <div className="mb-6"><Notice title="Couldn't load reports">{loadError}</Notice></div>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title="Today" raised>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => preview.run()} disabled={preview.pending}>
              {preview.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              Preview today's report
            </button>
            <button className="btn btn-primary" onClick={() => run.run()} disabled={run.pending}>
              {run.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              Send now
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-3">Sending runs the reply check, the tests and the sync first. Each day's report goes out once.</p>
          {preview.error && <div className="mt-3"><Notice>{preview.error}</Notice></div>}
          {run.error && <div className="mt-3"><Notice>{run.error}</Notice></div>}
          {preview.result && (
            <article aria-label="Report preview" className="mt-4">
              <p className="mb-2 flex items-center gap-2 font-medium">
                <span className={cn('badge', TONE[preview.result.status])}>{preview.result.status}</span>
                {preview.result.subject}
              </p>
              <pre className="whitespace-pre-wrap rounded-lg border border-rule bg-wash p-3 text-sm">{preview.result.body}</pre>
            </article>
          )}
        </Card>

        <Card title="Past reports">
          {rows.length === 0 ? (
            <p className="text-sm text-ink-2">No reports sent yet.</p>
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-2">
                  <button className="w-full text-left text-pen underline" onClick={() => setOpenId(r.id === openId ? null : r.id)} aria-expanded={r.id === openId}>
                    {r.subject}
                  </button>
                  <span className="ml-2 text-xs text-ink-3">sent to {r.recipient}</span>
                </li>
              ))}
            </ul>
          )}
          {open && <pre aria-label="Report body" className="mt-3 whitespace-pre-wrap rounded-lg border border-rule bg-wash p-3 text-sm">{open.body}</pre>}
        </Card>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
