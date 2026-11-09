import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '../../services/api';
import type { Batch } from '../../types';

/**
 * Drafts by the kind of shop they go to. Picking one narrows the list below to it; the whole batch can then be
 * approved or rejected after a second click, so the weekly report can tell which kind of shop replies.
 */
export function Batches({ batches, selected, onSelect, onDone, onError }: {
  batches: Batch[];
  selected: string | null;
  onSelect: (niche: string | null) => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [asking, setAsking] = useState<'approve' | 'reject' | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = batches.filter((b) => b.drafted > 0 || b.sent > 0);
  if (shown.length < 2) return null;
  const current = shown.find((b) => b.niche === selected) ?? null;

  const act = async (kind: 'approve' | 'reject', b: Batch) => {
    setBusy(true);
    try {
      const { count } = kind === 'approve' ? await api.approveBatch(b.niche) : await api.rejectBatch(b.niche);
      onDone(`${kind === 'approve' ? 'Approved' : 'Rejected'} ${count} ${b.label.toLowerCase()} draft${count === 1 ? '' : 's'}`);
      setAsking(null);
      onSelect(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5">
      <p className="mb-2 text-sm text-ink-2">Approve one kind of shop at a time, so the weekly report can show which kind replies.</p>
      <div role="group" aria-label="Kind of shop" className="flex flex-wrap gap-2">
        <button className="btn btn-ghost btn-sm" aria-pressed={selected === null} onClick={() => { setAsking(null); onSelect(null); }}>
          All kinds
        </button>
        {shown.map((b) => (
          <button key={b.niche} className="btn btn-secondary btn-sm aria-pressed:border-pen aria-pressed:bg-pen/10"
            aria-pressed={selected === b.niche} onClick={() => { setAsking(null); onSelect(b.niche); }}>
            {b.label} <span className="figure text-ink-2">{b.drafted}</span>
          </button>
        ))}
      </div>
      {current && (
        <div className="mt-3 rounded-lg border border-rule bg-wash p-3 text-sm">
          <p>
            {current.label}: {current.drafted} waiting, {current.sent} sent, {current.replies} {current.replies === 1 ? 'reply' : 'replies'}
            {current.interested > 0 && `, ${current.interested} interested`}.
          </p>
          {current.drafted > 0 && (asking ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>
                {asking === 'approve'
                  ? `Approve all ${current.drafted}? They still go out a few a day, within the daily limit.`
                  : `Reject all ${current.drafted}?`}
              </span>
              <button className={asking === 'approve' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm'} disabled={busy}
                onClick={() => act(asking, current)}>
                Yes, {asking} {current.drafted}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setAsking(null)}>Cancel</button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-success btn-sm" onClick={() => setAsking('approve')}>
                <Check className="size-4" aria-hidden="true" /> Approve all {current.drafted}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setAsking('reject')}>
                <X className="size-4" aria-hidden="true" /> Reject all {current.drafted}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
