import { useState, type FormEvent } from 'react';
import { Calculator as CalcIcon, Printer } from 'lucide-react';
import { Field } from '../../components/ui';
import { api } from '../../services/api';
import type { CommissionMaths } from '../../types';
import { errorText } from './shared';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** For restaurant visits: what the delivery apps' commission costs them, in their own numbers. */
export function CalculatorPanel() {
  const [shop, setShop] = useState('');
  const [orders, setOrders] = useState('600');
  const [average, setAverage] = useState('350');
  const [commission, setCommission] = useState('25');
  const [share, setShare] = useState('20');
  const [result, setResult] = useState<CommissionMaths | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = { orders: Number(orders), average: Number(average), commission: Number(commission), share: Number(share) };

  const work = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setResult(await api.commission(query));
      setError(null);
    } catch (err) {
      setError(errorText(err));
      setResult(null);
    }
  };
  const digits = (set: (v: string) => void) => (e: { target: { value: string } }) => set(e.target.value.replace(/[^\d.]/g, ''));
  const print = `/api/marketing/print/commission?${new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), shop })}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <form onSubmit={work} className="space-y-3 rounded-lg border border-rule p-4">
        <h3 className="font-semibold">A restaurant's numbers</h3>
        <p className="text-sm text-ink-2">Ask the owner. Their numbers, not averages, are what convince.</p>
        <Field label="Restaurant (for the printout)">{(id) => <input id={id} className="input" value={shop} onChange={(e) => setShop(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="App orders a month">{(id) => <input id={id} inputMode="numeric" className="input" value={orders} onChange={digits(setOrders)} />}</Field>
          <Field label="Average order (₹)">{(id) => <input id={id} inputMode="numeric" className="input" value={average} onChange={digits(setAverage)} />}</Field>
          <Field label="Commission (%)" hint="Owners report 20 to 25%">{(id) => <input id={id} inputMode="decimal" className="input" value={commission} onChange={digits(setCommission)} />}</Field>
          <Field label="Could order direct (%)" hint="Regulars who'd use your page">{(id) => <input id={id} inputMode="decimal" className="input" value={share} onChange={digits(setShare)} />}</Field>
        </div>
        {error && <p role="alert" className="text-sm text-flag">{error}</p>}
        <button className="btn btn-primary btn-sm"><CalcIcon className="size-4" aria-hidden="true" /> Work it out</button>
      </form>
      <div aria-live="polite">
        {!result ? (
          <div className="rounded-lg border border-dashed border-rule p-6 text-sm">
            <p className="font-medium">Fill in their numbers and work it out.</p>
            <p className="mt-1 text-ink-2">Bengaluru restaurant owners say their commission rose from 5 to 7% to about 20 to 25%. The pitch is margin on regulars, not replacing the apps.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-rule p-4">
                <dt className="text-sm text-ink-2">Commission they pay</dt>
                <dd className="mt-1 font-mono text-2xl font-semibold">{rupees(result.commission)}<span className="text-sm font-normal text-ink-2"> a month</span></dd>
              </div>
              <div className="rounded-lg border border-rule p-4">
                <dt className="text-sm text-ink-2">Stays with them if {result.direct_share_pct}% order direct</dt>
                <dd className="mt-1 font-mono text-2xl font-semibold text-ledger">{rupees(result.saved_monthly)}<span className="text-sm font-normal text-ink-2"> a month</span></dd>
                <dd className="text-sm text-ink-2">{rupees(result.saved_yearly)} a year</dd>
              </div>
              <div className="rounded-lg border border-rule p-4">
                <dt className="text-sm text-ink-2">A {rupees(result.site_price)} site pays for itself in</dt>
                <dd className="mt-1 font-mono text-2xl font-semibold">{result.payback_months ? `${result.payback_months} month${result.payback_months === 1 ? '' : 's'}` : 'n/a'}</dd>
              </div>
            </dl>
            <a className="btn btn-secondary btn-sm" href={print} target="_blank" rel="noopener noreferrer">
              <Printer className="size-4" aria-hidden="true" /> Print a one-pager to leave behind
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
