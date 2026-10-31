import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, MessageCircle, UserPlus } from 'lucide-react';
import { Field, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Contact } from '../../types';
import { errorText, shortDate } from './shared';
import { WriteMessage } from './WriteMessage';

/** People the owner knows: one personal message each, sent by hand, asking them to pass his number on. */
export function NetworkPanel({ onToast }: { onToast: (m: string) => void }) {
  const [people, setPeople] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState<Contact | null>(null);
  const load = useCallback(async () => {
    try {
      setPeople((await api.listContacts('warm')).items);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const replied = async (c: Contact) => {
    try {
      await api.recordTouch(c.id, { channel: 'whatsapp', direction: 'in', kind: 'message' });
      onToast(`Noted: ${c.name} replied.`);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const sent = people?.filter((p) => p.last_out_at).length ?? 0;
  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div>
        <p className="text-sm text-ink-2">
          Most freelancers' first clients come from people they already know. Add friends, family, old colleagues and
          classmates, then send each a short personal message asking them to pass your number to a shop owner.
        </p>
        <AddPerson onAdded={(c) => { onToast(`${c.name} added.`); load(); }} />
      </div>
      <div>
        {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}
        {people === null && !error && <div aria-busy="true" aria-label="Loading your network" className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded bg-wash" />)}</div>}
        {people && people.length === 0 && (
          <div className="rounded-lg border border-dashed border-rule p-6 text-sm">
            <p className="font-medium">Nobody here yet.</p>
            <p className="mt-1 text-ink-2">Start with the 10 people most likely to know a shop owner: relatives who run a business, friends from your area, your parents' friends.</p>
          </div>
        )}
        {people && people.length > 0 && (
          <>
            <p className="mb-2 text-sm text-ink-2" aria-live="polite">{sent} of {people.length} messaged</p>
            <ul className="divide-y divide-rule border-y border-rule">
              {people.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name} <span className="text-sm font-normal text-ink-2">{p.source_detail}</span></p>
                    <p className="text-sm text-ink-2">
                      {p.dnc ? 'Asked not to be contacted'
                        : p.last_in_at ? `Replied ${shortDate(p.last_in_at)}`
                          : p.last_out_at ? `Messaged ${shortDate(p.last_out_at)}, no reply yet` : 'Not messaged yet'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!p.dnc && <button className="btn btn-secondary btn-sm" onClick={() => setWriting(p)}><MessageCircle className="size-4" aria-hidden="true" /> {p.last_out_at ? 'Message again' : 'Write message'} <span className="sr-only">to {p.name}</span></button>}
                    {p.last_out_at && !p.last_in_at && !p.dnc && <button className="btn btn-ghost btn-sm" onClick={() => replied(p)}>They replied <span className="sr-only">{p.name}</span></button>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {writing && <WriteMessage person={writing} load={() => api.warmDraft(writing.id).then((d) => d.text)} onClose={() => setWriting(null)} onSent={() => { onToast(`Marked as sent to ${writing.name}.`); setWriting(null); load(); }} />}
    </div>
  );
}

function AddPerson({ onAdded }: { onAdded: (c: Contact) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [how, setHow] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { contact } = await api.addContact({ name, phone, source: 'warm', source_detail: how });
      setName(''); setPhone(''); setHow(''); setError(null);
      onAdded(contact);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-5 space-y-3 rounded-lg border border-rule p-4">
      <h3 className="font-semibold">Add someone you know</h3>
      <Field label="Name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />}</Field>
      <Field label="WhatsApp number">{(id) => <input id={id} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />}</Field>
      <Field label="How you know them" hint="Shown only to you, e.g. college friend, uncle, old colleague">{(id) => <input id={id} className="input" value={how} onChange={(e) => setHow(e.target.value)} />}</Field>
      {error && <p role="alert" className="text-sm text-flag">{error}</p>}
      <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />} Add</button>
    </form>
  );
}
