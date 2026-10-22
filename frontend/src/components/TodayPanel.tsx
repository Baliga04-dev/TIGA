import { useCallback, useEffect, useState } from 'react';
import { Volume2, X } from 'lucide-react';
import { Card, Notice } from './ui';
import { api } from '../services/api';
import type { Briefing, Note, Reminder } from '../types';

/** The morning briefing, upcoming reminders and notes, all from Tiga's own data (no Gmail needed). */
export function TodayPanel() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getBriefing().then(setBrief).catch(() => setBrief(null));
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
  const speak = () => {
    if (brief && 'speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(brief.text));
  };

  return (
    <div className="mb-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
      <Card title="Today" action={brief && <button className="btn btn-ghost btn-sm" onClick={speak}><Volume2 className="size-4" aria-hidden="true" /> Read it to me</button>}>
        {brief ? (
          <div className="space-y-4">
            {brief.cards.map((c) => (
              <section key={c.title} aria-label={c.title}>
                <h3 className="text-base font-semibold">{c.title}</h3>
                <ul className="mt-1 list-disc pl-5 text-sm text-ink-2">{c.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              </section>
            ))}
          </div>
        ) : <p className="text-sm text-ink-3">Loading your day…</p>}
      </Card>
      <Card title="Reminders and notes">
        {reminders.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm">
            {reminders.map((r) => <li key={r.id}><span className="text-ink-3">{new Date(r.due_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span> {r.text}</li>)}
          </ul>
        )}
        <p className="mb-2 text-xs text-ink-3">Tip: in Tiga Chat say "remind me at 5 to call Sri Bakery" or "note: client wants blue".</p>
        {error && <Notice>{error}</Notice>}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) save(); }}>
          <label className="sr-only" htmlFor="new-note">New note</label>
          <input id="new-note" className="input" placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-secondary" disabled={!note.trim()}>Save</button>
        </form>
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
      </Card>
    </div>
  );
}
