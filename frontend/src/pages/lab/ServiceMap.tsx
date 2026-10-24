import { useState } from 'react';
import { api } from '../../services/api';
import type { LabService, LabSnapshot } from '../../types';
import { cn } from '../../lib/utils';

const APP = ['gateway', 'menu', 'orders', 'payments', 'notifier', 'customers'];
const ORDER = [...APP, 'postgres', 'redis'];
const ROLE: Record<string, string> = {
  gateway: 'Front door on 127.0.0.1:8080',
  menu: 'Menu, prices and stock',
  orders: 'Takes orders, charges, notifies',
  payments: 'Pretend UPI provider',
  notifier: 'Sends WhatsApp confirmations',
  customers: 'Pretend shoppers making traffic',
  postgres: 'The database',
  redis: 'Cache, queue and knobs',
};

const seconds = (s: number) => (s >= 1 ? `${s.toFixed(1)} s` : `${Math.round(s * 1000)} ms`);

function light(containers: LabService[], health?: string) {
  if (!containers.length) return { tone: 'bg-ink-3', label: 'not created' };
  const running = containers.filter((c) => c.state === 'running');
  if (!running.length) return { tone: 'bg-flag', label: containers[0].state };
  if (health && health !== 'up') return { tone: 'bg-flag', label: health };
  if (running.some((c) => c.health === 'unhealthy')) return { tone: 'bg-flag', label: 'unhealthy' };
  if (running.some((c) => c.health === 'starting')) return { tone: 'bg-mark', label: 'starting' };
  return { tone: 'bg-ledger', label: running.length > 1 ? `${running.length} running` : 'running' };
}

/** Every container as a tile: is it up, how busy, how many failures, how slow; with stop, start and restart. */
export function ServiceMap({ services, snap, onChanged, onError }: {
  services: LabService[]; snap: LabSnapshot | null; onChanged: () => void; onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Services">
      {ORDER.map((name) => {
        const containers = services.filter((s) => s.name === name);
        const l = light(containers, snap?.health?.[name]);
        const r = snap?.services?.[name];
        const up = containers.some((c) => c.state === 'running');
        return (
          <li key={name} className="rounded-lg border border-rule bg-sheet p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{name}</p>
              <span className="flex items-center gap-1.5 text-xs text-ink-2">
                <span className={cn('size-2 rounded-full', l.tone)} aria-hidden="true" />{l.label}
              </span>
            </div>
            <p className="text-xs text-ink-3">{ROLE[name]}</p>
            {r && (
              <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
                <div><dt className="text-ink-3">req/s</dt><dd className="figure">{r.rps}</dd></div>
                <div><dt className="text-ink-3">errors</dt><dd className={cn('figure', r.error_rate > 0.05 && 'text-flag')}>{Math.round(r.error_rate * 100)}%</dd></div>
                <div><dt className="text-ink-3">p95</dt><dd className={cn('figure', r.p95_s > 1 && 'text-flag')}>{seconds(r.p95_s)}</dd></div>
              </dl>
            )}
            {r?.db_qps !== undefined && (
              <p className="mt-1 text-xs text-ink-2">Menu page database queries: <span className="figure">{r.db_qps}/s</span></p>
            )}
            {r?.routes && Object.keys(r.routes).length > 1 && (
              <ul className="mt-2 space-y-0.5 border-t border-rule pt-2 text-xs" aria-label={`${name} routes`}>
                {Object.entries(r.routes).filter(([, v]) => v.rps > 0).slice(0, 4).map(([route, v]) => (
                  <li key={route} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-ink-3">{route}</span>
                    <span className={cn('figure', v.p95_s > 1 && 'text-flag')}>{seconds(v.p95_s)}</span>
                  </li>
                ))}
              </ul>
            )}
            {containers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {up ? (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run(`${name}-stop`, () => api.labService('stop', name))}>Stop <span className="sr-only">{name}</span></button>
                    <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run(`${name}-restart`, () => api.labService('restart', name))}>Restart <span className="sr-only">{name}</span></button>
                  </>
                ) : (
                  <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => run(`${name}-start`, () => api.labService('start', name))}>Start <span className="sr-only">{name}</span></button>
                )}
                {APP.includes(name) && (
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} title="Rebuild from your edited code in lab/services"
                    onClick={() => run(`${name}-rebuild`, () => api.labService('rebuild', name))}>Rebuild <span className="sr-only">{name}</span></button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
