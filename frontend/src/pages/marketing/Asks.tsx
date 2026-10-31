import { useCallback, useEffect, useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';
import { CopyButton, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Ask } from '../../types';
import { WriteMessage } from './WriteMessage';
import { errorText, shortDate } from './shared';

const KIND_LABEL: Record<Ask['kind'], string> = {
  review: 'Google review request',
  referral: 'Two-week check-in and referral',
};

/** Paid clients are owed a review request, and two weeks later a check-in that asks for an introduction. */
export function AsksOwed({ onToast }: { onToast: (m: string) => void }) {
  const [data, setData] = useState<{ items: Ask[]; review_link: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState<Ask | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.asks());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = async (a: Ask) => {
    try {
      await api.askDone(a.deal_id, a.kind);
      onToast(`${KIND_LABEL[a.kind]} for ${a.company} done.`);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (error) return <div className="mb-10"><Notice title="Asks didn't load">{error}</Notice></div>;
  if (!data) return <div aria-busy="true" aria-label="Loading asks" className="mb-10 h-12 animate-pulse rounded bg-wash" />;
  return (
    <section aria-labelledby="asks-title" className="mb-10">
      <h3 id="asks-title" className="mb-2 font-semibold">Asks owed to clients ({data.items.length})</h3>
      {!data.review_link && data.items.some((a) => a.kind === 'review') && (
        <p className="mb-2 text-sm text-ink-2">Add your Google review link as TIGA_REVIEW_LINK in tiga/.env so the request carries it.</p>
      )}
      {data.items.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing owed. When a client pays, a review request appears here, and a check-in two weeks later.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {data.items.map((a) => (
            <li key={`${a.deal_id}-${a.kind}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{a.company}</p>
                <p className="text-sm text-ink-2">{KIND_LABEL[a.kind]}, due {shortDate(a.due)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.contact ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setWriting(a)}>
                    <MessageCircle className="size-4" aria-hidden="true" /> Write it <span className="sr-only">for {a.company}</span>
                  </button>
                ) : <CopyButton text={a.text} label="Copy the message" />}
                <button className="btn btn-ghost btn-sm" onClick={() => done(a)}>
                  <Check className="size-4" aria-hidden="true" /> Done <span className="sr-only">{KIND_LABEL[a.kind]} for {a.company}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {writing?.contact && (
        <WriteMessage person={writing.contact} text={writing.text} onClose={() => setWriting(null)}
          onSent={() => { const a = writing; setWriting(null); done(a); }} />
      )}
    </section>
  );
}
