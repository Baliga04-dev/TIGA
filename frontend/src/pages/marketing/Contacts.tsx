import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ban, Check, Trash2, UserPlus } from 'lucide-react';
import { Field, Modal, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Channel, Contact, ContactSource } from '../../types';
import { CHANNEL_LABEL, OUTCOME_LABEL, SOURCE_LABEL, errorText, shortDate } from './shared';
import { ConsentBadges } from './ConsentBadges';

/** Everyone Tiga is helping you reach: where they came from, what they agreed to, and a "no" that stays a "no". */
export function ContactsPanel({ onToast }: { onToast: (m: string) => void }) {
  const [source, setSource] = useState<ContactSource | ''>('');
  const [items, setItems] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consenting, setConsenting] = useState<Contact | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'dnc' | 'delete'; contact: Contact } | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    try {
      setItems((await api.listContacts(source)).items);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [source]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      onToast(done);
      setConfirm(null);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Show">{(id) => (
          <select id={id} className="input w-56" value={source} onChange={(e) => setSource(e.target.value as ContactSource | '')}>
            <option value="">Everyone</option>
            {(Object.keys(SOURCE_LABEL) as ContactSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        )}</Field>
        <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}><UserPlus className="size-4" aria-hidden="true" /> Add a contact</button>
      </div>
      {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}
      {items === null && !error && <div aria-busy="true" aria-label="Loading contacts" className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-wash" />)}</div>}
      {items && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-rule p-6 text-sm">
          <p className="font-medium">No contacts {source ? `from ${SOURCE_LABEL[source].toLowerCase()}` : 'yet'}.</p>
          <p className="mt-1 text-ink-2">People appear here when you add someone you know, log a walk-in, or a shop messages you with its reference code.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-rule border-y border-rule">
          {items.map((c) => (
            <li key={c.id} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.business && <span className="text-sm text-ink-2">{c.business}</span>}
                  <ConsentBadges contact={c} />
                </p>
                <p className="text-sm text-ink-2">
                  {SOURCE_LABEL[c.source]}{c.source_detail ? `: ${c.source_detail}` : ''}
                  {c.visits > 0 && `. Visited ${c.visits}×, last: ${OUTCOME_LABEL[c.last_outcome as keyof typeof OUTCOME_LABEL] ?? ''}`}
                  {c.last_out_at && `. Last message ${shortDate(c.last_out_at)}`}
                  {c.last_in_at && `, replied ${shortDate(c.last_in_at)}`}
                </p>
                {!c.dnc && !c.gates.whatsapp.ok && <p className="text-xs text-ink-2">WhatsApp: {c.gates.whatsapp.reason}</p>}
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {!c.dnc && c.source !== 'warm' && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setConsenting(c)}><Check className="size-4" aria-hidden="true" /> Record permission <span className="sr-only">for {c.name}</span></button>
                )}
                {!c.dnc && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ kind: 'dnc', contact: c })}><Ban className="size-4" aria-hidden="true" /> Do not contact <span className="sr-only">{c.name}</span></button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirm({ kind: 'delete', contact: c })}><Trash2 className="size-4" aria-hidden="true" /> Delete <span className="sr-only">{c.name}</span></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {consenting && <ConsentForm contact={consenting} onClose={() => setConsenting(null)} onSaved={(m) => { setConsenting(null); onToast(m); load(); }} />}
      {adding && <AddContact onClose={() => setAdding(false)} onAdded={(c) => { setAdding(false); onToast(`${c.name} added.`); load(); }} />}
      {confirm && (
        <Modal title={confirm.kind === 'dnc' ? `Never contact ${confirm.contact.name}?` : `Delete ${confirm.contact.name}?`} onClose={() => setConfirm(null)}>
          <p className="text-sm">
            {confirm.kind === 'dnc'
              ? 'Tiga will refuse every message, call and email to them, and keep their number on a do-not-contact list even if you delete them later.'
              : 'Their details and history go. If they asked not to be contacted, that stays on record so Tiga never suggests them again.'}
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn btn-danger" onClick={() => act(
              confirm.kind === 'dnc' ? () => api.doNotContact(confirm.contact.id, 'asked not to be contacted') : () => api.deleteContact(confirm.contact.id),
              confirm.kind === 'dnc' ? `${confirm.contact.name} will not be contacted.` : `${confirm.contact.name} deleted.`,
            )}>{confirm.kind === 'dnc' ? 'Do not contact' : 'Delete'}</button>
            <button className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ConsentForm({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: (m: string) => void }) {
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [how, setHow] = useState('asked in person');
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.giveConsent(contact.id, channel, how, notice);
      onSaved(`${contact.name} agreed to ${CHANNEL_LABEL[channel]}.`);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Modal title={`Permission from ${contact.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <Field label="They agreed to">{(id) => (
          <select id={id} className="input" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        )}</Field>
        <Field label="How" hint="e.g. asked in person, replied yes on WhatsApp, filled the form">{(id) => <input id={id} className="input" value={how} onChange={(e) => setHow(e.target.value)} />}</Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
          I told them how I'll use their details and that they can ask me to delete them.
        </label>
        {error && <p role="alert" className="text-sm text-flag">{error}</p>}
        <button className="btn btn-primary">Save</button>
      </form>
    </Modal>
  );
}

function AddContact({ onClose, onAdded }: { onClose: () => void; onAdded: (c: Contact) => void }) {
  const [form, setForm] = useState({ name: '', business: '', phone: '', email: '', source: 'referral' as ContactSource, source_detail: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      onAdded((await api.addContact(form)).contact);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <Modal title="Add a contact" onClose={onClose}>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">{(id) => <input id={id} className="input" value={form.name} onChange={set('name')} required />}</Field>
        <Field label="Shop or business">{(id) => <input id={id} className="input" value={form.business} onChange={set('business')} />}</Field>
        <Field label="Phone">{(id) => <input id={id} className="input" value={form.phone} onChange={set('phone')} inputMode="tel" />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" className="input" value={form.email} onChange={set('email')} />}</Field>
        <Field label="Where they came from">{(id) => (
          <select id={id} className="input" value={form.source} onChange={set('source')}>
            {(['referral', 'warm', 'other'] as ContactSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        )}</Field>
        <Field label="Details" hint="e.g. referred by Kavya">{(id) => <input id={id} className="input" value={form.source_detail} onChange={set('source_detail')} />}</Field>
        {error && <p role="alert" className="text-sm text-flag sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2"><button className="btn btn-primary">Add</button></div>
      </form>
    </Modal>
  );
}
