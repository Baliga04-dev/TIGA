import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { api } from '../services/api';
import type { Routine } from '../types';
import { Card, Notice } from './ui';
import { cn } from '../lib/utils';

const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Recurring tasks: Tiga runs the command on schedule, the same way as if you had typed it in Chat. */
export function Routines() {
  const [items, setItems] = useState<Routine[] | null>(null);
  const [command, setCommand] = useState('');
  const [schedule, setSchedule] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(() => {
    api.listRoutines().then((r) => setItems(r.items)).catch((e) => {
      setItems([]);
      setError(e instanceof Error ? e.message : 'Could not load routines');
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    setSaving(true);
    try {
      await api.addRoutine(command.trim(), schedule.trim());
      setCommand('');
      setSchedule('');
      setError(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the routine');
    } finally {
      setSaving(false);
    }
  };

  const act = (p: Promise<unknown>) => p.then(refresh).catch((e) => setError(e instanceof Error ? e.message : 'That did not work'));

  return (
    <Card title="Routines">
      {items === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading routines">
          <div className="skeleton h-5 w-3/4" />
          <div className="skeleton h-5 w-1/2" />
        </div>
      ) : items.length === 0 ? (
        <p className="mb-4 text-sm text-ink-2">Nothing repeats yet. Tell Tiga "every Monday at 9am, who is waiting on me" or add one below.</p>
      ) : (
        <ul className="mb-4 divide-y divide-rule text-sm">
          {items.map((r) => (
            <li key={r.id} className={cn('flex items-start justify-between gap-3 py-2.5', !r.active && 'opacity-70')}>
              <div className="min-w-0">
                <p className="font-medium">{r.command}</p>
                <p className="text-ink-2">
                  {r.when}
                  {r.active ? <>, next <span className="figure">{when(r.next_at)}</span></> : ', paused'}
                </p>
                {r.last_result && <p className="mt-0.5 truncate text-ink-3" title={r.last_result}>Last time: {r.last_result}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn btn-ghost btn-sm p-1" aria-label={`${r.active ? 'Pause' : 'Resume'} routine: ${r.command}`}
                  onClick={() => act(api.setRoutineActive(r.id, !r.active))}>
                  {r.active ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                </button>
                <button className="btn btn-ghost btn-sm p-1" aria-label={`Delete routine: ${r.command}`} onClick={() => act(api.deleteRoutine(r.id))}>
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <Notice>{error}</Notice>}
      <form className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]" onSubmit={(e) => { e.preventDefault(); if (command.trim() && schedule.trim()) add(); }}>
        <label className="sr-only" htmlFor="routine-command">What to do</label>
        <input id="routine-command" className="input" placeholder="What to do, e.g. who is waiting on me" value={command} onChange={(e) => setCommand(e.target.value)} />
        <label className="sr-only" htmlFor="routine-when">When</label>
        <input id="routine-when" className="input" placeholder="every Monday at 9am" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        <button className="btn btn-secondary" disabled={saving || !command.trim() || !schedule.trim()}>Add</button>
      </form>
      <p className="mt-2 text-xs text-ink-3">Runs like a chat message. Anything that needs your click is skipped and noted here.</p>
    </Card>
  );
}
