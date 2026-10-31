import { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { FollowUp, MarketingWeek, WhatWorked } from '../../types';
import { WriteMessage } from './WriteMessage';
import { AsksOwed } from './Asks';
import { errorText, shortDate } from './shared';

const ROWS: [keyof MarketingWeek, string][] = [
  ['warm_sent', 'Messages to people you know'],
  ['visits', 'Shops visited'],
  ['conversations', 'Conversations with an owner'],
  ['consents', 'Agreed to hear from you'],
  ['messages_in', 'Shops that messaged you'],
  ['interested', 'Interested at the visit'],
  ['proposals', 'Proposals sent'],
  ['won', 'Won'],
  ['revenue', 'Paid (₹)'],
];

/** The checkpoint from the research: rethink the offer or the shops if 40 to 50 conversations bring no sale. */
const CHECKPOINT = 40;

function ago(iso: string) {
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** Shop owners who said yes to WhatsApp at a visit and are owed the demo within 48 hours. */
function FollowUps({ onToast }: { onToast: (m: string) => void }) {
  const [data, setData] = useState<{ items: FollowUp[]; sent_this_week: number; weekly_cap: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState<FollowUp | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.followups());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (error) return <Notice title="Follow-ups didn't load">{error}</Notice>;
  if (!data) return <div aria-busy="true" aria-label="Loading follow-ups" className="h-16 animate-pulse rounded bg-wash" />;
  const full = data.sent_this_week >= data.weekly_cap;
  return (
    <section aria-labelledby="followups-title" className="mb-10">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="followups-title" className="font-semibold">Follow-ups owed ({data.items.length})</h3>
        <p className={`text-sm ${full ? 'text-flag' : 'text-ink-2'}`}>
          {data.sent_this_week} of {data.weekly_cap} demo follow-ups sent this week{full ? ': the week is full, the rest can wait' : ''}
        </p>
      </div>
      {data.items.length === 0 ? (
        <p className="text-sm text-ink-2">Nobody waiting. After a visit where the owner says yes to WhatsApp, their demo message appears here.</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {data.items.map((f) => (
            <li key={f.contact.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{f.contact.business || f.contact.name} <span className="text-sm font-normal text-ink-2">{f.contact.name.endsWith('(owner)') ? '' : f.contact.name}</span></p>
                <p className="text-sm text-ink-2">Visited {ago(f.visit_at)} {f.overdue && <span className="badge badge-amber ml-1">Over 48 hours</span>}</p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setWriting(f)}>
                <MessageCircle className="size-4" aria-hidden="true" /> Send the demo <span className="sr-only">to {f.contact.business || f.contact.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {writing && (
        <WriteMessage person={writing.contact} text={writing.text} onClose={() => setWriting(null)}
          onSent={() => { onToast(`Follow-up to ${writing.contact.business || writing.contact.name} marked as sent.`); setWriting(null); load(); }} />
      )}
    </section>
  );
}

export function WeekPanel({ onToast }: { onToast: (m: string) => void }) {
  const [weeks, setWeeks] = useState<MarketingWeek[] | null>(null);
  const [enough, setEnough] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const card = await api.marketingScorecard();
      setWeeks(card.weeks);
      setEnough(card.enough_data);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <Notice title="The scorecard didn't load" action={<button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>}>{error}</Notice>;
  if (!weeks) {
    return (
      <div aria-busy="true" aria-label="Loading the scorecard" className="space-y-2">
        {ROWS.map(([key]) => <div key={key} className="h-8 animate-pulse rounded bg-wash" />)}
      </div>
    );
  }
  const conversations = weeks.reduce((n, w) => n + w.conversations, 0);
  const won = weeks.reduce((n, w) => n + w.won, 0);
  return (
    <>
    <FollowUps onToast={onToast} />
    <AsksOwed onToast={onToast} />
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-x-auto" role="region" aria-label="Weekly scorecard" tabIndex={0}>
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">Counts for this week and the three before it</caption>
          <thead>
            <tr className="border-b border-rule text-left text-ink-2">
              <th scope="col" className="py-2 pr-4 font-medium">This week first</th>
              {weeks.map((w, i) => (
                <th key={w.start} scope="col" className="px-3 py-2 text-right font-medium">{i === 0 ? 'This week' : `From ${shortDate(w.start)}`}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {ROWS.map(([key, label]) => (
              <tr key={key}>
                <th scope="row" className="py-2.5 pr-4 text-left font-normal">{label}</th>
                {weeks.map((w, i) => (
                  <td key={w.start} className={`px-3 py-2.5 text-right font-mono tabular-nums ${i === 0 ? 'font-semibold' : 'text-ink-2'}`}>
                    {key === 'revenue' ? Number(w[key]).toLocaleString('en-IN') : w[key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!enough && (
          <p className="mt-3 text-sm text-ink-2">
            Fewer than 5 conversations in four weeks: these are counts, not rates yet. Keep logging every visit.
          </p>
        )}
      </div>
      <aside className="space-y-4 text-sm">
        <WhatWorkedCard />
        <div className="rounded-lg border border-rule p-4">
          <h3 className="font-semibold">The plan</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-2">
            <li>Week 1: message 30 to 40 people you know, one at a time.</li>
            <li>Weeks 2 to 6: 10 to 20 walk-ins a week on one or two streets, at most 10 demos.</li>
            <li>Aim for 2 or 3 paid founding clients by week 6; raise prices after about 5.</li>
          </ol>
        </div>
        <div className="rounded-lg border border-rule p-4">
          <h3 className="font-semibold">Checkpoint</h3>
          <p className="mt-1 text-ink-2">
            <span className="font-mono font-semibold text-ink">{conversations}</span> of {CHECKPOINT} owner conversations in four weeks.
            {conversations >= CHECKPOINT && won === 0
              ? ' No sale yet: rethink the offer or the kind of shop before walking more.'
              : ' If 40 to 50 conversations bring no sale, change the offer or the kind of shop.'}
          </p>
        </div>
      </aside>
    </div>
    </>
  );
}

/** This week's report as it stands: one experiment, the next steps, and any channel to rest. */
function WhatWorkedCard() {
  const [data, setData] = useState<WhatWorked | null>(null);
  useEffect(() => { api.whatWorked().then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  return (
    <div className="rounded-lg border border-pen/40 bg-wash p-4">
      <h3 className="font-semibold">This week's one experiment</h3>
      <p className="mt-1">{data.experiment}</p>
      <h4 className="mt-3 font-semibold">Next steps</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{data.next_steps.map((s) => <li key={s}>{s}</li>)}</ul>
      {data.retire.length > 0 && (
        <p className="mt-3 text-ink-2"><span className="font-semibold text-ink">Rest for now:</span> {data.retire.join(', ')} (4 or more tries, nothing back).</p>
      )}
    </div>
  );
}
