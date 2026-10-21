import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Mail, RefreshCw, Search, Send, Sparkles, X } from 'lucide-react';
import { PageHeader, Card, Notice, Field, Toast } from '../components/ui';
import { api } from '../services/api';
import { useAction } from '../hooks/useAction';
import { cn } from '../lib/utils';
import type { FoundLead, NewDraft, OutreachItem, OutreachStatus, Scorecard } from '../types';

const STATUS_BADGE: Record<OutreachStatus, string> = {
  drafted: 'badge-amber', approved: 'badge-blue', sent: 'badge-gray', replied: 'badge-blue',
  interested: 'badge-green', declined: 'badge-gray', unsubscribed: 'badge-red', bounced: 'badge-red', rejected: 'badge-gray',
};

const EMPTY_DRAFT: NewDraft = { email: '', company: '', subject: '', body: '', source_note: '', lead_url: '' };

function ScorecardStrip({ card }: { card: Scorecard }) {
  const cells: [string, number | string][] = [
    ['Sent today', `${card.sent_today} / ${card.daily_cap}`],
    ['Sent this week', card.sent_week],
    ['Replies', card.replies],
    ['Interested', card.interested],
    ['Declined', card.declined],
    ['Unsubscribed', card.unsubscribed],
    ['Awaiting you', card.awaiting_approval],
  ];
  return (
    <dl aria-label="Outreach scorecard" className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-4 lg:grid-cols-7">
      {cells.map(([label, value]) => (
        <div key={label} className="bg-sheet p-3">
          <dt className="text-xs text-ink-2">{label}</dt>
          <dd className="font-serif text-2xl font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DraftRow({ item, onChanged, onError }: { item: OutreachItem; onChanged: () => void; onError: (m: string) => void }) {
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);
  const [busy, setBusy] = useState(false);
  const dirty = subject !== item.subject || body !== item.body;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-rule bg-sheet p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{item.email}</span>
        {item.company && <span className="text-ink-2">{item.company}</span>}
        {item.followup_n > 0 && <span className="badge badge-blue">follow-up {item.followup_n}</span>}
        {item.warnings && <span className="badge badge-red">{item.warnings}</span>}
      </div>
      {item.source_note && <p className="mb-2 text-xs text-ink-3">Address found via: {item.source_note}</p>}
      <Field label={`Subject for ${item.email}`}>
        {(id) => <input id={id} className="input mb-2" value={subject} onChange={(e) => setSubject(e.target.value)} />}
      </Field>
      <Field label={`Message for ${item.email}`}>
        {(id) => <textarea id={id} className="input min-h-28" value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <p className="mt-1 text-xs text-ink-3">A postal address and a STOP line are added automatically when it is sent.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {dirty && (
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act(() => api.editDraft(item.id, { subject, body }))}>
            Save changes
          </button>
        )}
        <button className="btn btn-success btn-sm" disabled={busy || dirty} onClick={() => act(() => api.approveDraft(item.id))}>
          <Check className="size-4" aria-hidden="true" /> Approve <span className="sr-only">{item.email}</span>
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(() => api.rejectDraft(item.id))}>
          <X className="size-4" aria-hidden="true" /> Reject <span className="sr-only">{item.email}</span>
        </button>
      </div>
    </li>
  );
}

export function Outreach() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [topics, setTopics] = useState('startup raises seed, website redesign, hiring web developer');
  const [draft, setDraft] = useState<NewDraft>(EMPTY_DRAFT);
  const [activeLead, setActiveLead] = useState<FoundLead | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, score] = await Promise.all([api.listOutreach(), api.getScorecard()]);
      setItems(list.items);
      setCard(score.scorecard);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load outreach');
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const find = useAction(() => api.findLeads(topics.split(',').map((t) => t.trim()).filter(Boolean)));
  const create = useAction(async () => {
    await api.createDraft(draft);
    setDraft(EMPTY_DRAFT);
    await refresh();
    setToast('Draft saved. Review it below, then approve.');
  });
  const autoWrite = useAction(async () => {
    await api.autoDraft({
      email: draft.email, company: draft.company, source_note: draft.source_note, lead_url: draft.lead_url,
      lead_title: activeLead?.title ?? '', signals: activeLead?.signals ?? [],
    });
    setDraft(EMPTY_DRAFT);
    setActiveLead(null);
    await refresh();
    setToast('Draft written. Read it below, edit if you like, then approve.');
  });
  const send = useAction(async () => {
    const { sent } = await api.sendNext();
    await refresh();
    setToast(sent ? `Sent to ${sent.email}` : 'Nothing sent: no approved mail, or a limit applies (hours, daily cap, gap).');
  });
  const replies = useAction(async () => {
    const { changed } = await api.checkReplies();
    await refresh();
    setToast(changed ? `${changed} conversation${changed === 1 ? '' : 's'} updated` : 'No new replies');
  });
  const followups = useAction(async () => {
    const { drafts } = await api.draftFollowups();
    await refresh();
    setToast(drafts.length ? `${drafts.length} follow-up draft${drafts.length === 1 ? '' : 's'} ready to review` : 'No follow-ups due');
  });

  const startDraftFrom = (lead: FoundLead) => {
    setActiveLead(lead);
    setDraft({ ...EMPTY_DRAFT, lead_url: lead.url, subject: '', body: '', source_note: `${lead.source}: ${lead.title}` });
    setToast('Lead selected. Add the contact email you found on their own site, then let Tiga write the email.');
  };

  const drafts = items.filter((i) => i.status === 'drafted');
  const approved = items.filter((i) => i.status === 'approved');
  const history = items.filter((i) => !['drafted', 'approved'].includes(i.status)).reverse();
  const failure = loadError ?? actionError;

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Find leads, write the email, approve it, and track every reply. Nothing is sent until you approve it."
      />
      {failure && <div className="mb-6"><Notice title="Something went wrong">{failure}</Notice></div>}
      {card && <ScorecardStrip card={card} />}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Card title="Find leads">
            <Field label="Topics (comma separated)">
              {(id) => <input id={id} className="input" value={topics} onChange={(e) => setTopics(e.target.value)} />}
            </Field>
            <button className="btn btn-primary mt-3" onClick={() => find.run()} disabled={find.pending}>
              {find.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
              Find leads
            </button>
            {find.error && <div className="mt-3"><Notice>{find.error}</Notice></div>}
            {find.result && find.result.errors.length > 0 && (
              <p className="mt-3 text-sm text-ink-2">Some sources failed: {find.result.errors.join(', ')}</p>
            )}
            {find.result && find.result.leads.length === 0 && !find.error && (
              <p className="mt-3 text-sm text-ink-2">No buying signals found. Try different topics.</p>
            )}
            <ul className="mt-4 space-y-3">
              {find.result?.leads.map((lead) => (
                <li key={lead.url} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <a href={lead.url} target="_blank" rel="noopener noreferrer" className="font-medium text-pen underline">{lead.title}</a>
                    <p className="text-xs text-ink-3">{lead.source} · {lead.signals.join(', ')} · score {lead.score}</p>
                  </div>
                  <button className="btn btn-secondary btn-sm shrink-0" onClick={() => startDraftFrom(lead)}>Draft email</button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="New email" raised>
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); create.run(); }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Contact email">
                  {(id) => <input id={id} type="email" required className="input" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />}
                </Field>
                <Field label="Company">
                  {(id) => <input id={id} className="input" value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />}
                </Field>
              </div>
              <Field label="Where you found this address" hint="Kept as your record of the source.">
                {(id) => <input id={id} className="input" value={draft.source_note} onChange={(e) => setDraft({ ...draft, source_note: e.target.value })} />}
              </Field>
              <button type="button" className="btn btn-primary" disabled={autoWrite.pending || !draft.email} onClick={() => autoWrite.run()}>
                {autoWrite.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                Write it for me
              </button>
              {autoWrite.error && <Notice>{autoWrite.error}</Notice>}
              <p className="text-xs text-ink-3">Or write it yourself:</p>
              <Field label="Subject">
                {(id) => <input id={id} required={false} className="input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}
              </Field>
              <Field label="Message">
                {(id) => <textarea id={id} className="input min-h-28" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />}
              </Field>
              <button className="btn btn-primary" type="submit" disabled={create.pending}>
                {create.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
                Save draft
              </button>
              {create.error && <Notice>{create.error}</Notice>}
            </form>
          </Card>
        </div>

        <div className="space-y-8">
          <Card
            title={`Waiting for your approval (${drafts.length})`}
            action={
              <button className="btn btn-secondary btn-sm" onClick={() => followups.run()} disabled={followups.pending}>
                <RefreshCw className="size-4" aria-hidden="true" /> Draft follow-ups
              </button>
            }
          >
            {followups.error && <Notice>{followups.error}</Notice>}
            {drafts.length === 0 ? (
              <p className="text-sm text-ink-2">No drafts waiting.</p>
            ) : (
              <ul className="space-y-4">
                {drafts.map((d) => (
                  <DraftRow key={`${d.id}-${d.subject}-${d.body}`} item={d} onChanged={() => { setActionError(null); refresh(); }} onError={setActionError} />
                ))}
              </ul>
            )}
          </Card>

          <Card
            title={`Approved, ready to send (${approved.length})`}
            action={
              <button className="btn btn-primary btn-sm" onClick={() => send.run()} disabled={send.pending || approved.length === 0}>
                <Send className="size-4" aria-hidden="true" /> Send next
              </button>
            }
          >
            {send.error && <Notice>{send.error}</Notice>}
            <ul className="space-y-2 text-sm">
              {approved.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.email}</span> <span className="text-ink-2">{a.subject}</span>
                  {a.last_error && <p className="text-xs text-flag">Last attempt failed: {a.last_error}</p>}
                </li>
              ))}
              {approved.length === 0 && <li className="text-ink-2">Nothing approved yet.</li>}
            </ul>
            <p className="mt-3 text-xs text-ink-3">Sends one mail at a time, only on weekdays in business hours, within today's cap.</p>
          </Card>

          <Card
            title="Sent and replies"
            action={
              <button className="btn btn-secondary btn-sm" onClick={() => replies.run()} disabled={replies.pending}>
                <RefreshCw className={cn('size-4', replies.pending && 'animate-spin')} aria-hidden="true" /> Check replies
              </button>
            }
          >
            {replies.error && <Notice>{replies.error}</Notice>}
            <ul className="divide-y divide-rule text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{h.email} <span className="text-ink-3">{h.subject}</span></span>
                  <span className={cn('badge', STATUS_BADGE[h.status])}>{h.status}</span>
                </li>
              ))}
              {history.length === 0 && <li className="py-2 text-ink-2">No mail sent yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
