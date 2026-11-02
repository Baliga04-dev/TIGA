import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { BuildNote, BuildNoteSummary } from '../../types';
import { Card, Notice } from '../../components/ui';
import { Prose } from '../../components/Prose';
import { cn } from '../../lib/utils';

/** Splits "**Q: …**" blocks into question and answer; null when the text is not all questions. */
function questions(text: string): { q: string; a: string[] }[] | null {
  const items: { q: string; a: string[] }[] = [];
  for (const block of text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    const [first, ...rest] = block.split('\n');
    const q = /^\*\*(Q:.+)\*\*$/.exec(first);
    if (q) items.push({ q: q[1], a: rest.length ? [rest.join('\n')] : [] });
    else if (items.length) items[items.length - 1].a.push(block);
    else return null;
  }
  return items.length ? items : null;
}

/** Interview questions with the answers folded away: answer in your head first, then open it. */
function Questions({ text }: { text: string }) {
  const items = questions(text);
  if (!items) return <Prose text={text} />;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.q}>
          <details className="rounded-md border border-rule px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-ink">{i.q}</summary>
            <div className="mt-2"><Prose text={i.a.join('\n\n')} /></div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function NoteView({ id }: { id: string }) {
  const [note, setNote] = useState<BuildNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNote(null);
    api.learnNote(id).then((r) => { setNote(r.note); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the note'));
  }, [id]);

  if (error) return <Notice>{error}</Notice>;
  if (!note) return <div className="skeleton h-64 w-full" aria-busy="true" aria-label="Loading the note" />;
  return (
    <article aria-labelledby="note-title">
      <p className="text-xs font-medium text-ink-3">{[note.project, note.kind, note.date].filter(Boolean).join(' · ')}</p>
      <h2 id="note-title" className="text-xl font-semibold">{note.title}</h2>
      {note.summary && <p className="mt-1 text-sm text-ink-2">{note.summary}</p>}
      <div className="mt-6 space-y-6">
        {note.sections.map((s) => (
          <section key={s.title}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-2">{s.title}</h3>
            {/interview/i.test(s.title) ? <Questions text={s.text} /> : <Prose text={s.text} />}
          </section>
        ))}
      </div>
    </article>
  );
}

/** One note per tool a build brought in, written by Claude's build-learnings skill into learn_workspace/notes/. */
export function BuildNotes({ onHidden }: { onHidden: () => void }) {
  const [items, setItems] = useState<BuildNoteSummary[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.learnNotes()
      .then((r) => { setItems(r.items); setCurrent((c) => c ?? r.items[0]?.id ?? null); })
      .catch((e: Error & { status?: number }) => { if (e.status === 404) onHidden(); else setError(e.message); });
  }, [onHidden]);

  if (error) return <Notice>{error}</Notice>;
  if (!items) return <div className="skeleton h-64 w-full" aria-busy="true" aria-label="Loading build notes" />;
  if (items.length === 0) {
    return (
      <Card title="No build notes yet">
        <p className="text-sm text-ink-2">
          Whenever Claude builds something with a tool that is new to you, it writes a note here: what the tool is, why it
          was picked, how the project uses it, what went wrong, and the questions interviewers ask about it.
        </p>
      </Card>
    );
  }
  const projects = [...new Set(items.map((n) => n.project))];
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Build notes" className="space-y-5">
        {projects.map((p) => (
          <div key={p}>
            <h2 className="mb-1 px-3 text-xs font-medium text-ink-3">{p}</h2>
            <ol className="space-y-1">
              {items.filter((n) => n.project === p).map((n) => (
                <li key={n.id}>
                  <button className={cn('w-full rounded px-3 py-2 text-left text-sm', n.id === current ? 'bg-wash font-medium' : 'hover:bg-wash/60')}
                    aria-current={n.id === current ? 'page' : undefined} onClick={() => setCurrent(n.id)}>
                    {n.title}
                    {n.kind && <span className="block text-xs text-ink-3">{n.kind}</span>}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </nav>
      <div className="min-w-0">{current && <NoteView id={current} />}</div>
    </div>
  );
}
