import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, type Variants } from "framer-motion";
import { ArrowSquareOut, Check, Copy, WhatsappLogo, X } from "@phosphor-icons/react";
import { OWNER_NAME, waLink } from "./site";

export type Credit = { name: string; width: number; height: number; title: string; creator: string; license: string;
  licenseUrl: string; page: string };

export const spring = { type: "spring", stiffness: 100, damping: 20 } as const;
export const listIn: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
export const itemIn: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: spring } };

/** A photo from public/img/<site>/ at two widths, sized from its credit record so nothing jumps while it loads. */
export function makePic(site: string, credits: Credit[]) {
  const byName = new Map(credits.map((c) => [c.name, c]));
  return function Pic({ name, alt, sizes = "100vw", className = "", eager = false, style }:
    { name: string; alt: string; sizes?: string; className?: string; eager?: boolean; style?: CSSProperties }) {
    const c = byName.get(name);
    const base = `${import.meta.env.BASE_URL}img/${site}/${name}`;
    return (
      <img src={`${base}-1600.webp`} srcSet={`${base}-800.webp 800w, ${base}-1600.webp 1600w`} sizes={sizes}
        width={c?.width} height={c?.height} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async"
        {...(eager ? { fetchpriority: "high" } : {})} className={className} style={style} />
    );
  };
}

/** The strip on top of every demo: what this is, and the one way to get one. */
export function DemoBar({ shop }: { shop: string }) {
  return (
    <div className="bg-ink text-ground">
      <div className="page flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 py-2 text-sm">
        <p className="opacity-90">
          Demo website by {OWNER_NAME}. {shop} is a made-up shop, and nothing on this page is sent anywhere.
        </p>
        <div className="flex items-center gap-4">
          <a href={import.meta.env.BASE_URL} className="underline decoration-ground/40 underline-offset-4 hover:decoration-ground">
            All demos
          </a>
          <a href={waLink(`Hi Adithya, I saw the ${shop} demo. I'd like a website like it for my shop.`)}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold underline decoration-ground/40 underline-offset-4 hover:decoration-ground">
            <WhatsappLogo size={16} weight="bold" aria-hidden /> Get one for your shop
          </a>
        </div>
      </div>
    </div>
  );
}

/** Shows the WhatsApp message the shop would receive. A demo has no real number, so it never sends. */
export function MessagePreview({ open, onClose, title, message, shop }:
  { open: boolean; onClose: () => void; title: string; message: string; shop: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setCopied(false); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); } catch { setCopied(false); }
  };
  const time = new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="preview-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl border border-line bg-ground p-0 text-ink shadow-[0_24px_60px_-20px_rgb(var(--ink)/0.45)] open:animate-[pop_.35s_cubic-bezier(0.16,1,0.3,1)]">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <h2 id="preview-title" className="text-lg font-semibold leading-snug">{title}</h2>
          <p className="mt-1 text-sm text-soft">This is the message {shop} would get on WhatsApp.</p>
        </div>
        <button type="button" onClick={onClose} className="btn -mr-2 -mt-1 h-11 w-11 shrink-0 p-0 hover:bg-ink/5" aria-label="Close">
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="bg-[#e9e4da] px-4 py-5 sm:px-6">
        <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-[#d8f5c8] px-4 py-3 text-[15px] leading-relaxed text-[#1c2a1e] shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message}</p>
          <p className="mt-1 text-right text-xs text-[#4b5b4d]">{time}</p>
        </div>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <p className="text-sm text-soft">
          {shop} is a demo, so nothing was sent. On your own website this button opens WhatsApp with the message ready,
          addressed to your number, and no app takes a cut.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={copy} className="btn-line">
            {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />} {copied ? "Copied" : "Copy message"}
          </button>
          <a className="btn-ink" href={waLink(`Hi Adithya, I tried the ${shop} demo. I'd like a website like it for my shop.`)}
            target="_blank" rel="noreferrer">
            <WhatsappLogo size={18} weight="bold" aria-hidden /> Get one for your shop
          </a>
        </div>
      </div>
    </dialog>
  );
}

/** Label above, helper and error below, wired up for screen readers. */
export function Field({ label, hint, error, children, className = "" }:
  { label: string; hint?: string; error?: string; className?: string;
    children: (a: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined, errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && !error && <p id={hintId} className="text-sm text-soft">{hint}</p>}
      {error && <p id={errorId} className="text-sm font-medium text-bad">{error}</p>}
    </div>
  );
}

/** A button that leans toward the pointer (fine pointers only; outside React's render cycle). */
export function Magnetic({ children, className = "" }: { children: ReactNode; className?: string }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 150, damping: 15 }), sy = useSpring(y, { stiffness: 150, damping: 15 });
  return (
    <motion.span className={`inline-flex ${className}`} style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.2);
        y.set((e.clientY - r.top - r.height / 2) * 0.3);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.span>
  );
}

export function LoadError({ what, error, retry }: { what: string; error: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.06] p-6">
      <p className="font-semibold">The {what} didn't load.</p>
      <p className="mt-1 text-sm text-soft">Check your connection and try again ({error}).</p>
      <button type="button" onClick={retry} className="btn-ink mt-4">Try again</button>
    </div>
  );
}

export function Credits({ credits, note }: { credits: Credit[]; note?: string }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none underline decoration-current/40 underline-offset-4 hover:decoration-current [&::-webkit-details-marker]:hidden">
        Photo credits ({credits.length})
      </summary>
      <ul className="mt-3 space-y-1.5 opacity-90">
        {credits.map((c) => (
          <li key={c.name}>
            <a href={c.page} target="_blank" rel="noreferrer" className="underline decoration-current/30 underline-offset-2 hover:decoration-current">
              {c.title}
            </a>{" "}
            by {c.creator || "unknown"},{" "}
            {c.licenseUrl ? <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-current/30 underline-offset-2">{c.license}</a> : c.license}, via Wikimedia Commons
          </li>
        ))}
      </ul>
      {note && <p className="mt-3 opacity-80">{note}</p>}
    </details>
  );
}

export function ExternalNote({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4">
      {children} <ArrowSquareOut size={14} aria-hidden />
    </a>
  );
}

/** A row of day buttons (scrolls sideways on phones). */
export function DayChips({ days, value, onChange, legend = "Day", activeClass, idleClass }:
  { days: string[]; value: string; onChange: (iso: string) => void; legend?: string; activeClass: string; idleClass: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2">
        {days.map((d) => {
          const date = new Date(d + "T00:00:00Z");
          const wd = date.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
          const mm = date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
          return (
            <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}
              className={`btn min-h-[64px] shrink-0 flex-col gap-0 rounded-2xl px-3.5 py-2 leading-tight ${value === d ? activeClass : idleClass}`}>
              <span className="text-xs">{wd}</span>
              <span className="text-lg font-bold tabular-nums">{date.getUTCDate()}</span>
              <span className="text-xs">{mm}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
