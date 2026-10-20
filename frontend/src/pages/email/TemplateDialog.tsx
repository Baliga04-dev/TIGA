import { useState } from 'react';
import { ArrowUpRight, Loader2, Sparkles } from 'lucide-react';
import { CopyButton, Field, Modal, Notice } from '../../components/ui';
import { useAction } from '../../hooks/useAction';
import { api } from '../../services/api';
import type { EmailTemplate, ServiceType } from '../../types';

const SERVICES: { value: ServiceType; label: string }[] = [
  { value: 'web_development', label: 'Web Development' },
  { value: 'software_development', label: 'Software Development' },
  { value: 'general', label: 'General Freelance' },
];

export function TemplateDialog({ service, onClose, onUse }: {
  service: ServiceType;
  onClose: () => void;
  onUse: (template: EmailTemplate) => void;
}) {
  const [form, setForm] = useState({ service_type: service, recipient_name: '', company_name: '', portfolio_link: '' });
  const generate = useAction(() => api.generateTemplate(form));
  const template = generate.result?.template;

  return (
    <Modal title="Cold email template" onClose={onClose}>
      {template ? (
        <div className="space-y-4">
          <Field label="Subject">
            {(id) => (
              <div className="flex items-center gap-2">
                <input id={id} readOnly value={template.subject} className="input flex-1" />
                <CopyButton text={template.subject} label="Copy subject" iconOnly />
              </div>
            )}
          </Field>
          <Field label="Body">
            {(id) => (
              <div className="flex items-start gap-2">
                <textarea id={id} readOnly value={template.body} className="input min-h-[280px] flex-1 resize-y font-mono text-sm" />
                <CopyButton text={template.body} label="Copy body" iconOnly />
              </div>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={generate.reset} className="btn btn-secondary">Generate another</button>
            <button type="button" onClick={() => onUse(template)} className="btn btn-primary">
              <ArrowUpRight className="size-4" aria-hidden="true" />
              Use this template
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generate.run();
          }}
          className="space-y-4"
        >
          <Field label="Service">
            {(id) => (
              <select id={id} className="input" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })}>
                {SERVICES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Recipient name">
            {(id) => <input id={id} className="input" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} placeholder="Sam" />}
          </Field>
          <Field label="Company name">
            {(id) => <input id={id} className="input" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Acme Inc." />}
          </Field>
          <Field label="Portfolio link (optional)">
            {(id) => <input id={id} type="url" className="input" value={form.portfolio_link} onChange={(e) => setForm({ ...form, portfolio_link: e.target.value })} placeholder="https://yourportfolio.com" />}
          </Field>
          {generate.error && <Notice title="Couldn't generate the template">{generate.error}</Notice>}
          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border-color)]">
            <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={generate.pending} className="btn btn-primary">
              {generate.pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {generate.pending ? 'Generating…' : 'Generate template'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
