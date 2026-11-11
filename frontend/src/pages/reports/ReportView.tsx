import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { groupOf, parseReport, reportDate, type Block, type Proposal, type Stat } from '../../lib/report';

const TONE = { red: 'badge-red', amber: 'badge-amber', green: 'badge-green' } as const;
const STATUS_WORD = { red: 'Needs fixing', amber: 'Needs you', green: 'All clear' } as const;
const GROUP_LABEL = { daily: 'Daily report', rnd: 'Research report', marketing: 'Marketing report' } as const;
const TAG_LABEL: Record<string, [string, string]> = {
  numbers: ['From the numbers', 'badge-gray'], improvement: ['Build in Tiga', 'badge-blue'], idea: ['Business idea', 'badge-amber'],
  S: ['Small job', 'badge-gray'], M: ['Medium job', 'badge-gray'], L: ['Large job', 'badge-gray'],
};

/** A figure that is asking for something: a non-zero count of things waiting, due or to collect. */
function needsYou(s: Stat): boolean {
  return /waiting|due|to collect|awaiting/i.test(s.label) && /^[1-9]|^Rs [1-9]/.test(s.value.trim());
}

function Stats({ items }: { items: Stat[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 xl:grid-cols-3">
      {items.map((s) => (
        <div key={s.label} className={cn('rounded-md border border-rule bg-sheet px-3 py-2.5', needsYou(s) && 'shadow-[inset_3px_0_0_rgb(var(--mark))]')}>
          <dt className="text-xs text-ink-2">{s.label}</dt>
          <dd className="figure mt-0.5 text-base">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProposalCard({ p }: { p: Proposal }) {
  return (
    <article className="rounded-lg border border-rule bg-sheet p-4">
      <div className="flex flex-wrap gap-1.5">
        {p.tags.map((t) => {
          const [label, tone] = TAG_LABEL[t] ?? [t, 'badge-gray'];
          return <span key={t} className={cn('badge', tone)}>{label}</span>;
        })}
      </div>
      <h4 className="mt-2 font-semibold leading-snug">{p.title}</h4>
      {p.summary && <p className="mt-1 max-w-prose text-sm text-ink-2">{p.summary}</p>}
      {p.fields.length > 0 && (
        <dl className="mt-3 space-y-2.5 text-sm">
          {p.fields.map((f) => (
            <div key={f.label}>
              <dt className="font-medium">{f.label}</dt>
              <dd className="mt-0.5 max-w-prose leading-relaxed text-ink-2">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.sources.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {p.sources.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-pen underline underline-offset-2">
              <ExternalLink className="size-3.5" aria-hidden="true" /> {new URL(url).hostname.replace(/^www\./, '')}
              <span className="sr-only">(source, opens in a new tab)</span>
            </a>
          ))}
        </p>
      )}
    </article>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'stats':
      return <Stats items={block.items} />;
    case 'checks':
      return (
        <ul className="space-y-1 text-sm">
          {block.items.map((c) => (
            <li key={c.name} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ledger" aria-label="Passed" />
                : <XCircle className="mt-0.5 size-4 shrink-0 text-flag" aria-label="Failed" />}
              <span><span className="font-medium capitalize">{c.name}</span> <span className="text-ink-2">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      );
    case 'issues':
      return (
        <ul className="divide-y divide-rule rounded-lg border border-rule bg-sheet text-sm">
          {block.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
              <span className="figure w-8 shrink-0 text-ink-3">#{i.id}</span>
              <span className="min-w-0 flex-1">{i.title}</span>
              <span className={cn('badge', i.status === 'open' ? 'badge-amber' : 'badge-gray')}>{i.status.replace('_', ' ')}</span>
              {i.times > 1 && <span className="text-xs text-ink-3">seen {i.times} times</span>}
            </li>
          ))}
        </ul>
      );
    case 'proposals':
      return <div className="space-y-3">{block.items.map((p) => <ProposalCard key={p.title} p={p} />)}</div>;
    case 'list':
      return <ul className="list-disc space-y-1 pl-5 text-sm marker:text-ink-3">{block.items.map((t) => <li key={t}>{t}</li>)}</ul>;
    default: {
      const labelled = /^([A-Z][\w ]{1,30}):\s+(.+)$/.exec(block.text);   // "Research notes: This week I ..."
      return labelled
        ? <p className="max-w-prose text-sm leading-relaxed"><span className="font-semibold">{labelled[1]}.</span> {labelled[2]}</p>
        : <p className="max-w-prose text-sm leading-relaxed">{block.text}</p>;
    }
  }
}

/**
 * One report, laid out from its plain text: status, figures, checks, open issues, proposals. The plain text is one
 * click away, exactly as it would be emailed.
 */
export function ReportView({ body, kind, date, delivery, label }:
  { body: string; kind: string; date: string; delivery?: string; label: string }) {
  const [plain, setPlain] = useState(false);
  const report = parseReport(body);
  const group = groupOf(kind);
  const hasIssues = report.sections.some((s) => s.blocks.some((b) => b.type === 'issues'));
  return (
    <article aria-label={label} className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">{group ? GROUP_LABEL[group] : 'Report'}, {reportDate(date)}</p>
          <h2 className="mt-0.5 text-lg font-semibold leading-snug">{report.title}</h2>
          {delivery && <p className="mt-1 text-xs text-ink-3">{delivery}</p>}
        </div>
        <div className="flex items-center gap-2">
          {report.status && (
            <span className={cn('badge', TONE[report.status])}>
              {STATUS_WORD[report.status]}{report.statusNote ? `: ${report.statusNote}` : ''}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" aria-pressed={plain} onClick={() => setPlain(!plain)}>
            {plain ? 'Show laid out' : 'Show plain text'}
          </button>
        </div>
      </header>
      {plain ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-rule bg-wash p-4 font-sans text-sm leading-relaxed">{body}</pre>
      ) : (
        <div className="mt-4 space-y-6">
          {report.sections.map((s, n) => (
            <section key={`${s.heading}-${n}`} aria-label={s.heading || undefined} className="space-y-3">
              {s.heading && <h3 className="text-sm font-semibold text-ink-2">{s.heading}</h3>}
              {s.blocks.map((b, i) => <BlockView key={i} block={b} />)}
            </section>
          ))}
          {hasIssues && (
            <p className="text-sm text-ink-2">Approve, reject or close issues on the <Link to="/crew" className="text-pen underline">Crew page</Link>.</p>
          )}
        </div>
      )}
    </article>
  );
}
