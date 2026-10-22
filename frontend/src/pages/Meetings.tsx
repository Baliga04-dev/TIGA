import { useCallback, useEffect, useState } from 'react';
import { Circle, Square, Trash2 } from 'lucide-react';
import { PageHeader, Card, Notice, CopyButton } from '../components/ui';
import { useCallRecorder } from '../hooks/useCallRecorder';
import { api } from '../services/api';
import type { Meeting } from '../types';
import { cn } from '../lib/utils';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const STATUS: Record<Meeting['status'], { label: string; tone: string }> = {
  transcribing: { label: 'Transcribing on this PC', tone: 'badge-amber' },
  writing: { label: 'Writing notes', tone: 'badge-amber' },
  done: { label: 'Notes ready', tone: 'badge-green' },
  failed: { label: 'Failed', tone: 'badge-red' },
};

function Recorder({ onSaved }: { onSaved: () => void }) {
  const rec = useCallRecorder();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(async () => {
    const audio = await rec.stop();
    if (!audio) return;
    try {
      await api.uploadMeeting(title.trim() || 'Call', audio);
      setTitle('');
      setError(null);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The recording could not be saved');
    }
  }, [rec, title, onSaved]);

  if (!rec.supported) {
    return <Notice tone="info">This browser can't record a call. Use Edge or Chrome on your PC.</Notice>;
  }
  return (
    <Card title="Record a call">
      <p className="mb-4 text-sm text-ink-2">
        Works with Meet, Zoom, Teams or WhatsApp in a browser tab. When the picker opens, choose the call's tab and tick
        "Share tab audio". Your mic is mixed in. No bot joins the call.
      </p>
      <Notice tone="info">Tell everyone on the call that you're recording before you start.</Notice>
      {(rec.error || error) && <div className="mt-3"><Notice>{rec.error || error}</Notice></div>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-medium">What's the call?</span>
          <input className="input" placeholder="Call with Sri Bakery" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        {rec.phase === 'idle' && (
          <button className="btn btn-primary" onClick={() => rec.start(finish)}>
            <Circle className="size-4 fill-current" aria-hidden="true" /> Start recording
          </button>
        )}
        {rec.phase === 'recording' && (
          <>
            <p role="status" className="figure flex items-center gap-2 text-sm text-flag">
              <span className="size-2 animate-pulse rounded-full bg-flag" aria-hidden="true" /> Recording {clock(rec.seconds)}
            </p>
            <button className="btn btn-primary" onClick={finish}><Square className="size-4" aria-hidden="true" /> Stop and write notes</button>
            <button className="btn btn-ghost" onClick={rec.discard}>Discard</button>
          </>
        )}
        {rec.phase === 'saving' && <p role="status" className="text-sm text-ink-2">Saving the recording…</p>}
      </div>
    </Card>
  );
}

function MeetingItem({ m, onDeleted }: { m: Meeting; onDeleted: () => void }) {
  const [full, setFull] = useState<Meeting | null>(null);
  const [open, setOpen] = useState(false);
  const status = STATUS[m.status];

  useEffect(() => {
    if (open && m.status === 'done' && !full) api.getMeeting(m.id).then((r) => setFull(r.meeting)).catch(() => undefined);
  }, [open, m.status, m.id, full]);

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button className="min-w-0 flex-1 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="block font-medium">{m.title}</span>
          <span className="text-sm text-ink-2">
            {new Date(m.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            {m.duration_s > 0 && <>, <span className="figure">{clock(m.duration_s)}</span></>}
          </span>
        </button>
        <span className={cn('badge', status.tone)}>{status.label}</span>
        <button className="btn btn-ghost btn-sm p-1" aria-label={`Delete ${m.title}`} onClick={() => api.deleteMeeting(m.id).then(onDeleted)}>
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      {m.status === 'failed' && <p className="mt-2 text-sm text-flag">{m.error}</p>}
      {open && m.status === 'done' && (
        <div className="mt-3 space-y-3">
          <div className="flex justify-end"><CopyButton text={m.notes} label="Copy notes" /></div>
          <pre className="whitespace-pre-wrap rounded-md bg-paper p-4 font-sans text-sm leading-relaxed">{m.notes}</pre>
          <details>
            <summary className="cursor-pointer text-sm text-ink-2">Transcript</summary>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-ink-2">{full?.transcript ?? 'Loading…'}</pre>
          </details>
        </div>
      )}
    </li>
  );
}

export function Meetings() {
  const [items, setItems] = useState<Meeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.listMeetings().then((r) => { setItems(r.items); setError(null); })
      .catch((e) => { setItems((prev) => prev ?? []); setError(e instanceof Error ? e.message : 'Could not load meetings'); });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // while a recording is being transcribed or written up, check back every few seconds
  const working = items?.some((m) => m.status === 'transcribing' || m.status === 'writing');
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(refresh, 4000);
    return () => window.clearInterval(t);
  }, [working, refresh]);

  return (
    <>
      <PageHeader title="Meetings" description="Record a call in this browser; Tiga transcribes it on this PC and writes the notes and action items." />
      <div className="space-y-10">
        <Recorder onSaved={refresh} />
        <Card title="Notes">
          {error && <Notice>{error}</Notice>}
          {items === null ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading meetings">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-5 w-1/2" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-ink-2">No calls yet. Your first recording's notes will appear here a few minutes after you stop.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {items.map((m) => <MeetingItem key={m.id} m={m} onDeleted={refresh} />)}
            </ul>
          )}
          <p className="mt-4 text-xs text-ink-3">The audio is deleted once it's transcribed. Only the transcript goes to your Claude for the notes.</p>
        </Card>
      </div>
    </>
  );
}
