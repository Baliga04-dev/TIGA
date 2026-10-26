import type { Channel, Contact } from '../../types';
import { CHANNEL_LABEL } from './shared';

/** Which channels this person agreed to, and a do-not-contact flag when it applies. */
export function ConsentBadges({ contact }: { contact: Contact }) {
  if (contact.dnc) return <span className="badge badge-red">Do not contact</span>;
  const given = (Object.keys(contact.consent) as Channel[]).filter((c) => contact.consent[c]);
  if (contact.source === 'warm') return <span className="badge badge-green">Knows you</span>;
  if (given.length === 0) return <span className="badge badge-gray">No permission yet</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {given.map((c) => <span key={c} className="badge badge-green">{CHANNEL_LABEL[c]} OK</span>)}
    </span>
  );
}
