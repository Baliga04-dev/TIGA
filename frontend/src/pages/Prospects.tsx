import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Footprints, Loader2, Moon, PenLine } from 'lucide-react';
import { PageHeader, Card, Notice, Toast } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import type { AnalystStatus, Prospect } from '../types';

const PROBLEM_LABEL: Record<string, string> = {
  no_website: 'no website',
  site_down: 'site down',
  not_mobile: 'not mobile-friendly',
  no_https: 'not secure (no HTTPS)',
  outdated: 'looks outdated',
  slow: 'slow',
};

const COUNT_LABELS: [string, string][] = [
  ['drafted', 'Drafted for you'],
  ['ready', 'Ready to draft'],
  ['needs_contact', 'Need a contact'],
  ['new', 'Waiting for a site check'],
  ['no_contact', 'No contact listed'],
  ['disqualified', 'Not a fit'],
];

function Problems({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((p) => <span key={p} className="badge badge-amber">{PROBLEM_LABEL[p] ?? p}</span>)}
    </span>
  );
}

function NeedsEmail({ p, onDone, onError }: { p: Prospect; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      onDone(done);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  const where = p.website || p.link;
  return (
    <li className="py-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{p.name}</span>
        {p.category && <span className="text-ink-3">{p.category}</span>}
        <Problems items={p.problems} />
      </p>
      {p.title && p.title !== p.name && <p className="text-sm text-ink-2">{p.title}</p>}
      {where && <a href={where} target="_blank" rel="noopener noreferrer" className="text-sm text-pen underline">{where}</a>}
      {p.note && <p className="text-xs text-ink-3">{p.note}</p>}
      <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); act(() => api.addProspectEmail(p.id, email), `Drafted for ${p.name}. It's in your approval inbox.`); }}>
        <label className="sr-only" htmlFor={`email-${p.id}`}>Email you found for {p.name}</label>
        <input id={`email-${p.id}`} type="email" required placeholder="email you found on their site" className="input max-w-xs" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={busy || !email}>
          <PenLine className="size-4" aria-hidden="true" /> Draft it <span className="sr-only">for {p.name}</span>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => api.skipProspect(p.id), `Skipped ${p.name}`)}>
          Skip <span className="sr-only">{p.name}</span>
        </button>
      </form>
    </li>
  );
}

export function Prospects() {
  const [items, setItems] = useState<Prospect[]>([]);
  const [status, setStatus] = useState<AnalystStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([api.listProspects('needs_contact'), api.getAnalystStatus()]);
      setItems(list.items);
      setStatus(st);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prospects');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const collect = useAction(async () => {
    const { result } = await api.runAnalyst('collect');
    await refresh();
    setToast(`Collected ${result.new ?? 0} new businesses and checked ${result.checked ?? 0} websites.`);
  });
  const write = useAction(async () => {
    const { result } = await api.runAnalyst('write');
    await refresh();
    setToast(`${result.drafted ?? 0} drafts written. Review them on the Outreach page.`);
  });

  const done = (message: string) => { setToast(message); refresh(); };
  const phoneOnly = items.filter((p) => p.phone && !p.website && !p.link);
  const needEmail = items.filter((p) => !(p.phone && !p.website && !p.link));
  const counts = status?.counts ?? {};
  const failure = error ?? collect.error ?? write.error;

  return (
    <>
      <PageHeader
        title="Prospects"
        description="Businesses across Bengaluru the Analyst found overnight. Drafts go to your approval inbox; the rest wait for a contact."
      />
      {failure && <div className="mb-6"><Notice title="Something went wrong">{failure}</Notice></div>}

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <Moon className="size-4" aria-hidden="true" />
          {status?.enabled === false ? 'Overnight schedule is off.' : status?.schedule}
          {status?.last && ` Last run ${status.last.at} (${status.last.phase}).`}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => collect.run()} disabled={collect.pending}>
          {collect.pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Collect now
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => write.run()} disabled={write.pending}>
          {write.pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Write drafts now
        </button>
        {(counts.drafted ?? 0) > 0 && <Link to="/outreach" className="text-sm font-medium text-pen underline">Review drafts</Link>}
      </div>

      <dl aria-label="Prospect counts" className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
        {COUNT_LABELS.map(([key, label]) => (
          <div key={key} className="bg-sheet p-3">
            <dt className="text-xs text-ink-2">{label}</dt>
            <dd className="figure text-2xl">{counts[key] ?? 0}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card title={`Needs an email (${needEmail.length})`}>
          <p className="mb-2 text-sm text-ink-2">Open their site, find the published address, paste it here, and Tiga writes the draft.</p>
          {needEmail.length === 0 ? <p className="text-sm text-ink-3">Nothing waiting.</p> : (
            <ul className="divide-y divide-rule">
              {needEmail.map((p) => <NeedsEmail key={p.id} p={p} onDone={done} onError={setError} />)}
            </ul>
          )}
        </Card>

        <Card title={`Visit in person (${phoneOnly.length})`} action={<Link to="/marketing?tab=walk-ins" className="btn btn-secondary btn-sm"><Footprints className="size-4" aria-hidden="true" /> Plan a walk</Link>}>
          <p className="mb-2 text-sm text-ink-2">
            These list only a phone number. WhatsApp's rules need a number to be given to you before you message it, and
            repeated cold calls can get your own number blocked, so these are best visited: they appear on your walk-in routes.
          </p>
          {phoneOnly.length === 0 ? <p className="text-sm text-ink-3">Nothing waiting.</p> : (
            <ul className="divide-y divide-rule">
              {phoneOnly.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>
                    <span className="font-medium">{p.name}</span> <span className="text-ink-3">{p.category}</span>
                    {p.address && <span className="block text-xs text-ink-3">{p.address}</span>}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => api.skipProspect(p.id).then(() => done(`Skipped ${p.name}`), (e: Error) => setError(e.message))}>
                      Skip <span className="sr-only">{p.name}</span>
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="mt-8 text-xs text-ink-3">
        Business listings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>.
      </p>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
