import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CloudRain, Sun as SunIcon, Volume2, X } from 'lucide-react';
import { Card, Notice } from './ui';
import { api } from '../services/api';
import { cn } from '../lib/utils';
import type { Briefing, Note, Reminder } from '../types';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function NextUpSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="skeleton h-5 w-48" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
    </div>
  );
}

/** The day at a glance: what to do next (each row opens the page that does it), the numbers, notes. */
export function TodayPanel() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [briefFailed, setBriefFailed] = useState(false);

  useEffect(() => {
    api.getBriefing().then((b) => { setBrief(b); setBriefFailed(false); }).catch(() => setBriefFailed(true));
  }, []);

  const speak = () => {
    if (brief && 'speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(brief.text));
  };

  const todo = brief?.todo ?? brief?.cards.find((c) => c.title === 'To do today')?.lines.map((text) => ({ text, link: '' })) ?? [];
  const f = brief?.figures;
  const w = brief?.weather;

  return (
    <>
      <section aria-label="Next up" className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-rule bg-sheet p-6 shadow-[0_1px_2px_rgb(var(--board)/0.06),0_18px_40px_-26px_rgb(var(--board)/0.35)] sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-ink-2">{brief?.greeting ?? 'Today'}</p>
              <h2 className="text-xl font-semibold">Next up</h2>
            </div>
            <div className="flex items-center gap-2">
              {w && (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-wash px-3 py-1 text-xs text-ink-2">
                  {w.rain >= 50 ? <CloudRain className="size-3.5" aria-hidden="true" /> : <SunIcon className="size-3.5" aria-hidden="true" />}
                  Bengaluru {w.low}–{w.high}°C, {w.rain}% rain
                </span>
              )}
              {brief && (
                <button className="btn btn-ghost btn-sm" onClick={speak}>
                  <Volume2 className="size-4" aria-hidden="true" /> Read it to me
                </button>
              )}
            </div>
          </div>
          {briefFailed && <Notice>Couldn't put today's briefing together. Is the Tiga backend running?</Notice>}
          {!brief && !briefFailed && <NextUpSkeleton />}
          {brief && (todo.length === 0 ? (
            <p className="text-ink-2">Nothing urgent. A good day to <Link to="/prospects" className="font-medium">find new prospects</Link>.</p>
          ) : (
            <ol className="space-y-2">
              {todo.map((t, i) => {
                const row = (
                  <>
                    <span aria-hidden="true" className={cn('h-8 w-1 shrink-0 rounded-full', i === 0 ? 'bg-mark' : 'bg-rule')} />
                    <span className={cn('flex-1', i === 0 ? 'font-medium text-ink' : 'text-ink-2')}>{t.text}</span>
                    {t.link && <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
                  </>
                );
                return (
                  <li key={t.text}>
                    {t.link ? (
                      <Link to={t.link} className="group flex items-center gap-3 rounded-lg px-2 py-2 text-[0.975rem] no-underline hover:bg-wash">{row}</Link>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2 text-[0.975rem]">{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          ))}
        </div>

        <dl aria-label="Your numbers" className="grid grid-cols-2 content-start gap-x-6 gap-y-5 rounded-2xl bg-board p-6 text-on-board sm:p-7">
          {([
            ['Sent today', f ? `${f.sent_today}/${f.daily_cap}` : '–'],
            ['Replies', f ? `${f.replies}` : '–'],
            ['Open pipeline', f ? rupees(f.pipeline_value) : '–'],
            ['To collect', f ? rupees(f.to_collect) : '–'],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-on-board/65">{label}</dt>
              <dd className="figure mt-1 text-[1.65rem] leading-none">{value}</dd>
            </div>
          ))}
          {f && f.interested > 0 && (
            <p className="col-span-2 text-sm text-mark">{f.interested} interested: <Link to="/pipeline" className="font-medium text-mark underline">open the pipeline</Link></p>
          )}
        </dl>
      </section>

    </>
  );
}


/** Upcoming reminders and the owner's notes (notes are also what Tiga remembers). */
export function RemindersNotes() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listReminders().then((r) => setReminders(r.items)).catch(() => setReminders([]));
    api.listNotes().then((r) => setNotes(r.items)).catch(() => setNotes([]));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    try {
      await api.addNote(note);
      setNote('');
      setError(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note');
    }
  };

  return (
    <Card title="Reminders and notes">
          {reminders.length > 0 && (
            <ul className="mb-4 space-y-1.5 text-sm">
              {reminders.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="figure w-20 shrink-0 text-ink-3">{new Date(r.due_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          )}
          {error && <Notice>{error}</Notice>}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) save(); }}>
            <label className="sr-only" htmlFor="new-note">New note</label>
            <input id="new-note" className="input" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-secondary" disabled={!note.trim()}>Save</button>
          </form>
          <p className="mt-2 text-xs text-ink-3">Or tell Tiga: "remind me at 5 to call Sri Bakery", "note: client wants blue".</p>
          {notes.length > 0 && (
            <ul className="mt-3 divide-y divide-rule text-sm">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-2 py-2">
                  <span>{n.text}</span>
                  <button className="btn btn-ghost btn-sm p-1" aria-label={`Delete note: ${n.text}`} onClick={() => api.deleteNote(n.id).then(refresh)}>
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
  );
}
