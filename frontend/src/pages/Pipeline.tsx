import { useCallback, useEffect, useState } from 'react';
import { FileText, IndianRupee, Plus, Receipt } from 'lucide-react';
import { ProposalDialog } from './pipeline/ProposalDialog';
import { ProofDialog } from './pipeline/ProofDialog';
import { PageHeader, Card, Notice, Field, Toast } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import { cn } from '../lib/utils';
import type { Deal, DealDocument, DealStage, MoneySummary } from '../types';

const COLUMNS: { stage: DealStage; title: string }[] = [
  { stage: 'interested', title: 'Interested' },
  { stage: 'call_booked', title: 'Call booked' },
  { stage: 'proposal_sent', title: 'Proposal sent' },
  { stage: 'won', title: 'Won' },
  { stage: 'in_progress', title: 'In progress' },
  { stage: 'delivered', title: 'Delivered' },
];

/** Forward moves offered on each card (the server enforces the full rules). */
const NEXT: Record<DealStage, { to: DealStage; label: string }[]> = {
  interested: [{ to: 'call_booked', label: 'Call booked' }, { to: 'proposal_sent', label: 'Proposal sent' }],
  call_booked: [{ to: 'proposal_sent', label: 'Proposal sent' }],
  proposal_sent: [{ to: 'won', label: 'Won' }],
  won: [{ to: 'in_progress', label: 'Start work' }],
  in_progress: [{ to: 'delivered', label: 'Delivered' }],
  delivered: [],
  paid: [],
  lost: [{ to: 'interested', label: 'Reopen' }],
};

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function DealCard({ deal, onDone, onError }: { deal: Deal; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [amount, setAmount] = useState(String(deal.amount || ''));
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proofing, setProofing] = useState(false);
  const [docs, setDocs] = useState<DealDocument[]>([]);
  const name = deal.company || deal.contact || deal.email;
  useEffect(() => {
    api.listDealDocuments(deal.id).then((r) => setDocs(r.items)).catch(() => setDocs([]));
  }, [deal.id]);
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      onDone(message);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const advanceDue = Math.max(0, Math.floor(deal.amount / 2) - deal.advance_paid);
  const balanceDue = Math.max(0, deal.amount - deal.advance_paid - deal.balance_paid);

  return (
    <li className="rounded-lg border border-rule bg-sheet p-3 text-sm">
      <p className="font-medium">{name}</p>
      <p className="text-xs text-ink-3">{deal.email}{deal.service && ` · ${deal.service}`}</p>
      <form className="mt-2 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); act(() => api.editDeal(deal.id, { amount: Number(amount) || 0 }), `Price saved for ${name}`); }}>
        <Field label={`Price for ${name} (₹)`} className="flex-1">
          {(id) => <input id={id} inputMode="numeric" className="input" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />}
        </Field>
        {String(deal.amount || '') !== amount && <button className="btn btn-secondary btn-sm" disabled={busy}>Save</button>}
      </form>
      {deal.amount > 0 && (deal.advance_paid > 0 || deal.balance_paid > 0) && (
        <p className="mt-1 text-xs text-ledger">Received {rupees(deal.advance_paid + deal.balance_paid)} of {rupees(deal.amount)}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {NEXT[deal.stage].map((m) => (
          <button key={m.to} className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => api.moveDeal(deal.id, m.to), `${name}: ${m.label}`)}>
            {m.label} <span className="sr-only">for {name}</span>
          </button>
        ))}
        {(deal.stage === 'won' || deal.stage === 'in_progress') && deal.advance_paid === 0 && advanceDue > 0 && (
          <button className="btn btn-success btn-sm" disabled={busy} onClick={() => act(() => api.recordPayment(deal.id, 'advance', advanceDue), `Advance of ${rupees(advanceDue)} recorded`)}>
            <IndianRupee className="size-3" aria-hidden="true" /> Advance received <span className="sr-only">from {name}</span>
          </button>
        )}
        {deal.stage === 'delivered' && balanceDue > 0 && (
          <button className="btn btn-success btn-sm" disabled={busy} onClick={() => act(() => api.recordPayment(deal.id, 'balance', balanceDue), `Balance of ${rupees(balanceDue)} recorded`)}>
            <IndianRupee className="size-3" aria-hidden="true" /> Balance received <span className="sr-only">from {name}</span>
          </button>
        )}
        {['interested', 'call_booked', 'proposal_sent'].includes(deal.stage) && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setProposing(true)}>
            <FileText className="size-3" aria-hidden="true" /> Proposal <span className="sr-only">for {name}</span>
          </button>
        )}
        {(deal.stage === 'won' || deal.stage === 'in_progress') && deal.advance_paid === 0 && advanceDue > 0 && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => api.writeInvoice(deal.id, 'advance'), 'Advance invoice written. Approve the email on the Outreach page.')}>
            <Receipt className="size-3" aria-hidden="true" /> Advance invoice <span className="sr-only">for {name}</span>
          </button>
        )}
        {deal.stage === 'delivered' && balanceDue > 0 && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => api.writeInvoice(deal.id, 'balance'), 'Balance invoice written. Approve the email on the Outreach page.')}>
            <Receipt className="size-3" aria-hidden="true" /> Balance invoice <span className="sr-only">for {name}</span>
          </button>
        )}
        {['in_progress', 'delivered', 'paid'].includes(deal.stage) && !docs.some((d) => d.kind === 'handover') && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(async () => {
            const { document } = await api.writeHandover(deal.id);
            window.open(`/api/documents/${document.id}`, '_blank', 'noopener,noreferrer');
          }, `Handover sheet for ${name} is ready to print`)}>
            <FileText className="size-3" aria-hidden="true" /> Handover sheet <span className="sr-only">for {name}</span>
          </button>
        )}
        {['delivered', 'paid'].includes(deal.stage) && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setProofing(true)}>
            Proof <span className="sr-only">from {name}</span>
          </button>
        )}
        {!['in_progress', 'delivered'].includes(deal.stage) && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => api.moveDeal(deal.id, 'lost'), `${name} marked lost`)}>
            Lost <span className="sr-only">{name}</span>
          </button>
        )}
      </div>
      {docs.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-2 text-xs">
          {docs.map((d) => (
            <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="text-pen underline">
              {d.kind === 'invoice' ? d.number : d.kind === 'handover' ? 'Handover sheet' : 'Proposal'}
            </a>
          ))}
        </p>
      )}
      {proofing && <ProofDialog deal={deal} onClose={() => setProofing(false)} />}
      {proposing && (
        <ProposalDialog deal={deal} onClose={() => setProposing(false)}
          onDone={(message) => { setProposing(false); onDone(message); }} />
      )}
    </li>
  );
}

