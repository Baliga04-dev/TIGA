import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bathtub, Bed, CaretDown, Coffee, Fan, MapPin, Minus, PersonSimpleWalk, Plus, Snowflake, Train, Car, Users, WhatsappLogo, WifiHigh } from "@phosphor-icons/react";
import credits from "../data/credits-stay.json";
import { PHONE, addDays, bengaluruNow, niceDate, rupees } from "../shared/site";
import { useJson, type Loaded } from "../shared/useJson";
import { Credits, DemoBar, Field, LoadError, Magnetic, MessagePreview, itemIn, listIn, makePic, spring } from "../shared/ui";

const SHOP = "Sampige Residency";
const Pic = makePic("stay", credits);

type Room = { id: string; name: string; size: number; beds: string; sleeps: number; weekday: number; weekend: number;
  pic: string; view: string; count: number; fullIn: number[] };
type Rates = { rooms: Room[]; extraBed: number; gst: number };

type Quote =
  | { ok: true; nights: { date: string; rate: number; weekend: boolean }[]; extraBeds: number; subtotal: number; gst: number; total: number }
  | { ok: false; reason: string };

/** The price of one room for these dates and guests: weekend rates on Friday and Saturday nights, GST by nightly rate. */
function quoteFor(room: Room, rates: Rates, checkIn: string, nights: number, guests: number, today: string): Quote {
  if (guests > room.sleeps + 1) return { ok: false, reason: `Sleeps ${room.sleeps}, or ${room.sleeps + 1} with an extra bed` };
  const full = new Set(room.fullIn.map((n) => addDays(today, n)));
  const dates = Array.from({ length: nights }, (_, i) => addDays(checkIn, i));
  const clash = dates.find((d) => full.has(d));
  if (clash) return { ok: false, reason: `Full on the night of ${niceDate(clash)}` };
  const extraBeds = guests > room.sleeps ? 1 : 0;
  const rows = dates.map((date) => {
    const day = new Date(date + "T00:00:00Z").getUTCDay();
    const weekend = day === 5 || day === 6;
    return { date, weekend, rate: (weekend ? room.weekend : room.weekday) + extraBeds * rates.extraBed };
  });
  const subtotal = rows.reduce((n, r) => n + r.rate, 0);
  // GST on hotel rooms: 5% when the night costs up to ₹7,500, 18% above that
  const gst = rows.reduce((n, r) => n + r.rate * (r.rate <= 7500 ? rates.gst : 0.18), 0);
  return { ok: true, nights: rows, extraBeds, subtotal, gst: Math.round(gst), total: Math.round(subtotal + gst) };
}

export default function App() {
  const [rates, retry] = useJson<Rates>("sampige-rates.json");
  return (
    <div>
      <DemoBar shop={SHOP} />
      <Header />
      <main>
        <Hero />
        <Planner rates={rates} retry={retry} />
        <Rooms rates={rates} />
        <Breakfast />
        <Nearby />
        <Rules />
      </main>
      <Footer />
    </div>
  );
}

