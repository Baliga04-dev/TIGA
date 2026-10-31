import { useEffect, useState } from 'react';
import { Card, Field, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Rate, RenewalTerms } from '../../types';

/** The prices proposals and the portfolio use. Starter rates are suggestions: change them to yours. */
export function RateCard() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [saved, setSaved] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api.getRates().then((r) => { setRates(r.rates); setSaved(JSON.stringify(r.rates)); }).catch((e: Error) => setError(e.message));
  }, []);

  const update = (id: string, change: Partial<Rate>) => setRates(rates.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const save = async () => {
    try {
      const out = await api.saveRates(rates);
      setRates(out.rates);
      setSaved(JSON.stringify(out.rates));
      setError(null);
      setNote('Prices saved. New proposals use them.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save prices');
    }
  };

  return (
    <Card title="Your prices" raised>
      <p className="mb-3 text-sm text-ink-2">Starter Bengaluru rates for a new freelancer. Change any of them; proposals use these.</p>
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {note && <div className="mb-3"><Notice tone="info">{note}</Notice></div>}
      <ul className="divide-y divide-rule">
        {rates.map((r) => (
          <li key={r.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 py-2 text-sm">
            <label className="sr-only" htmlFor={`rate-name-${r.id}`}>Name of {r.name}</label>
            <input id={`rate-name-${r.id}`} className="input" value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} />
            <label className="sr-only" htmlFor={`rate-price-${r.id}`}>Price of {r.name} in rupees</label>
            <span className="flex items-center gap-1">
              ₹<input id={`rate-price-${r.id}`} inputMode="numeric" className="input" value={r.price}
                onChange={(e) => update(r.id, { price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </span>
            <span className="col-span-2 text-xs text-ink-3">per {r.unit}{r.days ? ` · about ${r.days} days` : ''}</span>
          </li>
        ))}
      </ul>
      <button className="btn btn-primary mt-3" disabled={JSON.stringify(rates) === saved} onClick={save}>Save prices</button>
      <Renewal />
    </Card>
  );
}

/** The year-two renewal every proposal states, so the client knows the cost and date before they sign. */
function Renewal() {
  const [terms, setTerms] = useState<RenewalTerms | null>(null);
  const [saved, setSaved] = useState('');
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  useEffect(() => {
    api.getTerms().then((r) => { setTerms(r.terms); setSaved(JSON.stringify(r.terms)); }).catch((e: Error) => setMessage({ tone: 'error', text: e.message }));
  }, []);
  if (!terms) return null;
  const save = async () => {
    try {
      const out = await api.saveTerms(terms);
      setTerms(out.terms);
      setSaved(JSON.stringify(out.terms));
      setMessage({ tone: 'info', text: 'Saved. New proposals state this renewal.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Could not save the renewal' });
    }
  };
  return (
    <div className="mt-6 border-t border-rule pt-4">
      <h3 className="text-sm font-semibold">Year two</h3>
      <p className="mb-3 text-sm text-ink-2">What the client pays each year after launch, in their own name. Every proposal states it with the date.</p>
      {message && <div className="mb-3"><Notice tone={message.tone}>{message.text}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Renewal a year (₹)">{(id) => (
          <input id={id} inputMode="numeric" className="input" value={terms.renewal_yearly}
            onChange={(e) => setTerms({ ...terms, renewal_yearly: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        )}</Field>
        <Field label="What it covers">{(id) => (
          <input id={id} className="input" value={terms.renewal_what} onChange={(e) => setTerms({ ...terms, renewal_what: e.target.value })} />
        )}</Field>
      </div>
      <button className="btn btn-secondary mt-3" disabled={JSON.stringify(terms) === saved} onClick={save}>Save renewal</button>
    </div>
  );
}
