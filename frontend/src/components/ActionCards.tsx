import { useState } from 'react';
import { Check, AlertCircle, ShieldQuestion, X } from 'lucide-react';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import type { ToolAction } from '../types';

type Decision = { state: 'busy' | 'done' | 'cancelled' | 'failed'; note?: string };

/** What Tiga did in a reply, and Confirm / Cancel for anything waiting on the owner's click. */
export function ActionCards({ actions }: { actions: ToolAction[] }) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  if (actions.length === 0) return null;

  const decide = async (id: string, confirm: boolean) => {
    setDecisions((d) => ({ ...d, [id]: { state: 'busy' } }));
    try {
      if (confirm) {
        const out = await api.confirmAction(id);
        setDecisions((d) => ({ ...d, [id]: { state: 'done', note: 'Done.' } }));
        if (out.action && !out.action.ok) setDecisions((d) => ({ ...d, [id]: { state: 'failed', note: String(out.action?.result.error ?? 'It failed.') } }));
      } else {
        await api.cancelAction(id);
        setDecisions((d) => ({ ...d, [id]: { state: 'cancelled', note: 'Cancelled.' } }));
      }
    } catch (e) {
      setDecisions((d) => ({ ...d, [id]: { state: 'failed', note: e instanceof Error ? e.message : 'Something went wrong' } }));
    }
  };

  return (
    <ul className="mt-2 space-y-2 text-left text-sm" aria-label="What Tiga did">
      {actions.map((a, i) => {
        const label = a.tool.replace(/_/g, ' ');
        if (a.status === 'needs_confirmation' && a.pending_id) {
          const decision = decisions[a.pending_id];
          return (
            <li key={a.pending_id} className="rounded-lg border border-mark bg-mark/20 p-3">
              <p className="flex items-center gap-2 font-medium">
                <ShieldQuestion className="size-4" aria-hidden="true" /> Needs your go-ahead
              </p>
              <p className="mt-1 font-mono text-xs text-ink-2">{a.summary}</p>
              {decision && decision.state !== 'busy' ? (
                <p role="status" className="mt-2 text-ink-2">{decision.note}</p>
              ) : (
                <div className="mt-2 flex gap-2">
                  <button className="btn btn-primary btn-sm" disabled={decision?.state === 'busy'} onClick={() => decide(a.pending_id!, true)}>
                    <Check className="size-4" aria-hidden="true" /> Confirm <span className="sr-only">{label}</span>
                  </button>
                  <button className="btn btn-ghost btn-sm" disabled={decision?.state === 'busy'} onClick={() => decide(a.pending_id!, false)}>
                    <X className="size-4" aria-hidden="true" /> Cancel <span className="sr-only">{label}</span>
                  </button>
                </div>
              )}
            </li>
          );
        }
        return (
          <li key={`${a.tool}-${i}`} className={cn('flex items-center gap-2 text-xs', a.ok ? 'text-ink-3' : 'text-flag')}>
            {a.ok ? <Check className="size-3" aria-hidden="true" /> : <AlertCircle className="size-3" aria-hidden="true" />}
            <span>{label}{!a.ok && a.result?.error ? `: ${String(a.result.error)}` : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}