function Flower({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M16 4c3.5 4.5 3.5 10 0 14.5C12.5 14 12.5 8.5 16 4zM7 12c5.5-.5 9 3 8.8 7.6C10.3 20 6.8 16.6 7 12zM25 12c-5.5-.5-9 3-8.8 7.6 5.5.4 9-3 8.8-7.6z" fill="rgb(var(--accent))" />
      <path d="M16 20v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-on-field/10 bg-field/95 text-on-field backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex min-w-0 items-center gap-2 font-display text-lg leading-none sm:text-xl">
          <Flower className="h-8 w-8" /> Sampige Residency
        </a>
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-[15px]">
            {[["#rooms", "Rooms"], ["#breakfast", "Breakfast"], ["#nearby", "Nearby"], ["#rules", "House rules"]].map(([h, l]) => (
              <li key={h}><a href={h} className="underline-offset-8 hover:underline">{l}</a></li>
            ))}
          </ul>
        </nav>
        <a href="#stay" className="btn-accent min-h-[40px] shrink-0 whitespace-nowrap px-4 py-1.5">Check dates</a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="bg-field text-on-field">
      <div className="page grid items-center gap-10 pb-16 pt-10 md:pt-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:pb-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <h1 className="text-[2.6rem] leading-[1.05] md:text-6xl xl:text-7xl">Eighteen rooms by Lalbagh's west gate</h1>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-on-field/85 md:text-xl">
            Sampige Residency is a small hotel in Basavanagudi, a nine-minute walk from Lalbagh. Rooms from {rupees(3400)} a night
            with breakfast: dosa and filter coffee under the sampige tree.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Magnetic><a href="#stay" className="btn-accent px-7 text-lg">See prices for your dates</a></Magnetic>
            <a href="#rooms" className="btn border border-on-field/30 px-6 text-lg hover:bg-on-field/10">The rooms</a>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-on-field/15 pt-6 text-[15px]">
            <div><dt className="text-on-field/70">Check-in</dt><dd className="font-semibold">12 noon</dd></div>
            <div><dt className="text-on-field/70">Check-out</dt><dd className="font-semibold">11am</dd></div>
            <div><dt className="text-on-field/70">Pay</dt><dd className="font-semibold">At the desk</dd></div>
          </dl>
        </motion.div>
        <motion.figure className="relative" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.1 }}>
          <Pic name="glasshouse-night" eager sizes="(min-width: 1024px) 52vw, 100vw" alt="Lalbagh's glass house lit up at night"
            className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
          <figcaption className="absolute bottom-4 left-4 rounded-full bg-field/80 px-4 py-2 text-sm backdrop-blur">
            The Glass House at Lalbagh, 14 minutes on foot
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------------------------- planner
function Counter({ label, value, set, min, max, hint }: { label: string; value: number; set: (n: number) => void; min: number; max: number; hint?: string }) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-sm font-medium">{label}</span>
      <div className="flex items-center justify-between rounded-xl border border-line bg-ground px-1.5" role="group" aria-labelledby={id}>
        <button type="button" className="btn h-10 min-h-0 w-10 p-0 hover:bg-ink/5" aria-label={`Fewer ${label.toLowerCase()}`}
          onClick={() => set(Math.max(min, value - 1))} disabled={value <= min}><Minus size={16} weight="bold" aria-hidden /></button>
        <span className="font-semibold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" className="btn h-10 min-h-0 w-10 p-0 hover:bg-ink/5" aria-label={`More ${label.toLowerCase()}`}
          onClick={() => set(Math.min(max, value + 1))} disabled={value >= max}><Plus size={16} weight="bold" aria-hidden /></button>
      </div>
      {hint && <p className="text-sm text-soft">{hint}</p>}
    </div>
  );
}

