import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, CoatHanger, MapPin, Needle, Ruler, Scissors, WhatsappLogo, X } from "@phosphor-icons/react";
import credits from "../data/credits-boutique.json";
import { PHONE, bengaluruNow, clock, niceDate, openDays, rupees, slotsFor } from "../shared/site";
import { useJson, type Loaded } from "../shared/useJson";
import { Credits, DayChips, DemoBar, Field, LoadError, Magnetic, MessagePreview, itemIn, listIn, makePic, spring } from "../shared/ui";

const SHOP = "Navilu";
const Pic = makePic("boutique", credits);
const CLOSED_DAY = 2; // Tuesday
const OPEN = 10 * 60 + 30, CLOSE = 20 * 60 + 30;
const MAX_TRIAL = 4;

type Weave = { id: string; name: string };
type Item = { id: string; weave: string; name: string; price: number; occasions: string[]; stock: number; pic?: string;
  picAlt?: string; colours: [string, string, string]; desc: string; length: string; care: string };
type Catalogue = { weaves: Weave[]; items: Item[] };

const OCCASIONS = [["all", "Any occasion"], ["wedding", "Wedding"], ["festive", "Festival"], ["office", "Office"], ["daily", "Every day"]];
const PRICES = [["all", "Any price"], ["low", "Under ₹3,000"], ["mid", "₹3,000 to ₹10,000"], ["high", "Over ₹10,000"]];

