import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Clipboard } from 'lucide-react';
import { cn } from '../lib/utils';

export function PageHeader({ title, description, action }: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
        {description && (
          <p className="text-[var(--text-secondary)] mt-1">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ title, children, action, className = '' }: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card', className)}>
      {title && (
        <div className="card-header">
          <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

/** An inline message for failures and empty states. Errors are announced to screen readers. */
export function Notice({ tone = 'error', title, children, action }: {
  tone?: 'error' | 'info';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border p-3 text-sm',
        tone === 'error'
          ? 'border-[var(--accent-red)]/40 bg-[var(--accent-red)]/10 text-[var(--text-primary)]'
          : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
      )}
    >
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}


/** A labelled form control. The label is tied to the control through the id passed to `children`. */
export function Field({ label, hint, className, children }: {
  label: string;
  hint?: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</p>}
    </div>
  );
}

/** Copies text and says whether it worked. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
      {state === 'copied' ? <Check className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}
