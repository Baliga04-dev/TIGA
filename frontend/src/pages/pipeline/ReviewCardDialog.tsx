import { useState, type FormEvent } from 'react';
import { Field, Modal, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { Deal } from '../../types';

/** A counter card for a client's shop: a QR to their Google review page, and a WhatsApp line for their customers. */
export function ReviewCardDialog({ deal, onClose, onDone }: { deal: Deal; onClose: () => void; onDone: (m: string) => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const name = deal.company || deal.contact || deal.email;
  const make = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { document } = await api.writeReviewCard(deal.id, link);
      window.open(`/api/documents/${document.id}`, '_blank', 'noopener,noreferrer');
      onDone(`Review card for ${name} is ready to print`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make the card');
    }
  };
  return (
    <Modal title={`Review card for ${name}`} onClose={onClose}>
      <form onSubmit={make} className="space-y-3">
        <p className="text-sm text-ink-2">
          A free add-on for a finished client: a card for their counter with a QR to their Google review page, and a
          WhatsApp message they can send customers. No discounts for reviews; Google removes those.
        </p>
        <Field label="Their Google review link" hint="In their Business Profile: Ask for reviews, then copy the link (https://g.page/...)">
          {(id) => <input id={id} type="url" required className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://g.page/r/.../review" />}
        </Field>
        {error && <Notice>{error}</Notice>}
        <button className="btn btn-primary">Make the card</button>
      </form>
    </Modal>
  );
}
