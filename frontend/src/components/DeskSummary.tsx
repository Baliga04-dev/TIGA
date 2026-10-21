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
    <div className="mb-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
      <Card title="Outreach today">
        <p className="text-sm">
          Sent <b>{card.sent_today}</b> of {card.daily_cap} today · <b>{card.replies}</b> replies · <b>{card.interested}</b> interested
        </p>
        {card.awaiting_approval > 0 ? (
          <p className="mt-2 text-sm">
            <Link to="/outreach" className="font-medium text-pen underline">{card.awaiting_approval} draft{card.awaiting_approval === 1 ? '' : 's'} waiting for your approval</Link>
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-3">No drafts waiting for you.</p>
        )}
      </Card>
      <Card title="Latest report">
        {report ? (
          <>
            <p className="font-medium">{report.subject}</p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-sm text-ink-2">{report.body}</pre>
            <Link to="/reports" className="mt-2 inline-block text-sm text-pen underline">All reports</Link>
          </>
        ) : (
          <p className="text-sm text-ink-3">No report yet. <Link to="/reports" className="text-pen underline">Build today's report</Link>.</p>
        )}
      </Card>
    </div>
  );
}
