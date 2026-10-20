import { Clock, Mail, Volume2, VolumeX } from 'lucide-react';
import { CopyButton, Modal } from '../../components/ui';
import { useSpeech } from '../../hooks/useSpeech';
import { cn, formatDate, getSentimentColor, getSentimentLabel } from '../../lib/utils';
import type { ParsedEmail } from '../../types';
import { safeUrl, topicLabel } from './helpers';

export function MessageDialog({ parsed, onClose, onReply }: {
  parsed: ParsedEmail;
  onClose: () => void;
  onReply: () => void;
}) {
  const { email, contact_info: contact } = parsed;
  const speech = useSpeech();
  const links = [...contact.linkedin, ...contact.websites]
    .map((value) => ({ label: value, href: safeUrl(value) }))
    .filter((l): l is { label: string; href: string } => l.href !== null);
  const hasContact = contact.emails.length + contact.phones.length + links.length > 0;

  return (
    <Modal title={email.subject || '(no subject)'} onClose={onClose} wide>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm mb-3">
        <dt className="text-ink-3">From</dt>
        <dd className="font-medium">{email.from}</dd>
        <dt className="text-ink-3">To</dt>
        <dd>{email.to}</dd>
        <dt className="text-ink-3">Date</dt>
        <dd>{formatDate(email.date)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-rule">
        {parsed.is_cold_email && <span className="badge badge-blue">Cold email</span>}
        {parsed.is_reply && <span className="badge badge-amber">Reply</span>}
        <span className={cn('badge', getSentimentColor(parsed.sentiment))}>{getSentimentLabel(parsed.sentiment)}</span>
        {parsed.key_topics.map((t) => <span key={t} className="badge badge-gray">{topicLabel(t)}</span>)}
      </div>

      <div className="whitespace-pre-wrap font-serif text-[1.0625rem] leading-relaxed">{email.body}</div>

      {parsed.action_items.length > 0 && (
        <section className="mt-4 pt-4 border-t border-rule">
          <h3 className="font-medium mb-2">Action items</h3>
          <ul className="space-y-1">
            {parsed.action_items.map((item) => (
              <li key={item} className="text-sm text-ink-2 flex items-start gap-2">
                <Clock className="size-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasContact && (
        <section className="mt-4 pt-4 border-t border-rule">
          <h3 className="font-medium mb-2">Contact details</h3>
          <div className="flex flex-wrap gap-2">
            {contact.emails.map((value) => <span key={value} className="badge badge-gray text-xs">{value}</span>)}
            {contact.phones.map((value) => <span key={value} className="badge badge-gray text-xs">{value}</span>)}
            {links.map((l) => (
              <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="badge badge-blue text-xs">{l.label}</a>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onReply} className="btn btn-primary btn-sm">
          <Mail className="size-4" aria-hidden="true" />
          Reply
        </button>
        <CopyButton text={email.body} label="Copy body" />
        {speech.supported && (
          <button onClick={() => speech.toggle(email.id, parsed.summary)} className="btn btn-secondary btn-sm">
            {speech.speakingId === email.id ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
            {speech.speakingId === email.id ? 'Stop speaking' : 'Speak summary'}
          </button>
        )}
      </div>
    </Modal>
  );
}
