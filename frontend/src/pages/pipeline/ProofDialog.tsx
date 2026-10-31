import { useEffect, useState, type FormEvent } from 'react';
import { CopyButton, Field, Modal, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Deal, ProofItem, ProofResponse } from '../../types';

const FACTS: ['problem' | 'built' | 'results' | 'quote', string, string][] = [
  ['problem', 'The problem before', 'e.g. orders only came through apps at 25% commission'],
  ['built', 'What you built', 'e.g. a menu page with WhatsApp ordering'],
  ['results', 'What changed, with numbers', 'e.g. 42 direct orders in the first month'],
  ['quote', 'Their words', 'Two or three lines from the client, exactly as they said them'],
];

/** What a finished client lets you show, and the drafts made only from that. */
export function ProofDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const [data, setData] = useState<ProofResponse | null>(null);
  const [form, setForm] = useState<ProofResponse['proof']>({ permissions: {}, facts: {} });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.getProof(deal.id).then((r) => { setData(r); setForm(r.proof); }).catch((e: Error) => setError(e.message));
  }, [deal.id]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setData(await api.saveProof(deal.id, form));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };
  const drafts = data?.drafts;
  return (
    <Modal title={`Proof from ${deal.company || deal.email}`} onClose={onClose} wide>
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {!data ? <div aria-busy="true" aria-label="Loading" className="h-40 animate-pulse rounded bg-wash" /> : (
        <form onSubmit={save} className="space-y-4">
          <fieldset>
            <legend className="label">They said yes to showing</legend>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {(Object.keys(data.items) as ProofItem[]).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(form.permissions[k])}
                    onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, [k]: e.target.checked } })} /> {data.items[k]}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink-2">Ask each one. Nothing unticked appears in a draft.</p>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            {FACTS.map(([k, label, hint]) => (
              <Field key={k} label={label} hint={hint}>{(id) => (
                <textarea id={id} className="input min-h-[4rem]" value={form.facts[k] ?? ''}
                  onChange={(e) => setForm({ ...form, facts: { ...form.facts, [k]: e.target.value } })} />
              )}</Field>
            ))}
          </div>
          <button className="btn btn-primary">Save and draft</button>
          {drafts && !drafts.ok && <Notice tone="info">{drafts.reason}</Notice>}
          {drafts?.ok && (
            <div className="space-y-4 border-t border-rule pt-4">
              {([['Case study', drafts.case_study], ['LinkedIn post', drafts.linkedin], ['Google Business Profile update', drafts.gbp]] as const).map(([title, text]) => (
                <div key={title}>
                  <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3><CopyButton text={text ?? ''} label={`Copy ${title.toLowerCase()}`} /></div>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-wash p-3 text-sm">{text}</p>
                </div>
              ))}
              <div>
                <h3 className="text-sm font-semibold">WhatsApp Status, three frames</h3>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{drafts.status?.map((f) => <li key={f}>{f}</li>)}</ol>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
