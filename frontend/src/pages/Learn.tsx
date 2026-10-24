import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Card, Notice, CopyButton } from '../components/ui';
import { api } from '../services/api';
import type { LabIncident, LabLogLine, LabMissionSummary, LabSnapshot, LabStatus } from '../types';
import { cn } from '../lib/utils';
import { ServiceMap } from './lab/ServiceMap';
import { MissionView } from './lab/MissionView';

const INSTALL = 'sudo apt update && sudo apt install -y docker.io docker-compose-v2 && sudo usermod -aG docker $USER';
const LOG_SERVICES = ['', 'gateway', 'menu', 'orders', 'payments', 'notifier', 'customers'];

function Logs({ running }: { running: boolean }) {
  const [service, setService] = useState('');
  const [rid, setRid] = useState('');
  const [items, setItems] = useState<LabLogLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.labLogs(service, rid.trim()).then((r) => { setItems(r.items.slice(-120).reverse()); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not read the logs'));
  }, [service, rid]);
  useEffect(() => { if (running) load(); }, [running, load]);

  return (
    <Card title="Logs">
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-2">Service</span>
          <select className="input h-9 py-1" value={service} onChange={(e) => setService(e.target.value)}>
            {LOG_SERVICES.map((s) => <option key={s} value={s}>{s || 'All services'}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-2">Request id</span>
          <input className="input h-9 w-48 py-1 font-mono text-xs" value={rid} onChange={(e) => setRid(e.target.value)} placeholder="paste one to follow it" />
        </label>
        <button className="btn btn-secondary btn-sm" disabled={!running}>Refresh</button>
      </form>
      {error && <Notice>{error}</Notice>}
      {!running ? <p className="text-sm text-ink-2">Logs appear once the lab is running.</p> : (
        <div className="max-h-96 overflow-auto rounded-md border border-rule">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-sheet text-ink-3">
              <tr><th className="p-2 font-medium">Time</th><th className="p-2 font-medium">Service</th><th className="p-2 font-medium">What</th><th className="p-2 font-medium">Request id</th></tr>
            </thead>
            <tbody className="divide-y divide-rule font-mono">
              {(items ?? []).map((l, i) => (
                <tr key={i} className={cn(typeof l.status === 'number' && l.status >= 500 && 'bg-flag/10')}>
                  <td className="whitespace-nowrap p-2 text-ink-3">{new Date(l.ts * 1000).toLocaleTimeString()}</td>
                  <td className="p-2">{l.service}</td>
                  <td className="p-2">{l.event === 'request' ? `${l.method ?? ''} ${l.route} → ${l.status} in ${l.ms} ms` : `${l.event}${l.error ? `: ${String(l.error)}` : ''}${l.order_id ? ` order #${String(l.order_id)}` : ''}`}</td>
                  <td className="p-2"><button className="underline decoration-dotted" onClick={() => setRid(l.request_id)} title="Follow this request">{l.request_id}</button></td>
                </tr>
              ))}
              {items?.length === 0 && <tr><td colSpan={4} className="p-3 text-ink-2">No matching lines.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Customers({ snap }: { snap: LabSnapshot | null }) {
  const c = snap?.customers;
  const [rps, setRps] = useState<number | null>(null);
  if (!c) return null;
  const traffic = rps ?? c.rps_target;
  return (
    <Card title="What customers feel (last minute)">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div><dt className="text-xs text-ink-3">Requests</dt><dd className="figure text-lg">{c.requests}</dd></div>
        <div><dt className="text-xs text-ink-3">Failed</dt><dd className={cn('figure text-lg', c.error_rate > 0.05 && 'text-flag')}>{Math.round(c.error_rate * 100)}%</dd></div>
        <div><dt className="text-xs text-ink-3">Typical wait</dt><dd className="figure text-lg">{c.p50_s}s</dd></div>
        <div><dt className="text-xs text-ink-3">Slowest 1 in 20</dt><dd className={cn('figure text-lg', c.p95_s > 3 && 'text-flag')}>{c.p95_s}s</dd></div>
        <div><dt className="text-xs text-ink-3">Sold out</dt><dd className="figure text-lg">{c.sold_out}</dd></div>
      </dl>
      <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span>Customers a second: <span className="figure">{traffic}</span></span>
        <input type="range" min={0} max={30} step={1} value={traffic} className="w-56"
          onChange={(e) => setRps(Number(e.target.value))}
          onPointerUp={() => rps !== null && api.labKnobs('customers', { rps })}
          onKeyUp={() => rps !== null && api.labKnobs('customers', { rps })} />
      </label>
    </Card>
  );
}

function Incidents({ items, onOpen }: { items: LabIncident[]; onOpen: (mission: string) => void }) {
  const open = items.filter((i) => !i.resolved_at);
  return (
    <Card title={`Incidents (${open.length} open)`}>
      {items.length === 0 ? <p className="text-sm text-ink-2">Nothing has broken yet. Break something from a mission and Tiga files it here within 15 seconds.</p> : (
        <ul className="divide-y divide-rule text-sm">
          {items.slice(0, 12).map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className={cn('font-medium', i.resolved_at && 'text-ink-3 line-through')}>{i.title}</p>
                <p className="text-ink-2">{i.detail}</p>
                <p className="text-xs text-ink-3">
                  {i.resolved_at ? `fixed ${new Date(i.resolved_at).toLocaleTimeString()}` : `open since ${new Date(i.opened_at).toLocaleTimeString()}, seen ${i.seen} times`}
                </p>
              </div>
              {i.mission && <button className="btn btn-ghost btn-sm" onClick={() => onOpen(i.mission)}>Learn why</button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Learn() {
  const [hidden, setHidden] = useState(false);
  const [missions, setMissions] = useState<LabMissionSummary[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [status, setStatus] = useState<LabStatus | null>(null);
  const [snap, setSnap] = useState<LabSnapshot | null>(null);
  const [incidents, setIncidents] = useState<LabIncident[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.labMissions()
      .then((r) => { setMissions(r.items); setCurrent((c) => c ?? r.items[0]?.id ?? null); })
      .catch((e: Error & { status?: number }) => { if (e.status === 404) setHidden(true); else setError(e.message); });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.labStatus();
      setStatus(s);
      if (s.running) {
        api.labSnapshot().then(setSnap).catch(() => undefined);
        api.labIncidents().then((r) => setIncidents(r.items)).catch(() => undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the lab');
    }
  }, []);
  // only once Learn is known to be on: a switched-off Tiga answers 404 to all of this
  const enabled = missions !== null;
  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);
  const live = !!status?.running || !!status?.job;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(refresh, 5000);
    return () => window.clearInterval(t);
  }, [live, refresh]);

  const start = async () => { try { await api.labUp(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the lab'); } };
  const stop = async () => { try { await api.labDown(); setSnap(null); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not stop the lab'); } };

  if (hidden) {
    return (
      <>
        <PageHeader title="Learn" description="This service is switched off." />
        <Notice tone="info">Set TIGA_LEARN_ENABLED=true in your own tiga/.env and restart to use it.</Notice>
      </>
    );
  }

  const running = !!status?.running;
  return (
    <>
      <PageHeader title="Learn" description="ShopLab: a small online bakery built as real microservices. Break it, watch it, fix it, and learn why." />
      {error && <div className="mb-6"><Notice>{error}</Notice></div>}

      <div className="mb-8 space-y-6">
        {status && !status.docker ? (
          <Card title="Install Docker once">
            <p className="mb-3 text-sm text-ink-2">The lab runs each service in its own container, the way companies run them. Docker is free. In your Ubuntu terminal:</p>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-md bg-wash p-3 text-xs">{INSTALL}</pre>
              <CopyButton text={INSTALL} iconOnly label="Copy the install command" />
            </div>
            <p className="mt-3 text-sm text-ink-2">Then run <code className="rounded bg-wash px-1">wsl --shutdown</code> in Windows PowerShell, reopen Ubuntu and restart Tiga. You can read every mission meanwhile.</p>
          </Card>
        ) : status && (
          <Card title="The lab" action={running
            ? <button className="btn btn-secondary btn-sm" onClick={stop}>Stop the lab</button>
            : <button className="btn btn-primary btn-sm" disabled={!!status.job} onClick={start}>Start the lab</button>}>
            {status.job && <p role="status" className="mb-3 text-sm text-ink-2">{status.job}… The first start builds the images and loads 600,000 rows; give it a few minutes.</p>}
            {status.last_job && !status.last_job.ok && <div className="mb-3"><Notice title={`${status.last_job.name} failed`}>{status.last_job.detail}</Notice></div>}
            {!running && !status.job && <p className="mb-3 text-sm text-ink-2">Stopped. Start it to bring up the gateway, five services, Postgres and Redis on your PC (only reachable from this machine).</p>}
            <ServiceMap services={status.services} snap={snap} onChanged={refresh} onError={setError} />
          </Card>
        )}
        {running && <Customers snap={snap} />}
        {running && <Incidents items={incidents} onOpen={setCurrent} />}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Missions">
          <ol className="space-y-1">
            {missions?.map((m, i) => (
              <li key={m.id}>
                <button className={cn('w-full rounded px-3 py-2 text-left text-sm', m.id === current ? 'bg-wash font-medium' : 'hover:bg-wash/60')}
                  aria-current={m.id === current ? 'page' : undefined} onClick={() => setCurrent(m.id)}>
                  <span className="figure mr-2 text-ink-3">{String(i).padStart(2, '0')}</span>{m.title}
                  <span className="block pl-7 text-xs text-ink-3">{m.topic}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0">{current && <MissionView id={current} running={running} />}</div>
      </div>

      <div className="mt-10"><Logs running={running} /></div>
    </>
  );
}
