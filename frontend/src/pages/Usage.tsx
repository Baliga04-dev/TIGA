import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Notice } from '../components/ui';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import type { AiCall, AiUsage, ChatLogEntry } from '../types';

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-IN');
const when = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function CallRow({ call }: { call: AiCall }) {
  return (
    <li className="py-2 text-sm">
      <details>
        <summary className="cursor-pointer">
          <span className="font-medium">{call.feature}</span>{' '}
          <span className="text-ink-3">{when(call.ts)} · {n(call.input_tokens)} in / {n(call.output_tokens)} out · {(call.duration_ms / 1000).toFixed(1)}s</span>
          {!call.ok && <span className="badge badge-red ml-2">failed</span>}
        </summary>
        <div className="mt-2 space-y-2">
          {call.error && <p className="text-flag">{call.error}</p>}
          <p className="text-xs font-medium text-ink-2">What Tiga asked</p>
          <pre tabIndex={0} className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-wash p-2 text-xs">{call.prompt}</pre>
          <p className="text-xs font-medium text-ink-2">What Claude answered</p>
          <pre tabIndex={0} className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-wash p-2 text-xs">{call.reply || '(nothing)'}</pre>
          <details>
            <summary className="cursor-pointer text-xs text-ink-3">Instructions given to Claude</summary>
            <pre tabIndex={0} className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-wash p-2 text-xs">{call.system}</pre>
          </details>
        </div>
      </details>
    </li>
  );
}

export function Usage() {
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [calls, setCalls] = useState<AiCall[]>([]);
  const [chats, setChats] = useState<ChatLogEntry[]>([]);
  const [feature, setFeature] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [u, c, h] = await Promise.all([api.getAiUsage(7), api.listAiCalls(feature), api.getChatHistory()]);
      setUsage(u);
      setCalls(c.items);
      setChats(h.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage');
    }
  }, [feature]);
  useEffect(() => { refresh(); }, [refresh]);

  const pct = usage ? Math.min(100, Math.round((usage.today.calls / Math.max(1, usage.today.cap)) * 100)) : 0;

  return (
    <>
      <PageHeader title="AI usage" description="Every Claude call Tiga makes on your plan: which agent asked, what it asked, what came back." />
      {error && <div className="mb-6"><Notice>{error}</Notice></div>}

      {usage && (
        <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card title="Today">
            <p className="text-sm">{usage.today.calls} of {usage.today.cap} Claude calls used (daily cap). Model: {usage.model}.</p>
            <div className="mt-2 h-2 rounded bg-wash" role="progressbar" aria-label="Daily Claude calls used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn('h-full rounded', pct > 80 ? 'bg-flag' : 'bg-pen')} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Calls run through your own Claude login (claude -p), not an API key. "Cost" below is Claude's own estimate of the
              equivalent API price, shown so you can compare agents; it is not a bill. Over the cap Tiga uses its built-in rules.
            </p>
          </Card>
          <Card title="Last 7 days by agent">
            {usage.by_feature.length === 0 ? <p className="text-sm text-ink-3">No Claude calls yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-ink-2"><th className="py-1">Agent</th><th>Calls</th><th>Tokens in / out</th><th>Est. cost</th></tr></thead>
                <tbody>
                  {usage.by_feature.map((f) => (
                    <tr key={f.feature} className="border-t border-rule">
                      <td className="py-1">{f.feature}</td><td>{f.calls}{f.failed ? ` (${f.failed} failed)` : ''}</td>
                      <td>{n(f.input_tokens)} / {n(f.output_tokens)}</td><td>${(f.cost_usd ?? 0).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title="Claude calls" action={
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Filter by agent</span>
            <select className="input py-1" value={feature} onChange={(e) => setFeature(e.target.value)}>
              <option value="">All agents</option>
              {usage?.by_feature.map((f) => <option key={f.feature} value={f.feature}>{f.feature}</option>)}
            </select>
          </label>
        }>
          {calls.length === 0 ? <p className="text-sm text-ink-3">No calls to show.</p> : (
            <ul className="divide-y divide-rule">{calls.map((c) => <CallRow key={c.id} call={c} />)}</ul>
          )}
        </Card>
        <Card title="Chat history">
          {chats.length === 0 ? <p className="text-sm text-ink-3">No chats yet.</p> : (
            <ul className="divide-y divide-rule text-sm">
              {chats.map((c) => (
                <li key={c.id} className="py-2">
                  <p><span className="font-medium">You:</span> {c.user_text}</p>
                  <p className="text-ink-2"><span className="font-medium">Tiga ({c.mode}):</span> {c.reply}</p>
                  <p className="text-xs text-ink-3">{when(c.ts)}{c.actions.length > 0 && ` · used ${c.actions.map((a) => a.tool + (a.status ? ` (${a.status.replace('_', ' ')})` : a.ok ? '' : ' (failed)')).join(', ')}`}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
