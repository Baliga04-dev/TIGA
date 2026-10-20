import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Field, Modal, Notice } from '../../components/ui';
import { useAction } from '../../hooks/useAction';
import { api } from '../../services/api';
import type { Draft } from './helpers';

export function ComposeDialog({ draft, onClose, onSent }: {
  draft: Draft;
  onClose: () => void;
  onSent: () => void;
}) {
  const [form, setForm] = useState(draft);
  const [html, setHtml] = useState(false);
  const send = useAction(() => api.sendEmail({ ...form, is_html: html }));
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await send.run()) onSent();
  };

  return (
    <Modal title="Compose email" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="To" hint="Separate several addresses with commas.">
          {(id) => <input id={id} className="input" value={form.to} onChange={set('to')} placeholder="recipient@example.com" required />}
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Cc">{(id) => <input id={id} className="input" value={form.cc} onChange={set('cc')} placeholder="optional" />}</Field>
          <Field label="Bcc">{(id) => <input id={id} className="input" value={form.bcc} onChange={set('bcc')} placeholder="optional" />}</Field>
        </div>
        <Field label="Subject">
          {(id) => <input id={id} className="input" value={form.subject} onChange={set('subject')} required />}
        </Field>
        <Field label="Message">
          {(id) => <textarea id={id} className="input min-h-[200px] resize-y font-mono text-sm" value={form.body} onChange={set('body')} required />}
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={html} onChange={(e) => setHtml(e.target.checked)} className="size-4 accent-[var(--accent-blue)]" />
          Send as HTML
        </label>
        {send.error && <Notice title="The email was not sent">{send.error}</Notice>}
        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-color)]">
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="submit" disabled={send.pending} className="btn btn-success">
            {send.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {send.pending ? 'Sending…' : 'Send email'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