function Planner({ rates, retry }: { rates: Loaded<Rates>; retry: () => void }) {
  const today = bengaluruNow().date;
  const [checkIn, setCheckIn] = useState(addDays(today, 3));
  const [nights, setNights] = useState(2);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [chosen, setChosen] = useState("");
  const [dateError, setDateError] = useState("");
  const guests = adults + children;
  const quotes = useMemo(() => rates.status === "ok"
    ? rates.data.rooms.map((r) => ({ room: r, quote: quoteFor(r, rates.data, checkIn, nights, guests, today) }))
    : [], [rates, checkIn, nights, guests, today]);
  const picked = quotes.find((q) => q.room.id === chosen && q.quote.ok);
  const anyFree = quotes.some((q) => q.quote.ok);

  const changeDate = (value: string) => {
    if (!value || value < today) { setDateError("Pick today or a later date."); return; }
    if (value > addDays(today, 180)) { setDateError("We take bookings up to six months ahead."); return; }
    setDateError("");
    setCheckIn(value);
  };

  return (
    <section id="stay" aria-labelledby="stay-title" className="page py-20 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-16">
        <div>
          <h2 id="stay-title" className="text-4xl leading-tight md:text-5xl">Prices for your dates</h2>
          <p className="mt-4 text-lg text-soft">Every room, with breakfast, taxes and the weekend rate worked out. Nothing to pay until you arrive.</p>
          <div className="mt-8 space-y-5">
            <Field label="Check-in" error={dateError}>
              {(a) => <input {...a} type="date" className="input" min={today} max={addDays(today, 180)} value={checkIn}
                onChange={(e) => changeDate(e.target.value)} />}
            </Field>
            <Counter label="Nights" value={nights} set={setNights} min={1} max={14} hint={`Check out ${niceDate(addDays(checkIn, nights))}, by 11am`} />
            <div className="grid grid-cols-2 gap-4">
              <Counter label="Adults" value={adults} set={setAdults} min={1} max={4} />
              <Counter label="Children" value={children} set={setChildren} min={0} max={3} />
            </div>
          </div>
        </div>

        <div>
          {rates.status === "loading" && (
            <div className="space-y-4" aria-busy="true" aria-label="Loading prices">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="grid grid-cols-[96px_1fr_auto] items-center gap-5 border-b border-line pb-4">
                  <div className="skeleton h-20 w-24" /><div className="space-y-2"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-4 w-3/4" /></div>
                  <div className="skeleton h-10 w-28" />
                </div>
              ))}
            </div>
          )}
          {rates.status === "error" && <LoadError what="prices" error={rates.error} retry={retry} />}
          {rates.status === "ok" && (
            <>
              <p className="text-[15px] text-soft" aria-live="polite">
                {niceDate(checkIn)} to {niceDate(addDays(checkIn, nights))}, {nights} {nights === 1 ? "night" : "nights"}, {guests} {guests === 1 ? "guest" : "guests"}
              </p>
              <motion.ul className="mt-4 divide-y divide-line border-y border-line" variants={listIn} initial="hidden" animate="show">
                {quotes.map(({ room, quote }) => (
                  <motion.li key={room.id} variants={itemIn} className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-5 gap-y-3 py-5 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center">
                    <Pic name={room.pic} sizes="112px" alt="" className={`aspect-[4/3] w-full rounded-xl object-cover ${quote.ok ? "" : "opacity-50 grayscale"}`} />
                    <div className="min-w-0">
                      <h3 className="font-display text-xl">{room.name}</h3>
                      {quote.ok ? (
                        <p className="mt-1 text-sm text-soft">
                          {summarise(quote.nights)}{quote.extraBeds ? `, extra bed ${rupees(rates.data.extraBed)} a night` : ""}, GST {rupees(quote.gst)}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm font-medium text-bad">{quote.reason}</p>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:gap-2">
                      {quote.ok ? (
                        <>
                          <p className="text-xl font-semibold tabular-nums">{rupees(quote.total)}</p>
                          <button type="button" aria-pressed={chosen === room.id} onClick={() => setChosen(room.id)}
                            className={chosen === room.id ? "btn-ink min-h-[40px] px-5 py-1.5" : "btn-line min-h-[40px] px-5 py-1.5"}>
                            {chosen === room.id ? "Chosen" : "Choose"}
                          </button>
                        </>
                      ) : <p className="text-sm text-soft">Try other dates</p>}
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
              {!anyFree && (
                <div className="mt-6 rounded-2xl bg-tint p-6">
                  <p className="font-semibold">No room fits those dates and guests.</p>
                  <p className="mt-1 text-soft">Move the check-in a day either side, or split a big group across a Family Suite and a Courtyard Queen.</p>
                </div>
              )}
              <AnimatePresence>
                {picked && picked.quote.ok && (
                  <motion.div key={picked.room.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                    <BookingForm room={picked.room} total={picked.quote.total} checkIn={checkIn} nights={nights} guests={guests} />
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function summarise(nights: { rate: number; weekend: boolean }[]): string {
  const week = nights.filter((n) => !n.weekend), end = nights.filter((n) => n.weekend);
  const part = (list: typeof nights, word: string) => list.length ? `${list.length} ${word}${list.length === 1 ? "" : "s"} at ${rupees(list[0].rate)}` : "";
  return [part(week, "weeknight"), part(end, "weekend night")].filter(Boolean).join(" and ");
}

function BookingForm({ room, total, checkIn, nights, guests }: { room: Room; total: number; checkIn: string; nights: number; guests: number }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [arrival, setArrival] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = "Write the name on your ID; we check it at the desk.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 97411 50382.";
    if (!arrival) next.arrival = "Tell us roughly when you'll arrive.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  const message = [`Booking request, ${SHOP}`, `${room.name}, ${guests} ${guests === 1 ? "guest" : "guests"}`,
    `${niceDate(checkIn)} to ${niceDate(addDays(checkIn, nights))} (${nights} ${nights === 1 ? "night" : "nights"})`,
    `Quoted: ${rupees(total)} with breakfast and GST`, `Arriving: ${arrival}`, `${name.trim()}, ${phone.trim()}`,
    ...(note.trim() ? [`Note: ${note.trim()}`] : [])].join("\n");
  return (
    <form onSubmit={submit} noValidate className="mt-8 rounded-[1.75rem] bg-field p-6 text-on-field md:p-8 on-field">
      <h3 className="font-display text-2xl">Request the {room.name}, {rupees(total)}</h3>
      <p className="mt-1 text-[15px] text-on-field/80">We confirm on WhatsApp within the hour, 7am to 11pm. Free cancellation until 48 hours before check-in.</p>
      <div className="mt-6 grid gap-5 text-ink sm:grid-cols-3 [&_label]:text-on-field [&_p]:text-on-field/85">
        <Field label="Name" error={errors.name}>
          {(a) => <input {...a} className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
        </Field>
        <Field label="Mobile number" error={errors.phone}>
          {(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}
        </Field>
        <Field label="Arriving" error={errors.arrival}>
          {(a) => (
            <select {...a} className="input" value={arrival} onChange={(e) => setArrival(e.target.value)}>
              <option value="">Choose</option>
              {["Before noon (early check-in if free)", "12 to 3pm", "3 to 6pm", "6 to 9pm", "9pm to midnight", "After midnight"].map((t) => <option key={t}>{t}</option>)}
            </select>
          )}
        </Field>
        <Field label="Anything we should know?" hint="Optional: a cot, a ground-floor room, a late flight." className="sm:col-span-3">
          {(a) => <input {...a} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
      <button type="submit" className="btn-accent mt-6 w-full text-lg sm:w-auto sm:px-8">
        <WhatsappLogo size={20} weight="bold" aria-hidden /> Send the request
      </button>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your booking request is ready" message={message} shop={SHOP} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------- rooms
const AMENITIES = [[Snowflake, "Air conditioning"], [Fan, "Ceiling fan"], [WifiHigh, "Wi-Fi, 100 Mbps"], [Coffee, "Breakfast included"]] as const;

function Rooms({ rates }: { rates: Loaded<Rates> }) {
  const layout = ["lg:col-span-7", "lg:col-span-5 lg:mt-24", "lg:col-span-5", "lg:col-span-7"];
  return (
    <section id="rooms" aria-labelledby="rooms-title" className="bg-tint">
      <div className="page py-20 md:py-28">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 id="rooms-title" className="text-4xl leading-tight md:text-6xl">Four kinds of room</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            {AMENITIES.map(([Icon, label]) => <li key={label} className="flex items-center gap-2"><Icon size={20} aria-hidden /> {label}</li>)}
          </ul>
        </div>
        {rates.status === "ok" ? (
          <motion.ul className="mt-14 grid gap-x-10 gap-y-14 lg:grid-cols-12" variants={listIn} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }}>
            {rates.data.rooms.map((r, i) => (
              <motion.li key={r.id} variants={itemIn} className={layout[i]}>
                <Pic name={r.pic} sizes="(min-width: 1024px) 50vw, 100vw" alt={`The ${r.name}`}
                  className={`w-full rounded-[1.75rem] object-cover ${i % 3 === 0 ? "aspect-[16/10]" : "aspect-[4/3]"}`} />
                <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h3 className="font-display text-3xl">{r.name}</h3>
                  <p className="tabular-nums"><span className="text-xl font-semibold">{rupees(r.weekday)}</span> <span className="text-soft">a night, {rupees(r.weekend)} Fri and Sat</span></p>
                </div>
                <p className="mt-2 max-w-[52ch] text-[17px] leading-relaxed text-soft">{r.view}</p>
                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px]">
                  <li className="flex items-center gap-2"><Bed size={20} aria-hidden /> {r.beds}</li>
                  <li className="flex items-center gap-2"><Users size={20} aria-hidden /> Sleeps {r.sleeps}</li>
                  <li className="flex items-center gap-2 tabular-nums">{r.size} m²</li>
                  {r.id === "family" && <li className="flex items-center gap-2"><Bathtub size={20} aria-hidden /> Bathtub</li>}
                </ul>
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <div className="mt-14 grid gap-10 lg:grid-cols-12" aria-hidden>
            {layout.map((c, i) => <div key={i} className={c}><div className="skeleton aspect-[4/3] w-full" /><div className="skeleton mt-5 h-8 w-1/2" /></div>)}
          </div>
        )}
      </div>
    </section>
  );
}

function Breakfast() {
  return (
    <section id="breakfast" aria-labelledby="breakfast-title" className="page grid items-center gap-10 py-20 md:grid-cols-[1.1fr_1fr] md:py-28 lg:gap-20">
      <Pic name="breakfast" sizes="(min-width: 768px) 50vw, 100vw" alt="A masala dosa with a vada, chutney and sambar on a steel plate"
        className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
      <div>
        <h2 id="breakfast-title" className="text-4xl leading-tight md:text-5xl">Breakfast under the sampige tree</h2>
        <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-soft">
          Served in the courtyard from 7 to 10:30. The tree flowers from April to July, and the whole house smells of it.
        </p>
        <ul className="mt-8 divide-y divide-line border-y border-line text-[15px]">
          {[["Every day", "Masala dosa or idli-vada, upma, fruit, filter coffee"], ["Sundays", "Kesari bath and khara bath, the Bengaluru pair"],
            ["On request", "Toast, eggs any way, oats with milk"], ["Leaving early", "A packed breakfast from 5am"]].map(([k, v]) => (
            <li key={k} className="grid grid-cols-[8rem_1fr] gap-4 py-3"><span className="font-semibold">{k}</span><span>{v}</span></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const NEARBY = [
  [PersonSimpleWalk, "Gandhi Bazaar flower market", "8 min walk"],
  [PersonSimpleWalk, "Lalbagh west gate", "9 min walk"],
  [PersonSimpleWalk, "Bull Temple and Bugle Rock", "12 min walk"],
  [PersonSimpleWalk, "The Glass House, Lalbagh", "14 min walk"],
  [Train, "Lalbagh metro, Green Line", "10 min walk"],
  [Train, "Cubbon Park, by metro", "25 min, one change"],
  [Car, "Kempegowda Airport", "75 to 100 min by taxi"],
] as const;

function Nearby() {
  return (
    <section id="nearby" aria-labelledby="nearby-title" className="bg-field text-on-field">
      <div className="page grid gap-12 py-20 md:py-28 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <h2 id="nearby-title" className="text-4xl leading-tight md:text-6xl">Old Bengaluru, on foot</h2>
          <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-on-field/85">
            Basavanagudi is one of the city's oldest neighbourhoods: wide streets, big trees, and most of what visitors
            come for within a twenty-minute walk.
          </p>
          <motion.ul className="mt-10 divide-y divide-on-field/15 border-y border-on-field/15" variants={listIn} initial="hidden" whileInView="show" viewport={{ once: true }}>
            {NEARBY.map(([Icon, place, time]) => (
              <motion.li key={place} variants={itemIn} className="flex items-center justify-between gap-4 py-4 text-[17px]">
                <span className="flex items-center gap-3"><Icon size={22} className="shrink-0 text-accent" aria-hidden /> {place}</span>
                <span className="shrink-0 text-right tabular-nums text-on-field/80">{time}</span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Pic name="glasshouse" sizes="(min-width: 1024px) 26vw, 50vw" alt="The Lalbagh glass house at dusk, seen down a path"
            className="row-span-2 h-full w-full rounded-[1.5rem] object-cover" />
          <Pic name="cubbon-bandstand" sizes="(min-width: 1024px) 24vw, 50vw" alt="A red-roofed bandstand among lawns in Cubbon Park"
            className="aspect-square w-full rounded-[1.5rem] object-cover" />
          <Pic name="cubbon-trees" sizes="(min-width: 1024px) 24vw, 50vw" alt="Old rain trees shading a lawn in Cubbon Park"
            className="aspect-square w-full rounded-[1.5rem] object-cover" />
        </div>
      </div>
    </section>
  );
}

const RULES = [
  ["What ID do you need?", "A government photo ID for every adult: Aadhaar, passport, driving licence or voter ID. Guests from outside India need a passport and visa; we fill in Form C for you."],
  ["Can unmarried couples stay?", "Yes. Each of you shows your own ID at check-in, the same as anyone else."],
  ["Can we check in early or leave late?", "Early check-in from 9am and late check-out until 2pm are free when the room is free. Ask on WhatsApp the day before."],
  ["How do we pay?", "At the desk when you leave, by UPI, card or cash. No advance, and no card details on WhatsApp."],
  ["What if we cancel?", "Free until 48 hours before check-in. After that, we charge the first night."],
  ["Pets, parking, smoking?", "No pets, sorry. Six car spaces, first come. No smoking indoors; the terrace has a corner for it."],
] as const;

function Rules() {
  return (
    <section id="rules" aria-labelledby="rules-title" className="page grid gap-10 py-20 md:py-24 lg:grid-cols-[0.7fr_1.3fr]">
      <h2 id="rules-title" className="text-4xl leading-tight md:text-5xl">House rules and answers</h2>
      <div className="divide-y divide-line border-y border-line">
        {RULES.map(([q, a]) => (
          <details key={q} className="group">
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-medium [&::-webkit-details-marker]:hidden">
              {q}<CaretDown size={20} className="shrink-0 transition-transform duration-300 group-open:rotate-180" aria-hidden />
            </summary>
            <p className="max-w-[64ch] pb-5 text-[17px] leading-relaxed text-soft">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-ground">
      <div className="page grid gap-10 py-16 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="flex items-center gap-3 font-display text-4xl leading-none md:text-6xl"><Flower className="h-12 w-12 text-ground md:h-16 md:w-16" /> Sampige Residency</p>
          <p className="mt-5 flex items-start gap-3 text-ground/85"><MapPin size={22} className="mt-0.5 shrink-0" aria-hidden />
            Near Lalbagh West Gate, Basavanagudi, Bengaluru 560004. Desk open 24 hours.</p>
          <p className="mt-3 max-w-[54ch] text-ground/75">
            A demo hotel website by Adithya Baliga, Bengaluru: live prices for any dates, booking requests on the hotel's
            WhatsApp, and no booking-site commission on direct guests.
          </p>
        </div>
        <div className="text-ground/85">
          <Credits credits={credits} note="Rooms, prices and the address are sample content for this demo. Room photos are not of a real Sampige Residency." />
        </div>
      </div>
    </footer>
  );
}
