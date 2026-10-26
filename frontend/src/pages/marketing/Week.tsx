import { useCallback, useEffect, useState } from 'react';
import { Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { MarketingWeek } from '../../types';
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

export function WeekPanel() {
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
  );
}
