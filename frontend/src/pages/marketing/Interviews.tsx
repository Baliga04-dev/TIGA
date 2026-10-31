import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ClipboardList } from 'lucide-react';
import { Field, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { InterviewSummary, LadderPoint, OwnerInterview } from '../../types';
import { CATEGORIES, errorText, shortDate } from './shared';

const POINTS: [LadderPoint, string][] = [
  ['too_cheap', 'Too cheap to trust'], ['bargain', 'A bargain'], ['expensive', 'Getting expensive'], ['too_expensive', 'Too expensive'],
];
type Guide = { guide: { id: string; question: string }[]; offers: { id: string; label: string }[] };
const rupees = (n: number | null | undefined) => (n == null ? '' : `₹${n.toLocaleString('en-IN')}`);

/** Short owner interviews: how they find customers, what burned them, and what prices feel fair. */
export function InterviewsPanel({ onToast }: { onToast: (m: string) => void }) {
  const [data, setData] = useState<({ items: OwnerInterview[]; summary: InterviewSummary } & Guide) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.interviews());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <Notice title="Interviews didn't load" action={<button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{error}</Notice>;
  if (!data) return <div aria-busy="true" aria-label="Loading interviews" className="h-40 animate-pulse rounded bg-wash" />;
  const { summary } = data;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <InterviewForm guide={data} onSaved={() => { onToast('Interview saved.'); load(); }} />
      <aside className="space-y-6 text-sm">
        <div>
          <h3 className="font-semibold">What prices feel fair</h3>
          <p className="mt-1 text-ink-2">
            <span className="font-mono font-semibold text-ink">{summary.count}</span> of {summary.goal} interviews.
            Between the median "a bargain" and the median "getting expensive".
          </p>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {data.offers.map((o) => {
              const s = summary.offers[o.id];
              return (
                <li key={o.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span>{o.label.split(':')[0]}</span>
                  <span className="shrink-0 font-mono">{s?.range ? `${rupees(s.range[0])} to ${rupees(s.range[1])}` : 'no answers yet'}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">Kinds of shop asked</h3>
          <p className="mt-1 text-ink-2">Aim for about 3 of each kind you sell to.</p>
          {summary.count === 0 ? <p className="mt-2 text-ink-2">None yet.</p> : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {Object.entries(summary.by_category).map(([k, n]) => <li key={k} className="badge badge-gray">{k}: {n}</li>)}
            </ul>
          )}
        </div>
        {data.items.length > 0 && (
          <div>
            <h3 className="font-semibold">Latest</h3>
            <ul className="mt-2 space-y-2">
              {data.items.slice(0, 5).map((i) => (
                <li key={i.id}><span className="font-medium">{i.business || 'A shop'}</span> <span className="text-ink-2">{i.category}, {shortDate(i.at)}</span>
                  {i.answers.find_you && <span className="block text-ink-2">Finds customers: {i.answers.find_you}</span>}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function InterviewForm({ guide, onSaved }: { guide: Guide; onSaved: () => void }) {
  const empty = () => Object.fromEntries(guide.offers.map((o) => [o.id, { too_cheap: '', bargain: '', expensive: '', too_expensive: '' }]));
  const [business, setBusiness] = useState('');
  const [category, setCategory] = useState('restaurant');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Record<string, Record<LadderPoint, string>>>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const ladder = Object.fromEntries(Object.entries(prices).map(([offer, p]) => [offer,
        Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)]))]));
      await api.addInterview({ business, category, answers, prices: ladder });
      setBusiness(''); setAnswers({}); setPrices(empty()); setError(null);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-ink-2">
        Ten minutes at an off-peak hour. Offer something useful in return (a free Google listing check, five edited photos), never cash.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shop">{(id) => <input id={id} className="input" value={business} onChange={(e) => setBusiness(e.target.value)} />}</Field>
        <Field label="Kind of shop">{(id) => (
          <select id={id} className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.filter(([v]) => v !== 'all').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}</Field>
      </div>
      {guide.guide.map((q) => (
        <Field key={q.id} label={q.question}>{(id) => (
          <textarea id={id} className="input min-h-[3.5rem]" value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
        )}</Field>
      ))}
      <fieldset>
        <legend className="label">The price ladder: for each, ask at what price it would be…</legend>
        <div className="mt-2 overflow-x-auto" role="region" aria-label="Price ladder" tabIndex={0}>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-ink-2">
                <th scope="col" className="py-1 pr-2 font-medium">Offer</th>
                {POINTS.map(([, label]) => <th key={label} scope="col" className="px-1 py-1 font-medium">{label} (₹)</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {guide.offers.map((o) => (
                <tr key={o.id}>
                  <th scope="row" className="py-2 pr-2 text-left font-normal">{o.label}</th>
                  {POINTS.map(([point, label]) => (
                    <td key={point} className="px-1 py-2">
                      <input aria-label={`${o.label.split(':')[0]}: ${label}`} inputMode="numeric" className="input" value={prices[o.id]?.[point] ?? ''}
                        onChange={(e) => setPrices({ ...prices, [o.id]: { ...prices[o.id], [point]: e.target.value.replace(/\D/g, '') } })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-flag">{error}</p>}
      <button className="btn btn-primary" disabled={busy}><ClipboardList className="size-4" aria-hidden="true" /> Save the interview</button>
    </form>
  );
}
