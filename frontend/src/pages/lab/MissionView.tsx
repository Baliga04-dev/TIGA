import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { LabMission } from '../../types';
import { Notice } from '../../components/ui';
import { Prose } from '../../components/Prose';
import { cn } from '../../lib/utils';

const LABELS: Record<string, string> = {
  break: 'Break it',
  fix: 'Quick fix',
  plan: 'See the query plan',
  stale: 'Show the stale price',
  scale: 'Scale the notifier to 3',
  poison: 'Poison some messages',
  undo: 'Undo',
};
const ORDER = ['break', 'plan', 'fix', 'stale', 'scale', 'poison', 'undo'];

/** One mission: the lesson in its seven parts, the buttons that break and fix the shop, and the check. */
export function MissionView({ id, running }: { id: string; running: boolean }) {
  const [mission, setMission] = useState<LabMission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ text: string; passed?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    setMission(null);
    setOutput(null);
    setAnswer('');
    api.labMission(id).then((r) => { setMission(r.mission); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the mission'));
  }, [id]);

  const press = async (action: string) => {
    setBusy(action);
    setOutput(null);
    try {
      if (action === 'check') {
        const r = await api.labCheck(id, answer);
        setOutput({ text: r.detail, passed: r.passed });
      } else {
        const r = await api.labAct(id, action);
        setOutput({ text: r.detail });
      }
    } catch (e) {
      setOutput({ text: e instanceof Error ? e.message : 'That did not work', passed: false });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Notice>{error}</Notice>;
  if (!mission) return <div className="skeleton h-64 w-full" aria-busy="true" aria-label="Loading the mission" />;

  const actions = ORDER.filter((a) => mission.actions.includes(a));
  return (
    <article aria-labelledby="mission-title">
      <p className="text-xs font-medium text-ink-3">{mission.topic}</p>
      <h2 id="mission-title" className="mb-4 text-xl font-semibold">{mission.title}</h2>

      <div className="sticky top-0 z-10 -mx-1 mb-6 rounded-lg border border-rule bg-sheet p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          {actions.map((a) => (
            <button key={a} disabled={!running || !!busy} onClick={() => press(a)}
              className={cn('btn btn-sm', a === 'break' ? 'btn-danger' : a === 'fix' ? 'btn-primary' : 'btn-secondary')}>
              {busy === a ? 'Working…' : LABELS[a] ?? a}
            </button>
          ))}
          {id === 'find-the-slow-one' && (
            <label className="text-sm">
              <span className="sr-only">Which service is slow?</span>
              <input className="input h-8 w-40 py-1 text-sm" placeholder="Which service?" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </label>
          )}
          <button disabled={!running || !!busy} onClick={() => press('check')} className="btn btn-sm btn-secondary">
            {busy === 'check' ? 'Checking…' : 'Check'}
          </button>
        </div>
        {!running && <p className="mt-2 text-xs text-ink-3">Start the lab to use these buttons. You can read the mission now.</p>}
        {output && (
          <p role="status" className={cn('mt-3 whitespace-pre-wrap rounded-md p-2 text-sm',
            output.passed === true ? 'bg-ledger/10' : output.passed === false ? 'bg-flag/10' : 'bg-wash')}>
            {output.passed === true ? 'Passed. ' : output.passed === false ? 'Not yet. ' : ''}{output.text}
          </p>
        )}
      </div>

      <div className="space-y-6">
        {mission.sections.map((s) => (
          <section key={s.title}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-2">{s.title}</h3>
            <Prose text={s.text} />
          </section>
        ))}
      </div>
    </article>
  );
}
