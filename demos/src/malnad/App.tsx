import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarBlank, Clock, MagnifyingGlass, MapPin, Minus, Pepper, Plus, Users, WhatsappLogo } from "@phosphor-icons/react";
import credits from "../data/credits-restaurant.json";
import { PHONE, addDays, bengaluruNow, clock, niceDate, rupees } from "../shared/site";
import { useJson, type Loaded } from "../shared/useJson";
import { Credits, DemoBar, Field, LoadError, Magnetic, MessagePreview, itemIn, listIn, makePic, spring } from "../shared/ui";

const SHOP = "Malnad Table";
const Pic = makePic("restaurant", credits);

type Category = { id: string; name: string; note: string };
type Dish = { id: string; category: string; name: string; local: string; desc: string; price: number; veg: boolean;
  spice: number; pic?: string };
type Menu = { categories: Category[]; dishes: Dish[] };

// ------------------------------------------------------------------------------------------- hours
const SERVICES = [
  { name: "Breakfast", from: 7 * 60 + 30, to: 11 * 60 },
  { name: "Lunch", from: 12 * 60 + 30, to: 15 * 60 + 30 },
  { name: "Dinner", from: 19 * 60, to: 22 * 60 + 30 },
];
const CLOSED_DAY = 1; // Monday
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayWord(offset: number, day: number) {
  return offset === 0 ? "today" : offset === 1 ? "tomorrow" : DAYS[day];
}

function openStatus(now = bengaluruNow()): { open: boolean; text: string } {
  if (now.day !== CLOSED_DAY) {
    const s = SERVICES.find((s) => now.minutes >= s.from && now.minutes < s.to);
    if (s) return { open: true, text: `Open now, ${s.name.toLowerCase()} until ${clock(s.to)}` };
  }
  for (let d = 0; d < 8; d++) {
    const day = (now.day + d) % 7;
    if (day === CLOSED_DAY) continue;
    const s = SERVICES.find((s) => d > 0 || s.from > now.minutes);
    if (s) return { open: false, text: `Closed now, opens ${dayWord(d, day)} at ${clock(s.from)}` };
  }
  return { open: false, text: "Closed now" };
}

type Slot = { key: string; label: string; minutes: number };

/** Pickup times in 15-minute steps, at least 25 minutes from now, inside service hours. */
function pickupSlots(now = bengaluruNow()): Slot[] {
  const out: Slot[] = [];
  for (let d = 0; d < 3 && out.length < 14; d++) {
    const day = (now.day + d) % 7;
    if (day === CLOSED_DAY) continue;
    for (const s of SERVICES) {
      const earliest = d === 0 ? Math.ceil((now.minutes + 25) / 15) * 15 : s.from;
      for (let t = Math.max(s.from, earliest); t <= s.to - 15 && out.length < 14; t += 15) {
        const word = dayWord(d, day);
        out.push({ key: `${d}-${t}`, minutes: t, label: `${word[0].toUpperCase()}${word.slice(1)}, ${clock(t)}` });
      }
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------- page
export default function App() {
  const [menu, retry] = useJson<Menu>("malnad-menu.json");
  const [leaf, setLeaf] = useState<Record<string, number>>({});
  const dishes = menu.status === "ok" ? menu.data.dishes : [];
  const lines = dishes.filter((d) => leaf[d.id]).map((d) => ({ dish: d, qty: leaf[d.id] }));
  const total = lines.reduce((n, l) => n + l.qty * l.dish.price, 0);
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const change = (id: string, by: number) =>
    setLeaf((cur) => {
      const qty = Math.max(0, Math.min(20, (cur[id] ?? 0) + by));
      const next = { ...cur, [id]: qty };
      if (!qty) delete next[id];
      return next;
    });

  return (
    <div className={count ? "pb-24 lg:pb-0" : ""}>
      <DemoBar shop={SHOP} />
      <Header />
      <main>
        <Hero />
        <section id="order" aria-labelledby="order-title" className="page py-20 md:py-28">
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div>
              <h2 id="order-title" className="text-4xl font-bold tracking-tight md:text-5xl">Build your leaf</h2>
              <p className="mt-4 max-w-[60ch] text-lg text-soft">
                Add dishes and they are served onto the leaf. Pick a time, and the leaf goes to the kitchen as one
                WhatsApp message. Pay at the counter by UPI or cash when you collect.
              </p>
              <MenuList menu={menu} retry={retry} leaf={leaf} change={change} />
            </div>
            <Leaf lines={lines} total={total} count={count} change={change} clear={() => setLeaf({})} />
          </div>
        </section>
        <Direct total={total} />
        <Kitchen />
        <Booking />
        <Visit />
      </main>
      <Footer />
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/95 backdrop-blur lg:hidden">
          <div className="page flex items-center justify-between gap-4 py-3">
            <p className="font-semibold tabular-nums">{count} on your leaf, {rupees(total)}</p>
            <a href="#leaf" className="btn-accent">Review order</a>
          </div>
        </div>
      )}
    </div>
  );
}

function LeafMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M4 27C6 12 16 4 28 4c0 12-8 22-24 23z" fill="currentColor" />
      <path d="M5 26C11 18 17 12 26 6" stroke="rgb(var(--ground))" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Header() {
  const links = [["#order", "Order"], ["#kitchen", "The kitchen"], ["#book", "Book a table"], ["#visit", "Visit"]];
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-ground/85 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
          <LeafMark className="h-7 w-7 text-field" /> {SHOP}
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-7 text-[15px] font-medium">
            {links.map(([href, label]) => (
              <li key={href}><a href={href} className="underline-offset-8 hover:underline">{label}</a></li>
            ))}
          </ul>
        </nav>
        <a href="#order" className="btn-accent md:hidden">Order</a>
      </div>
    </header>
  );
}

