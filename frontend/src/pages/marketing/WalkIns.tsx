import { useEffect, useState, type FormEvent } from 'react';
import { Footprints, Inbox, Loader2, Printer, Route } from 'lucide-react';
import { Field, Modal, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Channel, RouteStop, VisitOutcome, WalkRoute } from '../../types';
import { CATEGORIES, CHANNEL_LABEL, OUTCOME_LABEL, errorText } from './shared';

const RADII = [0.5, 1, 1.5, 2];

/** Plan a walk through one neighbourhood, print the sheets, then log each visit. */
export function WalkInsPanel({ onToast }: { onToast: (m: string) => void }) {
  const [localities, setLocalities] = useState<string[]>([]);
  const [locality, setLocality] = useState('');
  const [category, setCategory] = useState('all');
  const [radius, setRadius] = useState(1);
  const [route, setRoute] = useState<WalkRoute | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visiting, setVisiting] = useState<RouteStop | null>(null);

  useEffect(() => {
    api.localities().then((r) => { setLocalities(r.items); setLocality((l) => l || r.items[0] || ''); }).catch((e) => setError(errorText(e)));
  }, []);

  const plan = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    try {
      setRoute(await api.walkRoute(locality, category, radius));
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const query = new URLSearchParams({ locality, category, radius_km: String(radius) });

  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-6">
        <form onSubmit={plan} className="space-y-3 rounded-lg border border-rule p-4">
          <h3 className="font-semibold">Plan a walk</h3>
          <Field label="Neighbourhood">{(id) => (
            <select id={id} className="input" value={locality} onChange={(e) => setLocality(e.target.value)}>
              {localities.map((l) => <option key={l}>{l}</option>)}
            </select>
          )}</Field>
          <Field label="Kind of shop">{(id) => (
            <select id={id} className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}</Field>
          <Field label="How far to walk">{(id) => (
            <select id={id} className="input" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {RADII.map((r) => <option key={r} value={r}>Within {r} km of the centre</option>)}
            </select>
          )}</Field>
          <button className="btn btn-primary btn-sm" disabled={busy || !locality}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Route className="size-4" aria-hidden="true" />} Plan the route
          </button>
        </form>
        <InboundForm onFound={(m) => onToast(m)} />
      </div>

      <div>
        {error && <div className="mb-4"><Notice title="Something went wrong">{error}</Notice></div>}
        {!route && !error && (
          <div className="rounded-lg border border-dashed border-rule p-6 text-sm">
            <p className="font-medium">Pick a neighbourhood and plan a walk.</p>
            <p className="mt-1 text-ink-2">
              Tiga lists the shops near its centre with no website or a broken one, in walking order, and skips anyone
              you visited in the last 60 days or who said no. Go at a quiet hour; leave the audit sheet only if they want it.
            </p>
          </div>
        )}
        {route && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" aria-live="polite">
                <span className="font-semibold">{route.stops.length} shops</span> in {route.locality}, about {route.minutes} minutes of walking.
              </p>
              {route.stops.length > 0 && (
                <a className="btn btn-secondary btn-sm" href={`/api/marketing/print/route?${query}`} target="_blank" rel="noopener noreferrer">
                  <Printer className="size-4" aria-hidden="true" /> Print the route sheet
                </a>
              )}
            </div>
            {route.without_coordinates > 0 && (
              <p className="mb-3 text-xs text-ink-2">
                {route.without_coordinates} prospects have no map position yet; the Analyst fills them in on its next evening run.
              </p>
            )}
            {route.stops.length === 0 ? (
              <div className="rounded-lg border border-dashed border-rule p-6 text-sm">
                <p className="font-medium">No shops left to visit here.</p>
                <p className="mt-1 text-ink-2">Widen the distance, choose every kind of shop, or try the next neighbourhood.</p>
              </div>
            ) : (
              <ol className="divide-y divide-rule border-y border-rule">
                {route.stops.map((s, i) => (
                  <li key={s.id} className="grid gap-2 py-3 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-start">
                    <span className="font-mono text-sm text-ink-2">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{s.name} <span className="text-sm font-normal text-ink-2">{s.category.replace('_', ' ')}</span></p>
                      {s.address && <p className="text-sm text-ink-2">{s.address}</p>}
                      {s.why[0] && <p className="mt-1 text-sm">{s.why[0]}</p>}
                      <p className="mt-1 font-mono text-xs text-ink-2">Ref {s.ref}, {s.walk_m} m from the last stop</p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <a className="btn btn-secondary btn-sm" href={`/api/marketing/print/audit/${s.id}`} target="_blank" rel="noopener noreferrer">
                        <Printer className="size-4" aria-hidden="true" /> Audit sheet <span className="sr-only">for {s.name}</span>
                      </a>
                      <button className="btn btn-primary btn-sm" onClick={() => setVisiting(s)}>
                        <Footprints className="size-4" aria-hidden="true" /> Log visit <span className="sr-only">to {s.name}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      {visiting && (
        <VisitLog stop={visiting} onClose={() => setVisiting(null)}
          onSaved={(m) => { onToast(m); setVisiting(null); plan(); }} />
      )}
    </div>
  );
}

function VisitLog({ stop, onClose, onSaved }: { stop: RouteStop; onClose: () => void; onSaved: (m: string) => void }) {
  const [outcome, setOutcome] = useState<VisitOutcome | ''>('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState<Channel[]>([]);
  const [notice, setNotice] = useState(false);
  const [dnc, setDnc] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (c: Channel) => setConsent((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!outcome) { setError('Choose how the visit went.'); return; }
    if (consent.length > 0 && !phone.trim()) { setError('Write the number they gave you, or untick what they agreed to.'); return; }
    setBusy(true);
    try {
      await api.logVisit({ prospect_id: stop.id, outcome, name, phone, consent: dnc ? [] : consent, notice, note, dnc });
      onSaved(dnc ? `${stop.name} will not be contacted again.` : `Visit to ${stop.name} logged.`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Visit: ${stop.name}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <fieldset>
          <legend className="label">How did it go?</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(Object.keys(OUTCOME_LABEL) as VisitOutcome[]).map((o) => (
              <label key={o} className={`btn btn-sm cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-pen ${outcome === o ? 'btn-primary' : 'btn-secondary'}`}>
                <input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="sr-only" />
                {OUTCOME_LABEL[o]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Their name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}</Field>
          <Field label="Number they gave you">{(id) => <input id={id} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />}</Field>
        </div>
        <fieldset disabled={dnc}>
          <legend className="label">They agreed to hear from you by</legend>
          <div className="mt-1 flex flex-wrap gap-4 text-sm">
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="checkbox" checked={consent.includes(c)} onChange={() => toggle(c)} /> {CHANNEL_LABEL[c]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-2">Only tick what they said yes to, e.g. "Can I WhatsApp you the demo?"</p>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={notice} onChange={(e) => setNotice(e.target.checked)} />
          I told them I'll keep their number only to talk about their website, and delete it when they ask.
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={dnc} onChange={(e) => setDnc(e.target.checked)} />
          They asked not to be contacted. Tiga will never suggest them again.
        </label>
        <Field label="Note">{(id) => <textarea id={id} className="input min-h-[4rem]" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {error && <p role="alert" className="text-sm text-flag">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Save the visit</button>
      </form>
    </Modal>
  );
}

function InboundForm({ onFound }: { onFound: (m: string) => void }) {
  const [ref, setRef] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { contact } = await api.inbound({ ref, name, phone, note: '' });
      setRef(''); setName(''); setPhone(''); setError(null);
      onFound(`${contact.business || contact.name} messaged you. WhatsApp permission recorded.`);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-rule p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Inbox className="size-4" aria-hidden="true" /> A shop messaged you</h3>
      <p className="text-xs text-ink-2">Their first message carries the code from the audit sheet, like "Ref T1042".</p>
      <Field label="Reference code">{(id) => <input id={id} className="input" value={ref} onChange={(e) => setRef(e.target.value)} required placeholder="T1042" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Their name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}</Field>
        <Field label="Their number">{(id) => <input id={id} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />}</Field>
      </div>
      {error && <p role="alert" className="text-sm text-flag">{error}</p>}
      <button className="btn btn-secondary btn-sm">Find the shop</button>
    </form>
  );
}
