import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from './ui';
import { api } from '../services/api';
import type { ReportRow, Scorecard } from '../types';

/** Outreach numbers and the latest report, from Tiga's own database, so they show even when Gmail is not connected. */
export function DeskSummary() {
  const [card, setCard] = useState<Scorecard | null>(null);
  const [report, setReport] = useState<ReportRow | null>(null);

  useEffect(() => {
    api.getScorecard().then((r) => setCard(r.scorecard)).catch(() => setCard(null));
    api.listReports().then((r) => setReport(r.items[0] ?? null)).catch(() => setReport(null));
  }, []);

  if (!card) return null;
  return (
    <div className="space-y-8">
      {card.awaiting_approval > 0 && (
        <p className="rounded-lg border border-mark bg-mark/15 px-4 py-3 text-sm">
          <Link to="/outreach" className="font-medium text-ink">{card.awaiting_approval} draft{card.awaiting_approval === 1 ? '' : 's'} waiting for your approval</Link>
        </p>
      )}
      <Card title="Latest report">
        {report ? (
          <>
            <p className="font-medium">{report.subject}</p>
            <pre tabIndex={0} aria-label="Latest report text" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm text-ink-2">{report.body}</pre>
            <Link to="/reports" className="mt-2 inline-block text-sm">All reports</Link>
          </>
        ) : (
          <p className="text-sm text-ink-3">No report yet. <Link to="/reports">Build today's report</Link>.</p>
        )}
      </Card>
    </div>
  );
}