function StatusLine({ onField = false }: { onField?: boolean }) {
  const [status, setStatus] = useState(openStatus);
  useEffect(() => {
    const t = setInterval(() => setStatus(openStatus()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="flex items-center gap-2.5 text-[15px] font-medium" aria-live="polite">
      <span className={`h-2.5 w-2.5 rounded-full ${status.open ? `pulse-dot ${onField ? "bg-accent text-accent" : "bg-[#2f7d32] text-[#2f7d32]"}` : "bg-soft"}`} />
      {status.text}
    </p>
  );
}

function Hero() {
  return (
    <section id="top" className="page grid items-center gap-12 pb-16 pt-10 md:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:pb-24">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <StatusLine />
        <h1 className="mt-6 text-5xl font-extrabold leading-[0.95] tracking-tighter md:text-6xl xl:text-7xl">
          Food from the rain hills
        </h1>
        <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-soft md:text-xl">
          Malnad Table is a 40-seat kitchen on 8th Cross, Malleshwaram, cooking the food of Karnataka's Malnad hills
          and its coast. Order for pickup on WhatsApp, or book a table.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Magnetic><a href="#order" className="btn-accent px-7 text-lg">Build your leaf</a></Magnetic>
          <a href="#book" className="btn-line px-6 text-lg">Book a table</a>
        </div>
        <dl className="mt-12 grid max-w-lg grid-cols-2 gap-x-8 gap-y-5 border-t border-line pt-6 text-[15px] sm:grid-cols-3">
          <div><dt className="text-soft">Pickup</dt><dd className="font-semibold">Ready in 25 minutes</dd></div>
          <div><dt className="text-soft">Prices</dt><dd className="font-semibold">Same as the counter</dd></div>
          <div><dt className="text-soft">Closed</dt><dd className="font-semibold">Mondays</dd></div>
        </dl>
      </motion.div>
      <motion.div className="relative" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 0.1 }}>
        <Pic name="leaf-meal" eager sizes="(min-width: 1024px) 50vw, 100vw"
          alt="A Malnad meal served on a banana leaf: rice, palyas, chutney and pickle"
          className="aspect-[5/4] w-full rounded-[2rem] object-cover lg:aspect-[4/5]" />
        <figure className="absolute -bottom-8 left-4 w-[42%] max-w-[230px] rotate-[-3deg] rounded-[1.4rem] bg-ground p-2 shadow-[0_18px_40px_-18px_rgb(var(--ink)/0.5)] md:-left-8">
          <Pic name="akki-rotti" sizes="230px" alt="Akki rotti with butter and chutney on a steel plate"
            className="aspect-square w-full rounded-[1rem] object-cover" />
          <figcaption className="px-1.5 pb-1 pt-2 text-sm font-medium">Akki rotti, {rupees(110)}</figcaption>
        </figure>
      </motion.div>
    </section>
  );
}

// --------------------------------------------------------------------------------------------- menu
function VegMark({ veg }: { veg: boolean }) {
  return (
    <span className={`veg-mark ${veg ? "text-[#2f7d32]" : "nonveg text-[#8a3b12]"}`} role="img"
      aria-label={veg ? "Vegetarian" : "Non-vegetarian"} />
  );
}

function Spice({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-bad" role="img" aria-label={`Spice ${n} of 3`}>
      {Array.from({ length: n }, (_, i) => <Pepper key={i} size={15} weight="fill" aria-hidden />)}
    </span>
  );
}

function Stepper({ dish, qty, change }: { dish: Dish; qty: number; change: (id: string, by: number) => void }) {
  if (!qty) {
    return (
      <button type="button" onClick={() => change(dish.id, 1)} className="btn-line min-h-[40px] px-4 py-1.5 text-[15px]"
        aria-label={`Add ${dish.name} to your leaf`}>
        <Plus size={16} weight="bold" aria-hidden /> Add
      </button>
    );
  }
  return (
    <div className="flex items-center rounded-full bg-field text-on-field">
      <button type="button" onClick={() => change(dish.id, -1)} className="btn h-10 min-h-0 w-10 p-0"
        aria-label={`One less ${dish.name}`}><Minus size={16} weight="bold" aria-hidden /></button>
      <span className="w-6 text-center font-semibold tabular-nums" aria-label={`${qty} on your leaf`}>{qty}</span>
      <button type="button" onClick={() => change(dish.id, 1)} className="btn h-10 min-h-0 w-10 p-0"
        aria-label={`One more ${dish.name}`}><Plus size={16} weight="bold" aria-hidden /></button>
    </div>
  );
}

function MenuList({ menu, retry, leaf, change }:
  { menu: Loaded<Menu>; retry: () => void; leaf: Record<string, number>;
    change: (id: string, by: number) => void }) {
  const [cat, setCat] = useState("all");
  const [vegOnly, setVegOnly] = useState(false);
  const [query, setQuery] = useState("");
  if (menu.status === "loading") {
    return (
      <div className="mt-10 space-y-6" aria-busy="true" aria-label="Loading the menu">
        <div className="flex gap-2">{[88, 120, 110, 130].map((w) => <div key={w} className="skeleton h-10" style={{ width: w }} />)}</div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-4 border-t border-line pt-5">
            <div className="skeleton h-20 w-20 shrink-0" />
            <div className="flex-1 space-y-2.5"><div className="skeleton h-5 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-4 w-2/5" /></div>
          </div>
        ))}
      </div>
    );
  }
  if (menu.status === "error") return <div className="mt-10"><LoadError what="menu" error={menu.error} retry={retry} /></div>;

  const q = query.trim().toLowerCase();
  const shown = menu.data.dishes.filter((d) => (cat === "all" || d.category === cat) && (!vegOnly || d.veg)
    && (!q || `${d.name} ${d.desc}`.toLowerCase().includes(q)));
  const groups = menu.data.categories.map((c) => ({ ...c, dishes: shown.filter((d) => d.category === c.id) }))
    .filter((g) => g.dishes.length);

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Show">
          {[{ id: "all", name: "Everything" }, ...menu.data.categories].map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
              className={`btn min-h-[40px] shrink-0 whitespace-nowrap px-4 py-1.5 text-[15px] ${cat === c.id ? "bg-ink text-ground" : "bg-tint hover:bg-line/60"}`}>
              {c.name}
            </button>
          ))}
        </div>
        <button type="button" role="switch" aria-checked={vegOnly} onClick={() => setVegOnly((v) => !v)}
          className="flex shrink-0 items-center gap-3 text-[15px] font-medium">
          <span className={`relative h-7 w-12 rounded-full transition-colors ${vegOnly ? "bg-[#2f7d32]" : "bg-line"}`}>
            <motion.span layout transition={spring} className={`absolute top-1 h-5 w-5 rounded-full bg-ground shadow ${vegOnly ? "left-6" : "left-1"}`} />
          </span>
          Vegetarian only
        </button>
      </div>
      <div className="relative mt-4">
        <MagnifyingGlass size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-soft" aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-10"
          placeholder="Search dosa, prawn, coffee" aria-label="Search the menu" />
      </div>

      {groups.length === 0 ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-line px-6 py-12 text-center">
          <p className="text-lg font-semibold">Nothing on the menu matches{q ? ` "${query.trim()}"` : ""}.</p>
          <p className="mt-1 text-soft">Try "dosa" or "rice", or show everything again.</p>
          <button type="button" className="btn-ink mt-5" onClick={() => { setCat("all"); setVegOnly(false); setQuery(""); }}>
            Show the whole menu
          </button>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.id} className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-2xl font-bold tracking-tight">{g.name}</h3>
              <p className="text-sm text-soft">{g.note}</p>
            </div>
            <motion.ul className="mt-3" variants={listIn} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }}>
              <AnimatePresence initial={false}>
                {g.dishes.map((d) => (
                  <motion.li key={d.id} layout variants={itemIn} exit={{ opacity: 0 }}
                    className="flex flex-col gap-3 border-t border-line py-5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4">
                    <div className="flex gap-4">
                      {d.pic && (
                        <Pic name={d.pic} sizes="80px" alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover sm:h-20 sm:w-20" />
                      )}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <VegMark veg={d.veg} />
                          <h4 className="text-lg font-semibold leading-snug">{d.name}</h4>
                          <span lang="kn" className="text-sm text-soft">{d.local}</span>
                        </div>
                        <p className="mt-1 max-w-[56ch] text-[15px] leading-relaxed text-soft">{d.desc}</p>
                        <div className="mt-1.5"><Spice n={d.spice} /></div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <p className="text-lg font-semibold tabular-nums">{rupees(d.price)}</p>
                      <Stepper dish={d} qty={leaf[d.id] ?? 0} change={change} />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- leaf
function LeafArt() {
  return (
    <svg viewBox="0 0 400 560" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
      <rect width="400" height="560" fill="#3b7744" />
      <rect x="0" width="30" height="560" fill="#a9cf98" />
      <rect x="30" width="5" height="560" fill="#2c5f35" />
      {Array.from({ length: 30 }, (_, i) => (
        <path key={i} d={`M35 ${i * 20 - 6} C150 ${i * 20 + 2} 280 ${i * 20 + 10} 400 ${i * 20 + 24}`} stroke="#4a8a52" strokeWidth="1.6" fill="none" />
      ))}
    </svg>
  );
}

type Line = { dish: Dish; qty: number };

function Leaf({ lines, total, count, change, clear }:
  { lines: Line[]; total: number; count: number; change: (id: string, by: number) => void; clear: () => void }) {
  const slots = useMemo(() => pickupSlots(), []);
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const chosen = slots.find((s) => s.key === slot);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!count) next.leaf = "Add at least one dish to your leaf first.";
    if (!chosen) next.slot = "Pick a pickup time.";
    else if (lines.some((l) => l.dish.category === "tiffin") && chosen.minutes >= 11 * 60)
      next.slot = "Morning tiffin is made until 11am. Pick a morning time or take the tiffin off your leaf.";
    else if (lines.some((l) => l.dish.category === "meals" || l.dish.category === "coast") && chosen.minutes < 12 * 60 + 30)
      next.slot = "Rice, curries and coast dishes start at 12:30pm. Pick a later time.";
    if (name.trim().length < 2) next.name = "Write the name we should call out at the counter.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 98450 31762.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };

  const message = [
    `Pickup order for ${SHOP}`,
    `Name: ${name.trim()}`,
    `Phone: ${phone.trim()}`,
    `Pickup: ${chosen?.label ?? ""}`,
    "",
    ...lines.map((l) => `${l.qty} x ${l.dish.name}: ${rupees(l.qty * l.dish.price)}`),
    "",
    `Total: ${rupees(total)}, paid at the counter`,
  ].join("\n");

  return (
    <aside id="leaf" aria-labelledby="leaf-title" className="self-start lg:sticky lg:top-24">
      <div className="relative min-h-[300px] overflow-hidden rounded-[2rem] bg-field text-on-field">
        <LeafArt />
        <div className="relative px-6 pb-7 pl-14 pt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="leaf-title" className="text-2xl font-bold">Your leaf</h3>
            {count > 0 && <button type="button" onClick={clear} className="text-sm underline underline-offset-4">Clear</button>}
          </div>
          <p className="mt-0.5 text-sm text-on-field/85" aria-live="polite">
            {count ? `${count} ${count === 1 ? "dish" : "dishes"}, ${rupees(total)}` : "Nothing served yet"}
          </p>
          {count === 0 ? (
            <div className="mt-8 max-w-[22ch] text-on-field/90">
              <p className="text-lg font-semibold leading-snug">An empty leaf.</p>
              <p className="mt-1.5 text-[15px]">Add a neer dosa or a full Malnad oota from the menu and it lands here.</p>
            </div>
          ) : (
            <ul className="mt-5 flex flex-wrap gap-2.5">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.li key={l.dish.id} layout initial={{ opacity: 0, scale: 0.6, y: -12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={spring}
                    className="flex items-center gap-1.5 rounded-full bg-ground py-1 pl-3.5 pr-1 text-[15px] font-medium text-ink shadow-[0_6px_14px_-8px_rgb(0_0_0/0.5)]">
                    {l.dish.name}
                    <span className="tabular-nums text-soft">x{l.qty}</span>
                    <button type="button" onClick={() => change(l.dish.id, -l.qty)} aria-label={`Take ${l.dish.name} off your leaf`}
                      className="btn h-8 min-h-0 w-8 p-0 hover:bg-ink/10"><Minus size={14} weight="bold" aria-hidden /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        {errors.leaf && <p role="alert" className="text-sm font-medium text-bad">{errors.leaf}</p>}
        <Field label="Pickup time" error={errors.slot} hint="Ready 25 minutes after you order, during service hours.">
          {(a) => (
            <select {...a} className="input" value={slot} onChange={(e) => setSlot(e.target.value)}>
              <option value="">Choose a time</option>
              {slots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Field label="Your name" error={errors.name}>
            {(a) => <input {...a} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
          </Field>
          <Field label="Mobile number" error={errors.phone}>
            {(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}
          </Field>
        </div>
        <button type="submit" className="btn-accent w-full text-lg">
          <WhatsappLogo size={20} weight="bold" aria-hidden /> Send the leaf on WhatsApp{count ? `, ${rupees(total)}` : ""}
        </button>
      </form>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your order is ready to send" message={message} shop={SHOP} />
    </aside>
  );
}

// -------------------------------------------------------------------------------------------- direct
function Direct({ total }: { total: number }) {
  const bill = total || 500;
  const cut = Math.round(bill * 0.25);
  return (
    <section aria-labelledby="direct-title" className="bg-field text-on-field">
      <div className="page grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 id="direct-title" className="text-4xl font-bold tracking-tight md:text-5xl">Counter prices, every time</h2>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-on-field/90">
            Delivery apps take up to a quarter of every bill from the kitchen, so dishes there cost more. Order here and
            collect it yourself: you pay the counter price, and all of it stays in the kitchen that cooked it.
          </p>
          <p className="mt-4 max-w-[52ch] text-on-field/80">
            Prefer the apps? We're on them too, at their prices. Regulars mostly order here.
          </p>
        </div>
        <figure className="mx-auto w-full max-w-sm rotate-[1.5deg] rounded-[0.5rem] bg-ground px-7 py-8 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
          <figcaption className="text-center">
            <span className="block text-lg font-bold">{SHOP}</span>
            <span className="block text-sm text-soft">{total ? "Your leaf, two ways" : "A ₹500 order, two ways"}</span>
          </figcaption>
          <dl className="mt-6 space-y-2 border-t border-dashed border-ink/30 pt-5 text-[15px] tabular-nums">
            <div className="flex justify-between"><dt>Food</dt><dd>{rupees(bill)}</dd></div>
            <div className="flex justify-between text-soft"><dt>App commission (25%)</dt><dd>-{rupees(cut)}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Kitchen keeps, app order</dt><dd>{rupees(bill - cut)}</dd></div>
          </dl>
          <dl className="mt-5 space-y-2 border-t border-dashed border-ink/30 pt-5 text-[15px] tabular-nums">
            <div className="flex justify-between"><dt>Food</dt><dd>{rupees(bill)}</dd></div>
            <div className="flex justify-between text-soft"><dt>Commission</dt><dd>{rupees(0)}</dd></div>
            <div className="flex justify-between text-lg font-bold"><dt>Kitchen keeps, ordered here</dt><dd>{rupees(bill)}</dd></div>
          </dl>
        </figure>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------- kitchen
function Kitchen() {
  return (
    <section id="kitchen" aria-labelledby="kitchen-title" className="page py-20 md:py-28">
      <h2 id="kitchen-title" className="max-w-[18ch] text-4xl font-bold tracking-tight md:text-5xl">
        Cooked the slow way, in small batches
      </h2>
      <div className="mt-14 grid items-center gap-10 md:grid-cols-[1.15fr_1fr] md:gap-16">
        <Pic name="meal-top" sizes="(min-width: 768px) 55vw, 100vw" alt="Rice, payasa and palya served on a banana leaf"
          className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
        <div>
          <h3 className="text-2xl font-bold tracking-tight md:text-3xl">The leaf meal changes every day</h3>
          <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-soft">
            Two palyas from whatever came in that morning, a saaru, a huli, kosambari, happala and a small payasa.
            Rice is red matta from Sagar, and you get one refill. Eat with your hand if you like; we fold the leaf
            when you're done.
          </p>
        </div>
      </div>
      <div className="mt-16 grid items-center gap-10 md:mt-24 md:grid-cols-[1fr_0.7fr] md:gap-16">
        <div className="md:order-2">
          <Pic name="neer-dosa" sizes="(min-width: 768px) 35vw, 100vw" alt="Thin rice batter poured onto a black iron pan"
            className="aspect-[4/5] w-full rounded-[2rem] object-cover md:aspect-[3/4]" />
        </div>
        <div className="md:order-1 md:pl-[8vw]">
          <h3 className="text-2xl font-bold tracking-tight md:text-3xl">Batter ground at six every morning</h3>
          <p className="mt-4 max-w-[48ch] text-lg leading-relaxed text-soft">
            Neer dosa means water dosa. The rice soaks overnight, is ground at six, and is poured so thin you can see
            the pan through it. When the morning's batter runs out, so does the neer dosa, usually by half past ten.
          </p>
          <ul className="mt-8 divide-y divide-line border-y border-line text-[15px]">
            <li className="flex justify-between py-3"><span>Akki rotti, made to order</span><span className="font-semibold">12 min</span></li>
            <li className="flex justify-between py-3"><span>Kori rotti curry, simmered</span><span className="font-semibold">3 hours</span></li>
            <li className="flex justify-between py-3"><span>Pandi curry, rested overnight</span><span className="font-semibold">1 day</span></li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------- booking
function bookingDays(): string[] {
  const now = bengaluruNow();
  const out: string[] = [];
  for (let i = 0; out.length < 10; i++) {
    const iso = addDays(now.date, i);
    if (new Date(iso + "T00:00:00Z").getUTCDay() !== CLOSED_DAY) out.push(iso);
  }
  return out;
}

function bookingTimes(iso: string): number[] {
  const now = bengaluruNow();
  const times: number[] = [];
  for (const s of SERVICES.slice(1)) for (let t = s.from; t <= s.to - 45; t += 30) times.push(t);
  return iso === now.date ? times.filter((t) => t > now.minutes + 60) : times;
}

function Booking() {
  const days = useMemo(bookingDays, []);
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<number | "">("");
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const times = bookingTimes(day);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (time === "" || !times.includes(time)) next.time = times.length ? "Pick a time." : "No tables left today. Pick another day.";
    if (name.trim().length < 2) next.name = "Write the name for the booking.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 98450 31762.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  const message = [`Table booking at ${SHOP}`, `${niceDate(day)}, ${time === "" ? "" : clock(time)}`,
    `${guests} ${guests === 1 ? "guest" : "guests"}`, `Name: ${name.trim()}`, `Phone: ${phone.trim()}`,
    ...(note.trim() ? [`Note: ${note.trim()}`] : [])].join("\n");

  return (
    <section id="book" aria-labelledby="book-title" className="bg-tint">
      <div className="page grid gap-12 py-20 md:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <h2 id="book-title" className="text-4xl font-bold tracking-tight md:text-5xl">Book a table</h2>
          <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-soft">
            40 seats downstairs and 16 upstairs for families and small parties. We hold a booking for 15 minutes, then
            give the table to the queue.
          </p>
          <ul className="mt-8 space-y-3 text-[15px]">
            <li className="flex items-center gap-3"><Clock size={20} aria-hidden /> Lunch 12:30 to 3:30, dinner 7 to 10:30</li>
            <li className="flex items-center gap-3"><Users size={20} aria-hidden /> Up to 12 at one table; more, message us</li>
            <li className="flex items-center gap-3"><CalendarBlank size={20} aria-hidden /> Closed on Mondays</li>
          </ul>
        </div>
        <form onSubmit={submit} noValidate className="min-w-0 rounded-[2rem] bg-ground p-6 shadow-[0_20px_50px_-30px_rgb(var(--ink)/0.45)] md:p-9">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Day</legend>
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-2">
              {days.map((d) => {
                const [wd, dd, mm] = niceDate(d).split(" ");
                return (
                  <button key={d} type="button" aria-pressed={day === d} onClick={() => { setDay(d); setTime(""); }}
                    className={`btn min-h-[64px] shrink-0 flex-col gap-0 rounded-2xl px-3.5 py-2 leading-tight ${day === d ? "bg-field text-on-field" : "bg-tint hover:bg-line/60"}`}>
                    <span className="text-xs">{wd.replace(",", "")}</span>
                    <span className="text-lg font-bold tabular-nums">{dd}</span>
                    <span className="text-xs">{mm}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Time" error={errors.time}>
              {(a) => (
                <select {...a} className="input" value={time} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">{times.length ? "Choose a time" : "Fully booked"}</option>
                  {times.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
                </select>
              )}
            </Field>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium" id="guests-label">Guests</span>
              <div className="flex items-center justify-between rounded-xl border border-line px-1.5" role="group" aria-labelledby="guests-label">
                <button type="button" className="btn h-10 min-h-0 w-10 p-0 hover:bg-ink/5" aria-label="One guest fewer"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))} disabled={guests <= 1}><Minus size={16} weight="bold" aria-hidden /></button>
                <span className="font-semibold tabular-nums" aria-live="polite">{guests} {guests === 1 ? "guest" : "guests"}</span>
                <button type="button" className="btn h-10 min-h-0 w-10 p-0 hover:bg-ink/5" aria-label="One guest more"
                  onClick={() => setGuests((g) => Math.min(12, g + 1))} disabled={guests >= 12}><Plus size={16} weight="bold" aria-hidden /></button>
              </div>
            </div>
            <Field label="Name" error={errors.name}>
              {(a) => <input {...a} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
            </Field>
            <Field label="Mobile number" error={errors.phone}>
              {(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}
            </Field>
            <Field label="Anything we should know?" hint="Optional: a birthday, a high chair, no onion or garlic." className="sm:col-span-2">
              {(a) => <textarea {...a} rows={2} className="input resize-y" value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </div>
          <button type="submit" className="btn-ink mt-7 w-full text-lg sm:w-auto sm:px-8">
            <WhatsappLogo size={20} weight="bold" aria-hidden /> Request the table
          </button>
        </form>
      </div>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your booking request is ready" message={message} shop={SHOP} />
    </section>
  );
}

// --------------------------------------------------------------------------------------------- visit
function Visit() {
  const today = bengaluruNow().day;
  const order = [2, 3, 4, 5, 6, 0, 1];
  return (
    <section id="visit" aria-labelledby="visit-title" className="page grid gap-12 py-20 md:grid-cols-[1fr_1.1fr] md:py-28 lg:gap-20">
      <div>
        <h2 id="visit-title" className="text-4xl font-bold tracking-tight md:text-5xl">On 8th Cross, Malleshwaram</h2>
        <p className="mt-5 flex items-start gap-3 text-lg">
          <MapPin size={24} className="mt-1 shrink-0" aria-hidden />
          <span>8th Cross, between Sampige Road and Margosa Road, Malleshwaram, Bengaluru 560003</span>
        </p>
        <p className="mt-3 max-w-[46ch] text-soft">Four minutes' walk from Sampige Road metro. Two-wheeler parking in front; cars on Margosa Road.</p>
        <div className="mt-8"><StatusLine /></div>
        <table className="mt-5 w-full max-w-md text-[15px]">
          <caption className="sr-only">Opening hours</caption>
          <tbody className="divide-y divide-line border-y border-line">
            {order.map((d) => (
              <tr key={d} className={d === today ? "font-semibold" : ""}>
                <th scope="row" className="py-2.5 text-left font-[inherit]">{DAYS[d]}{d === today && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-on-accent">Today</span>}</th>
                <td className="py-2.5 text-right tabular-nums">{d === CLOSED_DAY ? "Closed" : "7:30-11am, 12:30-3:30pm, 7-10:30pm"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figure className="overflow-hidden rounded-[2rem] bg-tint">
        <svg viewBox="0 0 600 480" role="img" aria-labelledby="map-title" className="h-full w-full">
          <title id="map-title">Sketch map: Malnad Table is on 8th Cross between Sampige Road and Margosa Road</title>
          <rect width="600" height="480" fill="rgb(var(--tint))" />
          {[60, 150, 240, 330, 420].map((y) => <rect key={y} x="0" y={y} width="600" height="10" fill="rgb(var(--ground))" />)}
          <rect x="150" y="0" width="34" height="480" fill="rgb(var(--ground))" />
          <rect x="420" y="0" width="34" height="480" fill="rgb(var(--ground))" />
          <rect x="248" y="250" width="70" height="44" fill="rgb(var(--line))" />
          <text x="167" y="470" transform="rotate(-90 167 470)" fontSize="15" fill="rgb(var(--soft))" fontFamily="var(--font-body)">Sampige Road</text>
          <text x="437" y="470" transform="rotate(-90 437 470)" fontSize="15" fill="rgb(var(--soft))" fontFamily="var(--font-body)">Margosa Road</text>
          <text x="200" y="232" fontSize="15" fill="rgb(var(--soft))" fontFamily="var(--font-body)">8th Cross</text>
          <circle cx="167" cy="110" r="14" fill="rgb(var(--ink))" />
          <text x="190" y="115" fontSize="14" fill="rgb(var(--ink))" fontFamily="var(--font-body)">Sampige Road metro</text>
          <g transform="translate(300 245)">
            <circle r="30" fill="rgb(var(--accent) / 0.25)" className="origin-center animate-ping [animation-duration:2.4s]" />
            <circle r="16" fill="rgb(var(--field))" />
            <path d="M-6 6C-5 -2 0 -7 7 -7c0 7-5 12-13 13z" fill="rgb(var(--on-field))" />
          </g>
          <text x="330" y="280" fontSize="17" fontWeight="700" fill="rgb(var(--ink))" fontFamily="var(--font-body)">Malnad Table</text>
        </svg>
      </figure>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-ground">
      <div className="page grid gap-10 py-16 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="flex items-center gap-3 text-4xl font-extrabold tracking-tighter md:text-6xl">
            <LeafMark className="h-10 w-10 text-accent md:h-14 md:w-14" /> {SHOP}
          </p>
          <p className="mt-4 max-w-[52ch] text-ground/80">
            A demo restaurant website by Adithya Baliga, Bengaluru. Menu, pickup orders, table bookings and opening
            hours, on the owner's own domain, with orders arriving on the owner's WhatsApp and no commission.
          </p>
        </div>
        <div className="space-y-5 text-ground/85">
          <Credits credits={credits} note="Dishes, prices and the address are sample content for this demo." />
        </div>
      </div>
    </footer>
  );
}
