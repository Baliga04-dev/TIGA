import type { ReactNode } from 'react';

/** Just enough Markdown for the lab missions: paragraphs, "- " lists, **bold** and `code`. No HTML is ever injected. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**')
      ? <strong key={m.index} className="font-semibold text-ink">{t.slice(2, -2)}</strong>
      : <code key={m.index} className="rounded bg-wash px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-2">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- '))) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}
