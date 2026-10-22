import { useEffect, useState } from 'react';
import { Modal, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Deal, Rate } from '../../types';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** Pick services from the rate card; Tiga writes the proposal email (for approval) and a printable page. */
export function ProposalDialog({ deal, onClose, onDone }: { deal: Deal; onClose: () => void; onDone: (message: string, documentId: number) => void }) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getRates().then((r) => setRates(r.rates)).catch((e: Error) => setError(e.message));
  }, []);

  const chosen = rates.filter((r) => (qty[r.id] ?? 0) > 0);
  const total = chosen.reduce((sum, r) => sum + r.price * (qty[r.id] ?? 0), 0);

  const submit = async () => {
    setBusy(true);
    try {
      const out = await api.writeProposal(deal.id, chosen.map((r) => ({ rate_id: r.id, qty: qty[r.id] })));
      onDone(out.draft ? 'Proposal written. Approve the email on the Outreach page.' : 'Proposal saved. This client already has an open draft, so no new email was made.', out.document.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the proposal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Proposal for ${deal.company || deal.email}`} onClose={onClose} wide>
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      <ul className="divide-y divide-rule">
        {rates.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>
              <span className="font-medium">{r.name}</span> <span className="text-ink-3">{rupees(r.price)} / {r.unit}</span>
              <span className="block text-xs text-ink-3">{r.description}</span>
            </span>
            <label className="flex items-center gap-1 text-xs">
              <span className="sr-only">Quantity of {r.name}</span>
              <input type="number" min={0} max={999} className="input w-20" value={qty[r.id] ?? 0}
                onChange={(e) => setQty({ ...qty, [r.id]: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">Total <b>{rupees(total)}</b> · advance {rupees(Math.floor(total / 2))} · balance {rupees(total - Math.floor(total / 2))}</p>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" disabled={busy || chosen.length === 0} onClick={submit}>Write proposal</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
