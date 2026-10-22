import { useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';
import { api } from '../services/api';
import type { Reminder } from '../types';

const POLL_MS = 30_000;

/** Checks for due reminders on every page; shows them and says them out loud once. */
export function ReminderWatcher() {
  const [due, setDue] = useState<Reminder[]>([]);
  const spoken = useRef(new Set<number>());

  useEffect(() => {
    let alive = true;
    const check = () =>
      api.dueReminders().then((r) => {
        if (!alive) return;
        setDue(r.items);
        for (const item of r.items) {
          if (spoken.current.has(item.id)) continue;
          spoken.current.add(item.id);
          if ('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(`Reminder: ${item.text}`));
        }
      }).catch(() => undefined);
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const close = async (id: number, outcome: 'done' | 'dismissed') => {
    await api.closeReminder(id, outcome).catch(() => undefined);
    setDue((items) => items.filter((r) => r.id !== id));
  };

  if (due.length === 0) return null;
  return (
    <aside aria-label="Due reminders" className="fixed bottom-4 left-4 z-[60] max-w-sm space-y-2">
      {due.map((r) => (
        <div key={r.id} role="alert" className="rounded-lg border border-mark bg-sheet p-3 shadow-lg">
          <p className="flex items-center gap-2 font-medium"><BellRing className="size-4 text-pen" aria-hidden="true" /> {r.text}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => close(r.id, 'done')}>Done <span className="sr-only">{r.text}</span></button>
            <button className="btn btn-ghost btn-sm" onClick={() => close(r.id, 'dismissed')}>Dismiss <span className="sr-only">{r.text}</span></button>
          </div>
        </div>
      ))}
    </aside>
  );
}