export default function App() {
  const [catalogue, retry] = useJson<Catalogue>("navilu-catalogue.json");
  const [kept, setKept] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const items = catalogue.status === "ok" ? catalogue.data.items : [];
  const toggle = (id: string) => {
    if (kept.includes(id)) { setKept(kept.filter((k) => k !== id)); setNotice(""); return; }
    if (kept.length >= MAX_TRIAL) { setNotice(`Your trial shelf holds ${MAX_TRIAL} sarees. Take one off to keep this one aside.`); return; }
    setKept([...kept, id]);
    setNotice(`${items.find((i) => i.id === id)?.name ?? "Saree"} is on your trial shelf (${kept.length + 1} of ${MAX_TRIAL}).`);
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div>
      <DemoBar shop={SHOP} />
      <Header kept={kept.length} />
      <main>
        <Hero />
        <div className="zari" aria-hidden />
        <Shelf catalogue={catalogue} retry={retry} kept={kept} toggle={toggle} />
        <TrialShelf items={items.filter((i) => kept.includes(i.id))} remove={toggle} />
        <Tailoring />
        <Looms />
        <Visit />
      </main>
      <Footer />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <AnimatePresence>
          {notice && (
            <motion.p key={notice} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              transition={spring} className="pointer-events-auto max-w-md rounded-2xl bg-ink px-5 py-3 text-[15px] text-ground shadow-lg">
              {notice} {kept.length > 0 && <a href="#trial" className="font-semibold underline underline-offset-4">See the shelf</a>}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Header({ kept }: { kept: number }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line/80 bg-ground/90 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <a href="#top" className="font-display text-[1.7rem] leading-none tracking-tight">Navilu</a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-7 text-[15px] font-medium">
            {[["#shelf", "The shelf"], ["#tailoring", "Tailoring"], ["#looms", "The looms"], ["#visit", "Visit"]].map(([h, l]) => (
              <li key={h}><a href={h} className="underline-offset-8 hover:underline">{l}</a></li>
            ))}
          </ul>
        </nav>
        <a href="#trial" className="btn-line min-h-[40px] px-4 py-1.5 text-[15px]">
          <CoatHanger size={18} aria-hidden /> Trial shelf <span className="tabular-nums">({kept})</span>
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="page grid items-end gap-10 pb-16 pt-10 md:pt-16 lg:grid-cols-[1.25fr_1fr] lg:gap-14 lg:pb-20">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="lg:pb-10">
        <p className="text-[15px] font-medium text-soft">11th Main, Jayanagar 4th Block. Open 10:30am to 8:30pm, closed Tuesdays.</p>
        <h1 className="mt-5 text-[2.9rem] leading-[1.02] tracking-tight md:text-7xl">Woven in Ilkal, fitted in Jayanagar</h1>
        <p className="mt-6 max-w-[50ch] text-lg leading-relaxed text-soft md:text-xl">
          Navilu sells handloom sarees from Karnataka's own weaving towns: Mysore silk, Ilkal, Molakalmuru and Udupi
          cotton. Keep a few aside to try on, and we stitch the blouse in five days.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Magnetic><a href="#shelf" className="btn-ink px-7 text-lg">Browse the shelf</a></Magnetic>
          <a href="#tailoring" className="btn-line px-6 text-lg">Book a fitting</a>
        </div>
      </motion.div>
      <motion.div className="relative grid grid-cols-[1fr_0.62fr] items-end gap-4" initial={{ opacity: 0 }}
        animate={{ opacity: 1 }} transition={{ ...spring, delay: 0.1 }}>
        <Pic name="silk-border" eager sizes="(min-width: 1024px) 28vw, 60vw" alt="The gold zari border of a red Mysore silk saree"
          className="aspect-[3/4] w-full rounded-t-full object-cover" />
        <div className="space-y-4 pb-6">
          <Pic name="peacock-1" sizes="(min-width: 1024px) 16vw, 36vw" alt="A peacock embroidered in gold thread on ivory cotton"
            className="aspect-square w-full rounded-full object-cover" />
          <p className="text-sm leading-snug text-soft">The navilu, peacock, that the shop is named for, embroidered by hand on Udupi cotton.</p>
        </div>
      </motion.div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- swatch
/** A drawn swatch for pieces without a photograph: woven body, zari borders and the pallu, in the saree's own colours. */
function Fold({ item, className = "" }: { item: Item; className?: string }) {
  const [body, border, pallu] = item.colours;
  const id = item.id;
  const zari = "#d9b866";
  const light = (hex: string) => parseInt(hex.slice(1, 3), 16) * 0.3 + parseInt(hex.slice(3, 5), 16) * 0.59 + parseInt(hex.slice(5, 7), 16) * 0.11 > 150;
  const thread = light(body) ? "rgb(0 0 0 / 0.07)" : "rgb(255 255 255 / 0.06)";
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Drawing of the ${item.name} saree`}
      className={className} style={{ background: body } as CSSProperties}>
      <defs>
        <pattern id={`weave-${id}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 0.5H4M0.5 0V4" stroke={thread} strokeWidth="1" />
        </pattern>
        <pattern id={`mango-${id}`} width="34" height="40" patternUnits="userSpaceOnUse">
          <path d="M17 31c-7 0-10-6-8-11 2-6 9-6 11-12 3 5 4 11 1 16-1 3-2 7-4 7z" fill={zari} />
          <circle cx="15" cy="23" r="2.2" fill={border} />
        </pattern>
        <pattern id={`flower-${id}`} width="26" height="26" patternUnits="userSpaceOnUse">
          {[[13, 8], [8, 13], [18, 13], [13, 18]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill={zari} />)}
          <circle cx="13" cy="13" r="1.8" fill={pallu} />
        </pattern>
        <pattern id={`check-${id}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 9H18M9 0V18" stroke="rgb(255 255 255 / 0.28)" strokeWidth="2" />
        </pattern>
        <linearGradient id={`fold-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" /><stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.10" /><stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>
      {id === "N-1081" && <rect width="400" height="500" fill={`url(#check-${id})`} />}
      <rect width="400" height="500" fill={`url(#weave-${id})`} />
      {/* the pallu: the decorated end, shown down the right */}
      <rect x="262" width="138" height="500" fill={pallu} />
      {item.weave === "ilkal" && [292, 326, 360].map((x) => <rect key={x} x={x} width="10" height="500" fill="#f3efe6" />)}
      {item.weave === "molakalmuru" && <rect x="262" width="138" height="500" fill={`url(#flower-${id})`} />}
      {item.weave === "mysore" && <rect x="262" width="138" height="500" fill={`url(#mango-${id})`} opacity="0.55" />}
      <rect x="262" width="138" height="500" fill={`url(#weave-${id})`} />
      <rect x="258" width="4" height="500" fill={zari} opacity={item.weave === "udupi" ? 0 : 1} />
      {/* the borders along both edges, with zari lines and a row of mango motifs on the wide one */}
      <rect width="400" height="22" fill={border} />
      <rect y="22" width="400" height="2" fill={zari} />
      <rect y="408" width="400" height="92" fill={border} />
      <rect y="412" width="400" height="2" fill={zari} />
      <rect y="494" width="400" height="2" fill={zari} />
      {item.weave !== "udupi" && <rect y="428" width="400" height="56" fill={`url(#mango-${id})`} />}
      <rect width="400" height="500" fill={`url(#fold-${id})`} />
      <path d="M0 150 C120 170 260 140 400 165" stroke="#000" strokeOpacity="0.12" strokeWidth="10" fill="none" />
      <path d="M0 300 C140 285 250 320 400 300" stroke="#fff" strokeOpacity="0.10" strokeWidth="12" fill="none" />
    </svg>
  );
}

function Picture({ item, className }: { item: Item; className: string }) {
  return item.pic
    ? <Pic name={item.pic} sizes="(min-width: 1024px) 40vw, 50vw" alt={item.picAlt ?? item.name} className={`object-cover ${className}`}
        style={item.pic === "kurta" ? { objectPosition: "50% 100%" } : undefined} />
    : <Fold item={item} className={className} />;
}

// ---------------------------------------------------------------------------------------------- shelf
function Shelf({ catalogue, retry, kept, toggle }:
  { catalogue: Loaded<Catalogue>; retry: () => void; kept: string[]; toggle: (id: string) => void }) {
  const [weave, setWeave] = useState("all");
  const [occasion, setOccasion] = useState("all");
  const [price, setPrice] = useState("all");
  const [sort, setSort] = useState("shelf");
  const [open, setOpen] = useState<Item | null>(null);

  const shown = useMemo(() => {
    if (catalogue.status !== "ok") return [];
    const fit = catalogue.data.items.filter((i) => (weave === "all" || i.weave === weave)
      && (occasion === "all" || i.occasions.includes(occasion))
      && (price === "all" || (price === "low" ? i.price < 3000 : price === "mid" ? i.price >= 3000 && i.price <= 10000 : i.price > 10000)));
    if (sort === "low") return [...fit].sort((a, b) => a.price - b.price);
    if (sort === "high") return [...fit].sort((a, b) => b.price - a.price);
    return fit;
  }, [catalogue, weave, occasion, price, sort]);
  const reset = () => { setWeave("all"); setOccasion("all"); setPrice("all"); };
  const weaveName = (id: string) => catalogue.status === "ok" ? catalogue.data.weaves.find((w) => w.id === id)?.name ?? id : id;

  return (
    <section id="shelf" aria-labelledby="shelf-title" className="page py-20 md:py-24">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 id="shelf-title" className="text-4xl tracking-tight md:text-6xl">The shelf</h2>
          <p className="mt-4 max-w-[58ch] text-lg text-soft">
            Every saree here is in the shop today. Open one for its weave and care, or keep up to four aside and try
            them on when you visit.
          </p>
        </div>
        {catalogue.status === "ok" && (
          <p className="text-[15px] text-soft" aria-live="polite">{shown.length} of {catalogue.data.items.length} pieces</p>
        )}
      </div>

      {catalogue.status === "ok" && (
        <div className="mt-10 space-y-4 border-y border-line py-5">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Weave">
            {[{ id: "all", name: "All weaves" }, ...catalogue.data.weaves].map((w) => (
              <button key={w.id} type="button" aria-pressed={weave === w.id} onClick={() => setWeave(w.id)}
                className={`btn min-h-[40px] shrink-0 whitespace-nowrap px-4 py-1.5 text-[15px] ${weave === w.id ? "bg-field text-on-field" : "border border-line hover:border-ink/40"}`}>
                {w.name}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select aria-label="Occasion" className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
              {OCCASIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Price" className="input" value={price} onChange={(e) => setPrice(e.target.value)}>
              {PRICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select aria-label="Sort" className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="shelf">As they sit on the shelf</option>
              <option value="low">Price, low to high</option>
              <option value="high">Price, high to low</option>
            </select>
          </div>
        </div>
      )}

      {catalogue.status === "loading" && (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4" aria-busy="true" aria-label="Loading the shelf">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={i === 0 ? "lg:col-span-2" : ""}>
              <div className={`skeleton ${i === 0 ? "aspect-[4/5] lg:aspect-[8/5]" : "aspect-[4/5]"}`} />
              <div className="skeleton mt-3 h-5 w-3/4" /><div className="skeleton mt-2 h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}
      {catalogue.status === "error" && <div className="mt-10"><LoadError what="shelf" error={catalogue.error} retry={retry} /></div>}
      {catalogue.status === "ok" && shown.length === 0 && (
        <div className="mt-10 grid items-center gap-8 rounded-[2rem] bg-tint p-8 md:grid-cols-[auto_1fr] md:p-12">
          <CoatHanger size={56} className="text-field" aria-hidden />
          <div>
            <p className="font-display text-2xl">Nothing on the shelf fits all of that.</p>
            <p className="mt-2 max-w-[56ch] text-soft">
              Most wedding silks are over ₹10,000 and most cottons under ₹3,000. Widen the price or the occasion, or
              ask us: the weavers take orders for colours we don't have.
            </p>
            <button type="button" onClick={reset} className="btn-ink mt-5">Show every piece</button>
          </div>
        </div>
      )}
      {catalogue.status === "ok" && shown.length > 0 && (
        <motion.ul className="mt-10 grid grid-flow-dense grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4" variants={listIn}
          initial="hidden" animate="show">
          <AnimatePresence initial={false}>
            {shown.map((item) => {
              const wide = Boolean(item.pic) && item.weave !== "kurta";
              const isKept = kept.includes(item.id);
              return (
                <motion.li key={item.id} layout variants={itemIn} exit={{ opacity: 0, scale: 0.96 }} transition={spring}
                  className={wide ? "lg:col-span-2" : ""}>
                  <button type="button" onClick={() => setOpen(item)} className="group block w-full text-left active:scale-[0.99]">
                    <span className="block overflow-hidden rounded-[1.25rem]">
                      <span className="block transition-transform duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]">
                        <Picture item={item} className={`w-full ${wide ? "aspect-[4/5] lg:aspect-[8/5]" : "aspect-[4/5]"}`} />
                      </span>
                    </span>
                    <span className="mt-3 flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <span className="font-medium leading-snug group-hover:underline group-hover:underline-offset-4">{item.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{rupees(item.price)}</span>
                    </span>
                    <span className="mt-1 block text-sm text-soft">
                      {weaveName(item.weave)}, {item.stock === 0 ? "sold out" : item.stock === 1 ? "last one" : `${item.stock} in the shop`}
                    </span>
                  </button>
                  {item.stock > 0 && (
                    <button type="button" aria-pressed={isKept} onClick={() => toggle(item.id)}
                      className={`btn mt-3 min-h-[40px] px-4 py-1.5 text-sm ${isKept ? "bg-accent text-on-accent" : "border border-line hover:border-ink/40"}`}>
                      <CoatHanger size={16} aria-hidden /> {isKept ? "Kept aside" : "Keep aside"}
                    </button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
      <ItemDialog item={open} onClose={() => setOpen(null)} kept={open ? kept.includes(open.id) : false} toggle={toggle}
        weaveName={open ? weaveName(open.weave) : ""} />
    </section>
  );
}

function ItemDialog({ item, onClose, kept, toggle, weaveName }:
  { item: Item | null; onClose: () => void; kept: boolean; toggle: (id: string) => void; weaveName: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);
  return (
    <>
      <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-labelledby="item-title"
        className="m-auto w-[min(60rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[2rem] bg-ground p-0 text-ink open:animate-[pop_.35s_cubic-bezier(0.16,1,0.3,1)]">
        {item && (
          <div className="grid md:grid-cols-[1fr_1.05fr]">
            <Picture item={item} className="aspect-[4/5] w-full md:h-full" />
            <div className="relative p-6 md:p-9">
              <button type="button" onClick={onClose} aria-label="Close" className="btn absolute right-4 top-4 h-11 w-11 p-0 hover:bg-ink/5">
                <X size={20} aria-hidden />
              </button>
              <p className="pr-12 text-sm font-medium text-soft">{weaveName}, piece {item.id}</p>
              <h2 id="item-title" className="mt-2 pr-8 text-3xl leading-tight tracking-tight md:text-4xl">{item.name}</h2>
              <p className="mt-4 text-2xl font-semibold tabular-nums">{rupees(item.price)}</p>
              <p className="mt-5 text-[17px] leading-relaxed">{item.desc}</p>
              <dl className="mt-6 divide-y divide-line border-y border-line text-[15px]">
                <div className="grid grid-cols-[7rem_1fr] gap-4 py-3"><dt className="text-soft">Length</dt><dd>{item.length}</dd></div>
                <div className="grid grid-cols-[7rem_1fr] gap-4 py-3"><dt className="text-soft">Care</dt><dd>{item.care}</dd></div>
                <div className="grid grid-cols-[7rem_1fr] gap-4 py-3"><dt className="text-soft">In the shop</dt>
                  <dd>{item.stock === 0 ? "Sold out. Ask and we'll have it woven again." : item.stock === 1 ? "The last one" : `${item.stock} pieces`}</dd></div>
              </dl>
              <div className="mt-7 flex flex-wrap gap-3">
                {item.stock > 0 && (
                  <button type="button" onClick={() => toggle(item.id)} aria-pressed={kept} className={kept ? "btn-accent" : "btn-ink"}>
                    <CoatHanger size={18} aria-hidden /> {kept ? "Kept aside for your trial" : "Keep aside for a trial"}
                  </button>
                )}
                <button type="button" onClick={() => setAsk(true)} className="btn-line">
                  <WhatsappLogo size={18} aria-hidden /> Ask about this piece
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
      <MessagePreview open={ask} onClose={() => setAsk(false)} title="Your question is ready" shop={SHOP}
        message={item ? `Hello Navilu, I'm asking about piece ${item.id}, ${item.name} (${rupees(item.price)}). Is it available in another colour, and can you send a photo of the pallu?` : ""} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------- trial
function TrialShelf({ items, remove }: { items: Item[]; remove: (id: string) => void }) {
  const days = useMemo(() => openDays(CLOSED_DAY, 10), []);
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<number | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const times = slotsFor(day, OPEN, CLOSE - 60);
  const total = items.reduce((n, i) => n + i.price, 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!items.length) next.items = "Keep at least one saree aside first.";
    if (time === "" || !times.includes(time)) next.time = times.length ? "Pick a time to come in." : "We close soon today. Pick another day.";
    if (name.trim().length < 2) next.name = "Write your name so we can label the bag.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 98860 44217.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  const message = ["Hello Navilu, please keep these aside for a trial:", ...items.map((i) => `- ${i.id} ${i.name} (${rupees(i.price)})`),
    "", `I'll come on ${niceDate(day)} at ${time === "" ? "" : clock(time)}.`, `${name.trim()}, ${phone.trim()}`].join("\n");

  return (
    <section id="trial" aria-labelledby="trial-title" className="bg-tint">
      <div className="page grid gap-12 py-20 md:py-24 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <h2 id="trial-title" className="text-4xl tracking-tight md:text-5xl">Your trial shelf</h2>
          <p className="mt-4 max-w-[52ch] text-lg text-soft">
            We hold up to four pieces for two days, steamed and on a hanger in the trial room. No advance, and no need to
            buy any of them.
          </p>
          {items.length === 0 ? (
            <div className="mt-8 flex items-center gap-5 rounded-[1.5rem] border border-dashed border-ink/25 p-6">
              <CoatHanger size={40} className="shrink-0 text-field" aria-hidden />
              <p className="text-[15px]">Nothing kept aside yet. Press <span className="font-semibold">Keep aside</span> under up to
                four sarees on <a href="#shelf" className="underline underline-offset-4">the shelf</a>.</p>
            </div>
          ) : (
            <ul className="mt-8 divide-y divide-line border-y border-line">
              <AnimatePresence initial={false}>
                {items.map((i) => (
                  <motion.li key={i.id} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                    transition={spring} className="flex items-center gap-4 py-3">
                    <Picture item={i} className="h-16 w-14 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{i.name}</p>
                      <p className="text-sm tabular-nums text-soft">{i.id}, {rupees(i.price)}</p>
                    </div>
                    <button type="button" onClick={() => remove(i.id)} aria-label={`Take ${i.name} off the trial shelf`}
                      className="btn h-11 w-11 shrink-0 p-0 hover:bg-ink/5"><X size={18} aria-hidden /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {items.length > 0 && <p className="mt-3 text-[15px] tabular-nums text-soft">{items.length} of {MAX_TRIAL} kept, {rupees(total)} if you took them all</p>}
          {errors.items && <p role="alert" className="mt-3 text-sm font-medium text-bad">{errors.items}</p>}
        </div>
        <form onSubmit={submit} noValidate className="min-w-0 space-y-5 self-start rounded-[2rem] bg-ground p-6 md:p-9">
          <DayChips days={days} value={day} onChange={(d) => { setDay(d); setTime(""); }} legend="When will you come in?"
            activeClass="bg-field text-on-field" idleClass="bg-tint hover:bg-line" />
          <Field label="Time" error={errors.time}>
            {(a) => (
              <select {...a} className="input" value={time} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{times.length ? "Choose a time" : "No times left today"}</option>
                {times.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
              </select>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" error={errors.name}>
              {(a) => <input {...a} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            </Field>
            <Field label="Mobile number" error={errors.phone}>
              {(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}
            </Field>
          </div>
          <button type="submit" className="btn-ink w-full text-lg sm:w-auto sm:px-8">
            <WhatsappLogo size={20} weight="bold" aria-hidden /> Ask us to keep them aside
          </button>
        </form>
      </div>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your trial request is ready" message={message} shop={SHOP} />
    </section>
  );
}

// ------------------------------------------------------------------------------------------ tailoring
const STITCHING = [
  ["Simple blouse", 650], ["Lined blouse", 950], ["Princess cut, with piping", 1450], ["Saree fall and pico", 180],
  ["Kuchu tassels on the pallu", 350], ["Express, ready in 48 hours", 300],
] as const;
const STEPS = [
  [Ruler, "Measure", "Twelve measurements, or bring a blouse that fits and we copy it."],
  [Scissors, "Cut", "Cut from your blouse piece the same week, lining from our stock."],
  [Needle, "First fitting", "On day three, so the darts and sleeves can still move."],
  [CoatHanger, "Ready", "Pressed and on a hanger on day five. Alterations within a month are free."],
] as const;

function Tailoring() {
  const days = useMemo(() => openDays(CLOSED_DAY, 10), []);
  const [service, setService] = useState("");
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<number | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const times = slotsFor(day, OPEN, CLOSE - 30);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!service) next.service = "Pick what you'd like stitched.";
    if (time === "" || !times.includes(time)) next.time = times.length ? "Pick a time." : "We close soon today. Pick another day.";
    if (name.trim().length < 2) next.name = "Write your name.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 98860 44217.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  return (
    <section id="tailoring" aria-labelledby="tailoring-title" className="bg-field text-on-field">
      <div className="zari" aria-hidden />
      <div className="page py-20 md:py-24">
        <h2 id="tailoring-title" className="max-w-[16ch] text-4xl tracking-tight md:text-6xl">Blouses stitched in five days</h2>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([Icon, title, text], i) => (
            <li key={title} className="border-t border-on-field/25 pt-5">
              <p className="flex items-center gap-3 text-sm text-on-field/75"><Icon size={22} aria-hidden /> Day {[1, 1, 3, 5][i]}</p>
              <h3 className="mt-3 font-display text-2xl">{i + 1}. {title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-on-field/85">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-16 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <h3 className="font-display text-3xl">Stitching prices</h3>
            <table className="mt-5 w-full text-[15px]">
              <caption className="sr-only">Stitching prices</caption>
              <tbody className="divide-y divide-on-field/20 border-y border-on-field/20">
                {STITCHING.map(([label, price]) => (
                  <tr key={label}><th scope="row" className="py-3 text-left font-normal">{label}</th>
                    <td className="py-3 text-right font-semibold tabular-nums">{label.startsWith("Express") ? "+" : ""}{rupees(price)}</td></tr>
                ))}
              </tbody>
            </table>
            <Pic name="peacock-2" sizes="(min-width: 1024px) 30vw, 100vw" alt="Gold thread embroidery of a peacock's neck and a blue flower"
              className="mt-8 aspect-[16/9] w-full rounded-[1.5rem] object-cover" />
          </div>
          <form onSubmit={submit} noValidate className="min-w-0 space-y-5 self-start rounded-[2rem] bg-ground p-6 text-ink md:p-9">
            <h3 className="font-display text-3xl">Book a fitting</h3>
            <Field label="What should we stitch?" error={errors.service} hint="Bring your blouse piece, and a blouse that fits if you have one.">
              {(a) => (
                <select {...a} className="input" value={service} onChange={(e) => setService(e.target.value)}>
                  <option value="">Choose one</option>
                  {STITCHING.slice(0, 5).map(([l, p]) => <option key={l} value={l}>{l}, {rupees(p)}</option>)}
                  <option value="Alteration">Alteration of something you own</option>
                </select>
              )}
            </Field>
            <DayChips days={days} value={day} onChange={(d) => { setDay(d); setTime(""); }}
              activeClass="bg-field text-on-field" idleClass="bg-tint hover:bg-line" />
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Time" error={errors.time}>
                {(a) => (
                  <select {...a} className="input" value={time} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">{times.length ? "Choose" : "None left"}</option>
                    {times.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Name" error={errors.name}>
                {(a) => <input {...a} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
              </Field>
              <Field label="Mobile number" error={errors.phone}>
                {(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}
              </Field>
            </div>
            <button type="submit" className="btn-accent w-full text-lg sm:w-auto sm:px-8">
              <WhatsappLogo size={20} weight="bold" aria-hidden /> Request the fitting
            </button>
          </form>
        </div>
      </div>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your fitting request is ready" shop={SHOP}
        message={[`Fitting at Navilu: ${service}`, `${niceDate(day)}, ${time === "" ? "" : clock(time)}`, `${name.trim()}, ${phone.trim()}`].join("\n")} />
    </section>
  );
}

// -------------------------------------------------------------------------------------------- looms
const TOWNS = [
  ["Mysuru", "145 km", "Mysore silk crepe, woven on power looms in the government's own factory since 1912."],
  ["Molakalmuru", "220 km", "Heavy silks with temple borders, from a small town on the Andhra border."],
  ["Udupi", "400 km", "Handloom cotton from a few dozen weavers' co-operatives on the coast."],
  ["Ilkal", "460 km", "Cotton-silk with a pallu joined to the body by hand, row by row, called kondi."],
] as const;

function Looms() {
  return (
    <section id="looms" aria-labelledby="looms-title" className="page py-20 md:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-24">
          <h2 id="looms-title" className="text-4xl tracking-tight md:text-6xl">Four towns, one shelf</h2>
          <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-soft">
            We buy from weavers and co-operatives in four Karnataka towns, twice a year, and pay them before the sarees
            leave the loom. Each piece keeps the weaver's tag.
          </p>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {TOWNS.map(([town, km, text]) => (
              <li key={town} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-5">
                <h3 className="font-display text-2xl">{town}</h3>
                <p className="text-right font-semibold tabular-nums">{km}</p>
                <p className="col-span-2 max-w-[54ch] text-[15px] leading-relaxed text-soft">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Pic name="loom-weaver" sizes="(min-width: 1024px) 45vw, 100vw" alt="A weaver at a wooden handloom with a striped cloth on it"
            className="col-span-2 aspect-[3/2] w-full rounded-[1.5rem] object-cover" />
          <Pic name="loom" sizes="(min-width: 1024px) 22vw, 50vw" alt="An empty wooden handloom in a small room"
            className="aspect-[3/4] w-full rounded-[1.5rem] object-cover" />
          <Pic name="stacks" sizes="(min-width: 1024px) 22vw, 50vw" alt="Shelves stacked with folded printed cloth"
            className="mt-12 aspect-[3/4] w-full rounded-[1.5rem] object-cover" />
          <Pic name="shelves" sizes="(min-width: 1024px) 45vw, 100vw" alt="A wall of folded sarees in every colour, shelf above shelf"
            className="col-span-2 aspect-[16/9] w-full rounded-[1.5rem] object-cover" />
        </div>
      </div>
    </section>
  );
}

function Visit() {
  const today = bengaluruNow().day;
  const days = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday"];
  const idx = [3, 4, 5, 6, 0, 1, 2];
  return (
    <section id="visit" aria-labelledby="visit-title" className="border-t border-line">
      <div className="page grid gap-10 py-20 md:grid-cols-[1.2fr_1fr] md:py-24">
        <div>
          <h2 id="visit-title" className="text-4xl tracking-tight md:text-5xl">11th Main, Jayanagar 4th Block</h2>
          <p className="mt-5 flex items-start gap-3 text-lg"><MapPin size={24} className="mt-1 shrink-0" aria-hidden />
            First floor, above the bangle shops, a short walk from the 4th Block bus stand. Bengaluru 560011.</p>
          <p className="mt-3 flex items-start gap-3 text-lg"><Clock size={24} className="mt-1 shrink-0" aria-hidden />
            10:30am to 8:30pm. Closed on Tuesdays.</p>
        </div>
        <ul className="grid grid-cols-7 gap-1.5 self-end text-center text-sm">
          {days.map((d, i) => (
            <li key={d} className={`rounded-xl px-1 py-3 ${idx[i] === CLOSED_DAY ? "bg-tint text-soft" : idx[i] === today ? "bg-field text-on-field" : "bg-tint"}`}>
              <span className="block font-semibold">{d.slice(0, 3)}</span>
              <span className="block text-xs">{idx[i] === CLOSED_DAY ? "Shut" : "Open"}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-ground">
      <div className="zari" aria-hidden />
      <div className="page grid gap-10 py-16 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="font-display text-6xl tracking-tight md:text-8xl">Navilu</p>
          <p className="mt-4 max-w-[52ch] text-ground/80">
            A demo shop website by Adithya Baliga, Bengaluru: a catalogue the owner updates from a phone, a trial shelf,
            fitting bookings, and every enquiry arriving on the shop's WhatsApp.
          </p>
        </div>
        <div className="text-ground/85">
          <Credits credits={credits} note="Pieces, prices and the address are sample content for this demo. Pieces without a photo are drawn." />
        </div>
      </div>
    </footer>
  );
}
