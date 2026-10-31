import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Field, Modal } from '../../components/ui';
import { api } from '../../services/api';
import type { Contact } from '../../types';
import { errorText } from './shared';

/**
 * Edit a drafted WhatsApp message, open WhatsApp with it (only if the consent gate allows), then mark it sent.
 * Pass the draft as `text`, or `load` to fetch it when the dialog opens.
 */
export function WriteMessage({ person, text: initial = '', load, onClose, onSent }: {
  person: Contact;
  text?: string;
  load?: () => Promise<string>;
  onClose: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const loadOnce = useRef(load);   // fetched once when the dialog opens, so typing is never overwritten
  useEffect(() => {
    loadOnce.current?.().then(setText).catch((e) => setError(errorText(e)));
  }, []);
  const open = async () => {
    try {
      const { url } = await api.whatsappLink(person.id, text);
      window.open(url, '_blank', 'noopener,noreferrer');
      setOpened(true);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const markSent = async () => {
    try {
      await api.recordTouch(person.id, { channel: 'whatsapp', direction: 'out', kind: 'message' });
      onSent();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal title={`Message ${person.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-ink-2">Make it sound like you. WhatsApp opens with this text; you press send there.</p>
      <Field label="Message">{(id) => <textarea id={id} className="input min-h-[11rem]" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
      {error && <p role="alert" className="mt-3 text-sm text-flag">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={open} disabled={!text.trim()}><MessageCircle className="size-4" aria-hidden="true" /> Open WhatsApp</button>
        <button className="btn btn-secondary" onClick={markSent} disabled={!opened}>I sent it</button>
      </div>
    </Modal>
  );
}