export function Pipeline() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [money, setMoney] = useState<MoneySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', company: '', service: '', amount: '' });

  const refresh = useCallback(async () => {
    try {
      const out = await api.listDeals();
      setDeals(out.items);
      setMoney(out.money);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the pipeline');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const add = useAction(async () => {
    await api.createDeal({ email: form.email, company: form.company, service: form.service, amount: Number(form.amount) || 0 });
    setForm({ email: '', company: '', service: '', amount: '' });
    await refresh();
    setToast('Deal added');
  });
  const done = (m: string) => { setToast(m); refresh(); };
  const closed = deals.filter((d) => d.stage === 'paid' || d.stage === 'lost');
  const [proofDeal, setProofDeal] = useState<Deal | null>(null);

  return (
    <>
      <PageHeader title="Pipeline" description="Every client from 'interested' to paid. Interested replies land here on their own." />
      {(error || add.error) && <div className="mb-6"><Notice title="Something went wrong">{error ?? add.error}</Notice></div>}

      {money && (
        <dl aria-label="Money" className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4">
          {([
            ['Open pipeline', rupees(money.pipeline_value)],
            ['Advances to collect', rupees(money.advance_due)],
            ['Balances to collect', rupees(money.balance_due)],
            ['Paid this month', rupees(money.paid_this_month)],
          ] as const).map(([label, value]) => (
            <div key={label} className="bg-sheet p-3">
              <dt className="text-xs text-ink-2">{label}</dt>
              <dd className="figure text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {deals.every((d) => d.stage === 'paid' || d.stage === 'lost') && (
        <p className="mb-4 rounded-lg border border-dashed border-rule px-4 py-3 text-sm text-ink-2">
          No open deals yet. When a prospect replies "interested" it appears under Interested, or add one by hand below.
        </p>
      )}
      <div className="mb-8 overflow-x-auto pb-2">
        <div className="grid min-w-[60rem] grid-cols-6 gap-3">
          {COLUMNS.map((col) => {
            const items = deals.filter((d) => d.stage === col.stage);
            return (
              <section key={col.stage} aria-label={col.title}>
                <h2 className="mb-2 text-sm font-semibold">{col.title} <span className="text-ink-3">({items.length})</span></h2>
                <ul className="space-y-2">
                  {items.map((d) => <DealCard key={`${d.id}-${d.updated_at}`} deal={d} onDone={done} onError={setError} />)}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title="Add a deal" raised>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.run(); }}>
            <Field label="Client email">{(id) => <input id={id} type="email" required className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
            <Field label="Business">{(id) => <input id={id} className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />}</Field>
            <Field label="Service">{(id) => <input id={id} className="input" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />}</Field>
            <Field label="Price (₹)">{(id) => <input id={id} inputMode="numeric" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/\D/g, '') })} />}</Field>
            <div><button className="btn btn-primary" disabled={add.pending}><Plus className="size-4" aria-hidden="true" /> Add deal</button></div>
          </form>
        </Card>
        <Card title={`Closed (${closed.length})`}>
          {closed.length === 0 ? <p className="text-sm text-ink-3">Nothing closed yet.</p> : (
            <ul className="divide-y divide-rule text-sm">
              {closed.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{d.company || d.email}</span>
                  <span className="flex items-center gap-2">
                    {d.stage === 'paid' && <span className="text-ledger">{rupees(d.amount)}</span>}
                    <span className={cn('badge', d.stage === 'paid' ? 'badge-green' : 'badge-gray')}>{d.stage}</span>
                    {d.stage === 'paid' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setProofDeal(d)}>
                        Proof <span className="sr-only">from {d.company || d.email}</span>
                      </button>
                    )}
                    {d.stage === 'lost' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => api.moveDeal(d.id, 'interested').then(() => done('Reopened'), (e: Error) => setError(e.message))}>
                        Reopen <span className="sr-only">{d.company || d.email}</span>
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {proofDeal && <ProofDialog deal={proofDeal} onClose={() => setProofDeal(null)} />}
    </>
  );
}
