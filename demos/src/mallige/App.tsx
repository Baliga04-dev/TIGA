import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clock, MapPin, Plus, Check, Scissors, Sparkle, Drop, WhatsappLogo, X } from "@phosphor-icons/react";
import credits from "../data/credits-salon.json";
import { PHONE, bengaluruNow, clock, niceDate, openDays, rupees } from "../shared/site";
import { useJson, type Loaded } from "../shared/useJson";
import { Credits, DayChips, DemoBar, Field, LoadError, Magnetic, MessagePreview, itemIn, listIn, makePic, spring } from "../shared/ui";

const SHOP = "Mallige";
const Pic = makePic("salon", credits);
const OPEN = 10 * 60, CLOSE = 20 * 60 + 30, STEP = 15;
const CLOSED_DAY = 2; // Tuesday
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Group = { id: string; name: string };
type Service = { id: string; group: string; name: string; minutes: number; price: number; note: string };
type Stylist = { id: string; name: string; years: number; known_for: string; does: string[]; off: number[] };
type Menu = { groups: Group[]; services: Service[]; stylists: Stylist[] };

// ------------------------------------------------------------------------------------- the day's diary
/** A small stable hash, so each stylist's bookings for a date look the same on every visit to the page. */
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Appointments already in a stylist's diary for that date (made up for the demo, but stable). */
function booked(stylist: string, iso: string): [number, number][] {
  const seed = hash(stylist + iso);
  const count = 2 + (seed % 3);
  const blocks: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const h = hash(`${seed}-${i}`);
    const start = OPEN + (h % ((CLOSE - OPEN) / STEP - 6)) * STEP;
    blocks.push([start, start + [30, 45, 60, 90][(h >> 4) % 4]]);
  }
  return blocks.sort((a, b) => a[0] - b[0]);
}

function weekday(iso: string) {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

/** Start times when this stylist is free for the whole visit. */
function freeStarts(stylist: Stylist, iso: string, minutes: number): number[] {
  if (stylist.off.includes(weekday(iso))) return [];
  const now = bengaluruNow();
  const earliest = iso === now.date ? Math.ceil((now.minutes + 30) / STEP) * STEP : OPEN;
  const blocks = booked(stylist.id, iso);
  const out: number[] = [];
  for (let t = Math.max(OPEN, earliest); t + minutes <= CLOSE; t += STEP) {
    if (!blocks.some(([a, b]) => t < b && t + minutes > a)) out.push(t);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ page
export default function App() {
  const [menu, retry] = useJson<Menu>("mallige-services.json");
  const [chosen, setChosen] = useState<string[]>([]);
  const services = menu.status === "ok" ? menu.data.services : [];
  const picked = chosen.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => Boolean(s));
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <div>
      <DemoBar shop={SHOP} />
      <Header />
      <main>
        <Hero />
        <Prices menu={menu} retry={retry} chosen={chosen} toggle={toggle} picked={picked} />
        <Booking menu={menu} picked={picked} remove={toggle} />
        <Stylists menu={menu} />
        <Care />
        <Bridal />
        <Visit />
      </main>
      <Footer />
    </div>
  );
}

function Flower({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="16" cy="8.5" rx="3.6" ry="6.5" fill="currentColor" transform={`rotate(${r} 16 16)`} />)}
      <circle cx="16" cy="16" r="2.6" fill="rgb(var(--accent))" />
    </svg>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2 font-display text-[1.7rem] italic leading-none">
          <Flower className="h-7 w-7 text-field" /> Mallige
        </a>
        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-7 text-[15px]">
            {[["#prices", "Prices"], ["#book", "Book"], ["#stylists", "Stylists"], ["#bridal", "Bridal"], ["#visit", "Visit"]].map(([h, l]) => (
              <li key={h}><a href={h} className="underline-offset-8 hover:underline">{l}</a></li>
            ))}
          </ul>
        </nav>
        <a href="#prices" className="btn-accent min-h-[40px] shrink-0 whitespace-nowrap px-4 py-1.5">Book a slot</a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="page grid items-center gap-10 pb-16 pt-10 md:pt-14 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:pb-24">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <p className="text-[15px] text-soft">100 Feet Road, Indiranagar. 10am to 8:30pm, closed Tuesdays.</p>
        <h1 className="mt-5 text-5xl leading-[1.02] md:text-7xl">Book the chair, not the queue</h1>
        <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-soft md:text-xl">
          Mallige is a unisex salon in Indiranagar: cuts, colour, threading and brides, by appointment. Pick what you
          want, see how long it takes, and take a time your stylist is actually free.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Magnetic><a href="#prices" className="btn-accent px-7 text-lg">Choose your services</a></Magnetic>
          <a href="#stylists" className="btn-line px-6 text-lg">Meet the stylists</a>
        </div>
      </motion.div>
      <motion.div className="grid grid-cols-[1fr_0.42fr] gap-4" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 0.1 }}>
        <Pic name="salon-floor" eager sizes="(min-width: 1024px) 40vw, 70vw" alt="A bright salon with styling chairs, mirrors and a wooden floor"
          className="aspect-[4/5] w-full rounded-[1.75rem] object-cover" />
        <div className="flex flex-col gap-4 pt-10">
          <Pic name="jasmine" sizes="(min-width: 1024px) 16vw, 30vw" alt="Strings of white jasmine buds hanging in a flower stall"
            className="aspect-[3/5] w-full rounded-full object-cover" />
          <p className="text-sm leading-snug text-soft">Mallige: jasmine, sold by the arm's length on every Bengaluru market street.</p>
        </div>
      </motion.div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------- prices
