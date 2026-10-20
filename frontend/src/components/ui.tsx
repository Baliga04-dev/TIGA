import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard, X } from 'lucide-react';
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

function copyLabel(state: 'idle' | 'copied' | 'failed', label: string) {
  return state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;
}

/** Copies text and says whether it worked. */
export function CopyButton({ text, label = 'Copy', iconOnly = false }: { text: string; label?: string; iconOnly?: boolean }) {
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
    <button
      type="button"
      className={cn('btn btn-ghost btn-sm', iconOnly && 'p-1')}
      onClick={copy}
      aria-label={iconOnly ? copyLabel(state, label) : undefined}
      title={iconOnly ? copyLabel(state, label) : undefined}
    >
      {state === 'copied' ? <Check className="size-4" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />}
      {!iconOnly && copyLabel(state, label)}
    </button>
  );
}


const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * An accessible modal dialog: labelled by its title, closes on Escape or a backdrop click,
 * keeps Tab inside, and hands focus back to whatever opened it.
 */
export function Modal({ title, onClose, wide = false, children }: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, textarea, select, [data-autofocus]');
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab' && panel.current) {
        const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === firstItem || document.activeElement === panel.current)) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'w-full max-h-[90vh] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl',
          wide ? 'max-w-3xl' : 'max-w-2xl',
        )}
      >
        <div className="flex items-center justify-between gap-4 p-4 border-b border-[var(--border-color)]">
          <h2 id={titleId} className="font-semibold truncate">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost p-1.5" aria-label="Close">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-4.5rem)]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A short confirmation that clears itself. Errors belong next to what failed, not here. */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-lg bg-[var(--accent-green)] px-4 py-3 text-sm font-medium text-[var(--bg-primary)] shadow-lg"
    >
      <Check className="size-4" aria-hidden="true" />
      {message}
    </div>
  );
}