function Prices({ menu, retry, chosen, toggle, picked }:
  { menu: Loaded<Menu>; retry: () => void; chosen: string[]; toggle: (id: string) => void; picked: Service[] }) {
  const [group, setGroup] = useState("women");
  const minutes = picked.reduce((n, s) => n + s.minutes, 0);
  const total = picked.reduce((n, s) => n + s.price, 0);
  return (
    <section id="prices" aria-labelledby="prices-title" className="bg-tint">
      <div className="page grid gap-10 py-20 md:py-24 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <div>
          <h2 id="prices-title" className="text-4xl md:text-6xl">Prices, and how long each takes</h2>
          <p className="mt-4 max-w-[56ch] text-lg text-soft">Add what you want; the time adds up as you go. Prices include GST.</p>
          {menu.status === "loading" && (
            <div className="mt-8 space-y-3" aria-busy="true" aria-label="Loading prices">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-16" />)}
            </div>
          )}
          {menu.status === "error" && <div className="mt-8"><LoadError what="price list" error={menu.error} retry={retry} /></div>}
          {menu.status === "ok" && (
            <>
              <div className="mt-8 flex gap-2" role="group" aria-label="Show prices for">
                {menu.data.groups.map((g) => (
                  <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}
                    className={`btn min-h-[40px] px-5 py-1.5 ${group === g.id ? "bg-field text-on-field" : "bg-ground hover:bg-line/60"}`}>{g.name}</button>
                ))}
              </div>
              <motion.ul key={group} className="mt-6 divide-y divide-line border-y border-line bg-ground/60" variants={listIn} initial="hidden" animate="show">
                {menu.data.services.filter((s) => s.group === group).map((s) => {
                  const on = chosen.includes(s.id);
                  return (
                    <motion.li key={s.id} variants={itemIn} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-4">
                      <div className="min-w-0">
                        <p className="font-medium">{s.name}</p>
                        {s.note && <p className="text-sm text-soft">{s.note}</p>}
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="hidden text-right text-sm tabular-nums text-soft sm:block">{s.minutes} min</p>
                        <p className="w-16 text-right font-semibold tabular-nums">{rupees(s.price)}</p>
                        <button type="button" aria-pressed={on} onClick={() => toggle(s.id)} aria-label={`${on ? "Remove" : "Add"} ${s.name}`}
                          className={`btn h-10 min-h-0 w-10 p-0 ${on ? "bg-accent text-on-accent" : "border border-line hover:border-ink/40"}`}>
                          {on ? <Check size={18} weight="bold" aria-hidden /> : <Plus size={18} weight="bold" aria-hidden />}
                        </button>
                      </div>
                      <p className="col-span-2 text-sm tabular-nums text-soft sm:hidden">{s.minutes} min</p>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </>
          )}
        </div>
        <aside aria-labelledby="visit-title" className="self-start rounded-[1.75rem] bg-field p-6 text-on-field lg:sticky lg:top-24">
          <h3 id="visit-title" className="font-display text-3xl italic">Your visit</h3>
          {picked.length === 0 ? (
            <p className="mt-3 text-on-field/85">Nothing added yet. Press + next to anything on the list.</p>
          ) : (
            <>
              <ul className="mt-4 space-y-2 text-[15px]">
                <AnimatePresence initial={false}>
                  {picked.map((s) => (
                    <motion.li key={s.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}
                      className="flex items-center justify-between gap-3">
                      <span>{s.name}</span>
                      <button type="button" onClick={() => toggle(s.id)} aria-label={`Remove ${s.name}`} className="btn h-8 min-h-0 w-8 p-0 hover:bg-on-field/10"><X size={14} aria-hidden /></button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <p className="mt-4 border-t border-on-field/20 pt-4 text-lg" aria-live="polite">
                <span className="font-semibold tabular-nums">{rupees(total)}</span>, about <span className="tabular-nums">{minutes}</span> minutes in the chair
              </p>
              <a href="#book" className="btn-accent mt-5 w-full">Choose a time</a>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------------------- the booking
/** The visit drawn as a string of jasmine: one flower per service, sized by how long it takes. */
function JasmineThread({ picked, start }: { picked: Service[]; start: number | null }) {
  const minutes = picked.reduce((n, s) => n + s.minutes, 0);
  if (!minutes) return null;
  let at = 0;
  return (
    <figure className="mt-6">
      <svg viewBox="0 0 600 70" role="img" className="w-full" aria-label={`Your visit: ${picked.map((s) => `${s.name}, ${s.minutes} minutes`).join("; ")}`}>
        <line x1="8" x2="592" y1="30" y2="30" stroke="rgb(var(--accent))" strokeWidth="2" strokeDasharray="2 5" />
        {picked.map((s) => {
          const x = 8 + (at / minutes) * 584, w = (s.minutes / minutes) * 584;
          at += s.minutes;
          return (
            <g key={s.id}>
              <rect x={x + 2} y="18" width={Math.max(w - 4, 6)} height="24" rx="12" fill="rgb(var(--tint))" stroke="rgb(var(--field))" strokeWidth="1.5" />
              <circle cx={x + 14} cy="30" r="5" fill="rgb(var(--ground))" stroke="rgb(var(--accent))" strokeWidth="2" />
              {w > 110 && (
                <text x={x + 26} y="34.5" fontSize="12" fill="rgb(var(--ink))" fontFamily="var(--font-body)">
                  {s.name.length > Math.floor((w - 34) / 6.4) ? s.name.slice(0, Math.max(3, Math.floor((w - 34) / 6.4) - 1)) + "…" : s.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-sm tabular-nums text-soft">
        <span>{start === null ? "Start" : clock(start)}</span><span>{minutes} min</span><span>{start === null ? "Finish" : clock(start + minutes)}</span>
      </figcaption>
    </figure>
  );
}

function Booking({ menu, picked, remove }: { menu: Loaded<Menu>; picked: Service[]; remove: (id: string) => void }) {
  const days = useMemo(() => openDays(CLOSED_DAY, 10), []);
  const [day, setDay] = useState(days[0]);
  const [who, setWho] = useState("anyone");
  const [time, setTime] = useState<{ start: number; stylist: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const minutes = picked.reduce((n, s) => n + s.minutes, 0);
  const total = picked.reduce((n, s) => n + s.price, 0);
  const stylists = menu.status === "ok" ? menu.data.stylists : [];
  const groups = new Set(picked.map((s) => s.group));
  const able = stylists.filter((st) => [...groups].every((g) => st.does.includes(g)));
  const pool = who === "anyone" ? able : able.filter((st) => st.id === who);
  const starts = useMemo(() => {
    const map = new Map<number, string>();
    if (!minutes) return map;
    for (const st of pool) for (const t of freeStarts(st, day, minutes)) if (!map.has(t)) map.set(t, st.id);
    return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
  }, [pool, day, minutes]);
  const nameOf = (id: string) => stylists.find((s) => s.id === id)?.name ?? "";
  const periods: [string, (t: number) => boolean][] = [["Morning", (t) => t < 12 * 60], ["Afternoon", (t) => t >= 12 * 60 && t < 16 * 60], ["Evening", (t) => t >= 16 * 60]];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!picked.length) next.services = "Add at least one service from the price list.";
    if (!time) next.time = "Pick a start time.";
    if (name.trim().length < 2) next.name = "Write your name.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 99001 73524.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  const message = time ? [`Booking request, ${SHOP}`, `${niceDate(day)}, ${clock(time.start)} to ${clock(time.start + minutes)} with ${nameOf(time.stylist)}`,
    ...picked.map((s) => `- ${s.name} (${s.minutes} min, ${rupees(s.price)})`), `Total ${rupees(total)}`, `${name.trim()}, ${phone.trim()}`].join("\n") : "";

  return (
    <section id="book" aria-labelledby="book-title" className="page py-20 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <h2 id="book-title" className="text-4xl md:text-6xl">Pick a time they're free</h2>
          <p className="mt-4 max-w-[46ch] text-lg text-soft">
            Only times when your stylist has the whole {minutes ? `${minutes} minutes` : "visit"} free are shown, so nobody
            waits and nobody rushes.
          </p>
          {picked.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-line p-5 text-[15px]">Choose services in <a href="#prices" className="underline underline-offset-4">the price list</a> first.</p>
          ) : (
            <>
              <ul className="mt-6 flex flex-wrap gap-2">
                {picked.map((s) => (
                  <li key={s.id} className="flex items-center gap-1 rounded-full bg-tint py-1 pl-3 pr-1 text-sm">
                    {s.name}
                    <button type="button" onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`} className="btn h-7 min-h-0 w-7 p-0 hover:bg-ink/10"><X size={12} aria-hidden /></button>
                  </li>
                ))}
              </ul>
              <JasmineThread picked={picked} start={time?.start ?? null} />
            </>
          )}
          {errors.services && <p role="alert" className="mt-3 text-sm font-medium text-bad">{errors.services}</p>}
        </div>

        <form onSubmit={submit} noValidate className="min-w-0 space-y-6 self-start">
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Stylist</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[{ id: "anyone", label: "Anyone free" }, ...able.map((s) => ({ id: s.id, label: s.name }))].map((o) => (
                <button key={o.id} type="button" aria-pressed={who === o.id} onClick={() => { setWho(o.id); setTime(null); }}
                  className={`btn min-h-[40px] px-4 py-1.5 ${who === o.id ? "bg-field text-on-field" : "border border-line hover:border-ink/40"}`}>{o.label}</button>
              ))}
            </div>
            {picked.length > 0 && able.length === 0 && (
              <p className="mt-2 text-sm font-medium text-bad">Nobody does all of these in one visit. Book men's and women's services separately.</p>
            )}
          </fieldset>
          <DayChips days={days} value={day} onChange={(d) => { setDay(d); setTime(null); }} activeClass="bg-field text-on-field" idleClass="bg-tint hover:bg-line" />
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Start time</legend>
            {!minutes ? <p className="mt-2 text-sm text-soft">Times appear once you've chosen services.</p>
              : starts.size === 0 ? (
                <p className="mt-2 rounded-xl bg-tint p-4 text-[15px]">
                  {who !== "anyone" && stylists.find((s) => s.id === who)?.off.includes(weekday(day))
                    ? `${nameOf(who)} is off on ${WEEKDAYS[weekday(day)]}s.` : `No ${minutes}-minute gap left on ${niceDate(day)}.`} Try another day{who !== "anyone" ? ", or Anyone free" : ""}.
                </p>
              ) : periods.map(([label, fits]) => {
                const list = [...starts.entries()].filter(([t]) => fits(t));
                if (!list.length) return null;
                return (
                  <div key={label} className="mt-3">
                    <p className="text-xs text-soft">{label}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {list.map(([t, st]) => (
                        <button key={t} type="button" aria-pressed={time?.start === t} onClick={() => setTime({ start: t, stylist: st })}
                          aria-label={`${clock(t)} with ${nameOf(st)}`}
                          className={`btn min-h-[40px] px-3 py-1.5 text-[15px] tabular-nums ${time?.start === t ? "bg-accent text-on-accent" : "border border-line hover:border-ink/40"}`}>{clock(t)}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            {errors.time && <p role="alert" className="mt-2 text-sm font-medium text-bad">{errors.time}</p>}
          </fieldset>
          {time && <p className="text-[15px]" aria-live="polite">{niceDate(day)}, {clock(time.start)} to {clock(time.start + minutes)} with {nameOf(time.stylist)}. {rupees(total)}.</p>}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name" error={errors.name}>{(a) => <input {...a} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}</Field>
            <Field label="Mobile number" error={errors.phone}>{(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}</Field>
          </div>
          <button type="submit" className="btn-accent w-full text-lg sm:w-auto sm:px-8"><WhatsappLogo size={20} weight="bold" aria-hidden /> Request this slot</button>
        </form>
      </div>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your booking request is ready" message={message} shop={SHOP} />
    </section>
  );
}

// ------------------------------------------------------------------------------------------ the rest
function Stylists({ menu }: { menu: Loaded<Menu> }) {
  return (
    <section id="stylists" aria-labelledby="stylists-title" className="bg-field text-on-field">
      <div className="page py-20 md:py-24">
        <h2 id="stylists-title" className="max-w-[16ch] text-4xl md:text-6xl">Three people, and they don't rush</h2>
        {menu.status === "ok" ? (
          <ul className="mt-12 divide-y divide-on-field/20 border-y border-on-field/20">
            {menu.data.stylists.map((s) => (
              <li key={s.id} className="grid gap-x-10 gap-y-2 py-7 md:grid-cols-[14rem_minmax(0,1fr)_auto] md:items-baseline">
                <h3 className="flex items-center gap-3 font-display text-3xl italic"><Flower className="h-6 w-6 text-on-field" /> {s.name}</h3>
                <p className="max-w-[56ch] text-lg leading-relaxed text-on-field/85">{s.known_for}</p>
                <p className="text-sm text-on-field/75">{s.years} years. Off on {s.off.map((d) => WEEKDAYS[d]).join(", ")}s.</p>
              </li>
            ))}
          </ul>
        ) : <div className="mt-12 h-40 rounded-2xl bg-on-field/10" aria-hidden />}
      </div>
    </section>
  );
}

const CARE = [
  [Scissors, "Tools cleaned after every client", "Combs and scissors go into disinfectant between chairs; clippers are wiped and oiled."],
  [Drop, "Fresh towels, every time", "A clean towel and cape for each client, washed on site every day."],
  [Sparkle, "Single-use where it touches skin", "Blades, wax strips, spatulas and threading thread are used once and thrown away."],
] as const;

function Care() {
  return (
    <section aria-labelledby="care-title" className="page grid items-center gap-12 py-20 md:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
      <div>
        <h2 id="care-title" className="text-4xl md:text-6xl">Clean, and you can watch us do it</h2>
        <ul className="mt-10 space-y-8">
          {CARE.map(([Icon, title, text]) => (
            <li key={title} className="grid grid-cols-[auto_1fr] gap-5">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-line"><Icon size={22} aria-hidden /></span>
              <div><h3 className="text-xl font-medium">{title}</h3><p className="mt-1 max-w-[50ch] text-[17px] leading-relaxed text-soft">{text}</p></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Pic name="shears" sizes="(min-width: 1024px) 22vw, 50vw" alt="The blades of a pair of steel hair-cutting shears, close up"
          className="aspect-square w-full rounded-[1.5rem] object-cover" />
        <Pic name="basin" sizes="(min-width: 1024px) 22vw, 50vw" alt="A black wash basin and chair in a salon"
          className="mt-12 aspect-square w-full rounded-[1.5rem] object-cover" />
      </div>
    </section>
  );
}

function Bridal() {
  return (
    <section id="bridal" aria-labelledby="bridal-title" className="bg-tint">
      <div className="page grid items-center gap-12 py-20 md:py-24 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid grid-cols-2 gap-4">
          <Pic name="jasmine-hair" sizes="(min-width: 1024px) 22vw, 50vw" alt="Long hair, seen from behind, with a string of jasmine and a rose pinned in"
            className="aspect-[3/4] w-full rounded-[1.5rem] object-cover" />
          <Pic name="mehndi" sizes="(min-width: 1024px) 22vw, 50vw" alt="Fine henna patterns on the back of a hand"
            className="mt-14 aspect-[3/4] w-full rounded-[1.5rem] object-cover" />
        </div>
        <div>
          <h2 id="bridal-title" className="text-4xl md:text-6xl">For the wedding</h2>
          <p className="mt-5 max-w-[50ch] text-lg leading-relaxed text-soft">
            A trial three weeks before, mehndi the evening before, and on the day, hair, make-up and draping in your style,
            Mysore, Coorg or Nivi. The jasmine comes fresh from the flower sellers that morning.
          </p>
          <ul className="mt-8 divide-y divide-line border-y border-line text-[15px]">
            {[["Bridal trial", rupees(2500), "adjusted against the package"], ["Mehndi, both hands", rupees(3500), "feet extra"],
              ["The wedding day: hair, make-up, draping", "from " + rupees(12000), "quoted after the trial"]].map(([a, b, c]) => (
              <li key={a} className="grid grid-cols-[1fr_auto] gap-x-4 py-3"><span>{a}<span className="block text-sm text-soft">{c}</span></span><span className="font-semibold tabular-nums">{b}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Visit() {
  const today = bengaluruNow().day;
  return (
    <section id="visit" aria-labelledby="visit-heading" className="page grid gap-10 py-20 md:grid-cols-[1.2fr_1fr] md:py-24">
      <div>
        <h2 id="visit-heading" className="text-4xl md:text-5xl">100 Feet Road, Indiranagar</h2>
        <p className="mt-5 flex items-start gap-3 text-lg"><MapPin size={24} className="mt-1 shrink-0" aria-hidden />
          First floor, above the pharmacy, five minutes from Indiranagar metro. Bengaluru 560038.</p>
        <p className="mt-3 flex items-start gap-3 text-lg"><Clock size={24} className="mt-1 shrink-0" aria-hidden />
          {today === CLOSED_DAY ? "Closed today (Tuesday)." : "Open today, 10am to 8:30pm."} Walk-ins welcome when a chair is free.</p>
      </div>
      <Pic name="salon-counter" sizes="(min-width: 768px) 40vw, 100vw" alt="A salon's reception counter, shelves of products and a styling chair"
        className="aspect-[4/3] w-full rounded-[1.5rem] object-cover" />
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-ground">
      <div className="page grid gap-10 py-16 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="flex items-center gap-3 font-display text-6xl italic md:text-8xl"><Flower className="h-12 w-12 text-ground md:h-16 md:w-16" /> Mallige</p>
          <p className="mt-4 max-w-[52ch] text-ground/80">
            A demo salon website by Adithya Baliga, Bengaluru: prices with times, and bookings that only offer slots the
            stylist is free for, arriving on the salon's WhatsApp. No booking app, no commission.
          </p>
        </div>
        <div className="text-ground/85">
          <Credits credits={credits} note="Services, prices, stylists and the address are sample content for this demo. The diary is made up." />
        </div>
      </div>
    </footer>
  );
}
