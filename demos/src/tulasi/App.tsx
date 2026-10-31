import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Clock, FirstAid, MapPin, Phone, Tooth, Baby, Stethoscope, WhatsappLogo } from "@phosphor-icons/react";
import credits from "../data/credits-clinic.json";
import { PHONE, addDays, bengaluruNow, clock, niceDate, rupees } from "../shared/site";
import { useJson, type Loaded } from "../shared/useJson";
import { Credits, DayChips, DemoBar, Field, LoadError, Magnetic, MessagePreview, itemIn, listIn, makePic, spring } from "../shared/ui";

const SHOP = "Tulasi Family Clinic";
const Pic = makePic("clinic", credits);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Session = { days: number[]; from: number; to: number };
type Doctor = { id: string; name: string; role: string; for: string; degrees: string; reg: string; languages: string;
  fee: number; slot: number; note: string; sessions: Session[] };
type Data = { doctors: Doctor[]; fees: { group: string; items: [string, string][] }[] };

const ICONS: Record<string, typeof Stethoscope> = { meera: Stethoscope, arjun: Baby, farheen: Tooth };

// ----------------------------------------------------------------------------------------- the diary
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function weekday(iso: string) {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

type Slot = { start: number; token: number; free: boolean };

/** The doctor's slots that day, each with its OP token number; some already taken (a stable made-up diary). */
function slotsFor(doc: Doctor, iso: string): { session: Session; slots: Slot[] }[] {
  const now = bengaluruNow();
  return doc.sessions.filter((s) => s.days.includes(weekday(iso))).map((session) => {
    const slots: Slot[] = [];
    let token = 1;
    for (let t = session.from; t + doc.slot <= session.to; t += doc.slot, token++) {
      const taken = hash(`${doc.id}${iso}${t}`) % 10 < 4;   // about four in ten already booked
      const past = iso === now.date && t < now.minutes + 20;
      slots.push({ start: t, token, free: !taken && !past });
    }
    return { session, slots };
  });
}

function workingDays(doc: Doctor, count: number): string[] {
  const today = bengaluruNow().date;
  const out: string[] = [];
  for (let i = 0; out.length < count && i < 30; i++) {
    const iso = addDays(today, i);
    if (doc.sessions.some((s) => s.days.includes(weekday(iso)))) out.push(iso);
  }
  return out;
}

/** Who is seeing patients right now, or who is next. */
function inNow(doctors: Doctor[]): string {
  const now = bengaluruNow();
  const here = doctors.filter((d) => d.sessions.some((s) => s.days.includes(now.day) && now.minutes >= s.from && now.minutes < s.to));
  if (here.length) {
    return here.map((d) => {
      const s = d.sessions.find((x) => x.days.includes(now.day) && now.minutes >= x.from && now.minutes < x.to)!;
      return `${d.name} is seeing patients until ${clock(s.to)}`;
    }).join(". ");
  }
  for (let i = 0; i < 8; i++) {
    const day = (now.day + i) % 7;
    const next = doctors.flatMap((d) => d.sessions.filter((s) => s.days.includes(day) && (i > 0 || s.from > now.minutes)).map((s) => ({ d, s })))
      .sort((a, b) => a.s.from - b.s.from)[0];
    if (next) return `Closed now. ${next.d.name} is next, ${i === 0 ? "today" : i === 1 ? "tomorrow" : WEEKDAYS[day]} at ${clock(next.s.from)}`;
  }
  return "Closed now";
}

// ------------------------------------------------------------------------------------------------ page
export default function App() {
  const [data, retry] = useJson<Data>("tulasi-clinic.json");
  return (
    <div>
      <DemoBar shop={SHOP} />
      <Header />
      <main>
        <Hero data={data} />
        <Doctors data={data} retry={retry} />
        <Booking data={data} />
        <Fees data={data} />
        <Before />
        <Visit />
      </main>
      <Footer />
    </div>
  );
}

function Leaf({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path d="M16 3c6 5 7 14 0 26C9 17 10 8 16 3z" fill="rgb(var(--accent))" />
      <path d="M16 7v20" stroke="rgb(var(--ground))" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex min-w-0 items-center gap-2 text-lg font-bold leading-tight tracking-tight sm:text-xl">
          <Leaf className="h-7 w-7 shrink-0" /> Tulasi Family Clinic
        </a>
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-[15px] font-medium">
            {[["#doctors", "Doctors"], ["#book", "Appointments"], ["#fees", "Fees"], ["#visit", "Visit"]].map(([h, l]) => (
              <li key={h}><a href={h} className="underline-offset-8 hover:underline">{l}</a></li>
            ))}
          </ul>
        </nav>
        <a href="#book" className="btn-accent min-h-[40px] shrink-0 whitespace-nowrap px-4 py-1.5">Book</a>
      </div>
    </header>
  );
}

function Hero({ data }: { data: Loaded<Data> }) {
  return (
    <section id="top" className="page grid items-center gap-10 pb-16 pt-10 md:pt-14 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pb-24">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <p className="flex items-start gap-2.5 text-[15px] font-medium" aria-live="polite">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
          {data.status === "ok" ? inNow(data.data.doctors) : "Checking who's in today…"}
        </p>
        <h1 className="mt-5 text-5xl font-bold leading-[1.02] tracking-tight md:text-6xl xl:text-7xl">Your family doctor, two streets away</h1>
        <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-soft md:text-xl">
          Tulasi is a family and dental clinic in Banashankari 2nd Stage: a family physician, a children's doctor and a
          dentist. Fees are on this page, and appointments are a WhatsApp message away.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Magnetic><a href="#book" className="btn-accent px-7 text-lg">Book an appointment</a></Magnetic>
          <a href="#fees" className="btn-line px-6 text-lg">See the fees</a>
        </div>
      </motion.div>
      <motion.div className="relative" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.1 }}>
        <Pic name="stethoscopes" eager sizes="(min-width: 1024px) 48vw, 100vw" alt="Three stethoscopes laid on a green-blue surface"
          className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
        <div className="absolute -bottom-6 left-4 flex items-center gap-3 rounded-2xl bg-ground px-4 py-3 shadow-[0_18px_40px_-20px_rgb(var(--ink)/0.5)] md:-left-6">
          <Pic name="tulasi" sizes="64px" alt="" className="h-14 w-14 rounded-xl object-cover" />
          <p className="text-sm leading-snug"><span className="font-semibold">Mon to Sat</span> 9am to 1pm, 5 to 8:30pm<br /><span className="font-semibold">Sunday</span> 10am to 1pm</p>
        </div>
      </motion.div>
    </section>
  );
}

const WEEK = [1, 2, 3, 4, 5, 6, 0];   // Monday first, the way a clinic board reads

/** "Mon to Sat", "Tue to Sun" or "Mon, Wed, Fri": a run of days says first to last. */
function daysText(days: number[]) {
  const short = (d: number) => WEEKDAYS[d].slice(0, 3);
  if (days.length === 1) return WEEKDAYS[days[0]] + "s";
  for (let first = 0; first < 7; first++) {
    const run = Array.from({ length: days.length }, (_, i) => WEEK[(first + i) % 7]);
    if (days.length > 2 && run.every((d) => days.includes(d))) return `${short(run[0])} to ${short(run[run.length - 1])}`;
  }
  return WEEK.filter((d) => days.includes(d)).map(short).join(", ");
}

function sessionsText(d: Doctor) {
  return d.sessions.map((s) => `${daysText(s.days)}, ${clock(s.from)} to ${clock(s.to)}`).join("; ");
}

function Doctors({ data, retry }: { data: Loaded<Data>; retry: () => void }) {
  return (
    <section id="doctors" aria-labelledby="doctors-title" className="bg-tint">
      <div className="page py-20 md:py-24">
        <h2 id="doctors-title" className="max-w-[20ch] text-4xl font-bold tracking-tight md:text-5xl">Three doctors, and when each one sits</h2>
        {data.status === "loading" && <div className="mt-10 space-y-4" aria-busy="true" aria-label="Loading doctors">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>}
        {data.status === "error" && <div className="mt-10"><LoadError what="doctors' details" error={data.error} retry={retry} /></div>}
        {data.status === "ok" && (
          <motion.ul className="mt-10 divide-y divide-line border-y border-line" variants={listIn} initial="hidden" whileInView="show" viewport={{ once: true }}>
            {data.data.doctors.map((d) => {
              const Icon = ICONS[d.id] ?? Stethoscope;
              return (
                <motion.li key={d.id} variants={itemIn} className="grid gap-x-10 gap-y-3 py-8 lg:grid-cols-[18rem_minmax(0,1fr)_14rem]">
                  <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-field text-on-field"><Icon size={24} aria-hidden /></span>
                    <div><h3 className="text-2xl font-bold tracking-tight">{d.name}</h3><p className="text-soft">{d.role}</p></div>
                  </div>
                  <div className="text-[16px] leading-relaxed">
                    <p>{d.for}.</p>
                    <p className="mt-1 text-soft">{d.degrees}. {d.reg}. Speaks {d.languages}.</p>
                    <p className="mt-1 text-soft">{sessionsText(d)}.</p>
                  </div>
                  <div className="lg:text-right">
                    <p className="text-2xl font-bold tabular-nums">{rupees(d.fee)}</p>
                    <p className="text-sm text-soft">{d.note}</p>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------------------- the booking
function Booking({ data }: { data: Loaded<Data> }) {
  const doctors = data.status === "ok" ? data.data.doctors : [];
  const [docId, setDocId] = useState("meera");
  const doc = doctors.find((d) => d.id === docId);
  const days = useMemo(() => (doc ? workingDays(doc, 10) : []), [doc]);
  const [day, setDay] = useState("");
  const chosenDay = days.includes(day) ? day : days[0] ?? "";
  const [slot, setSlot] = useState<Slot | null>(null);
  const [patient, setPatient] = useState("");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const sessions = doc && chosenDay ? slotsFor(doc, chosenDay) : [];
  const anyFree = sessions.some((s) => s.slots.some((x) => x.free));
  const child = docId === "arjun";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!slot) next.slot = "Pick a time.";
    if (patient.trim().length < 2) next.patient = child ? "Write the child's name." : "Write the patient's name.";
    const years = Number(age);
    if (!age.trim() || Number.isNaN(years) || years < 0 || years > 120) next.age = "Write the age in years.";
    else if (child && years > 16) next.age = "Dr. Hegde sees children up to 16. Book Dr. Meera Rao for adults.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 98450 26193.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  const message = doc && slot ? [`Appointment request, ${SHOP}`, `${doc.name} (${doc.role})`,
    `${niceDate(chosenDay)}, ${clock(slot.start)}, token ${slot.token}`, `Patient: ${patient.trim()}, ${age} years`,
    `Phone: ${phone.trim()}`, ...(reason.trim() ? [`Reason: ${reason.trim()}`] : []), `Consultation ${rupees(doc.fee)}`].join("\n") : "";

  return (
    <section id="book" aria-labelledby="book-title" className="page py-20 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
        <form onSubmit={submit} noValidate className="min-w-0 space-y-6">
          <div>
            <h2 id="book-title" className="text-4xl font-bold tracking-tight md:text-5xl">Ask for an appointment</h2>
            <p className="mt-3 max-w-[54ch] text-lg text-soft">Pick the doctor and a free time. The clinic confirms on WhatsApp within the hour, during OP hours.</p>
          </div>
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Doctor</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {doctors.map((d) => (
                <button key={d.id} type="button" aria-pressed={docId === d.id} onClick={() => { setDocId(d.id); setSlot(null); }}
                  className={`btn min-h-[64px] flex-col items-start gap-0 rounded-2xl px-4 py-2 text-left ${docId === d.id ? "bg-field text-on-field" : "border border-line hover:border-ink/40"}`}>
                  <span className="font-semibold">{d.name}</span><span className="text-sm opacity-80">{d.role}, {rupees(d.fee)}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {doc && (
            <DayChips days={days} value={chosenDay} onChange={(d) => { setDay(d); setSlot(null); }} activeClass="bg-field text-on-field" idleClass="bg-tint hover:bg-line" />
          )}
          <fieldset className="min-w-0">
            <legend className="text-sm font-medium">Time</legend>
            {!anyFree ? (
              <p className="mt-2 rounded-xl bg-tint p-4 text-[15px]">{doc ? `${doc.name}'s list for ${niceDate(chosenDay)} is full. Try the next day.` : "Loading the doctors' diaries."}</p>
            ) : sessions.map(({ session, slots }) => (
              <div key={session.from} className="mt-3">
                <p className="text-xs text-soft">{session.from < 12 * 60 ? "Morning OP" : "Evening OP"}, {clock(session.from)} to {clock(session.to)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {slots.filter((x) => x.free).map((x) => (
                    <button key={x.start} type="button" aria-pressed={slot?.start === x.start} onClick={() => setSlot(x)}
                      aria-label={`${clock(x.start)}, token ${x.token}`}
                      className={`btn min-h-[40px] px-3 py-1.5 text-[15px] tabular-nums ${slot?.start === x.start ? "bg-accent text-on-accent" : "border border-line hover:border-ink/40"}`}>{clock(x.start)}</button>
                  ))}
                </div>
              </div>
            ))}
            {errors.slot && <p role="alert" className="mt-2 text-sm font-medium text-bad">{errors.slot}</p>}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-[1fr_7rem]">
            <Field label={child ? "Child's name" : "Patient's name"} error={errors.patient}>{(a) => <input {...a} className="input" value={patient} onChange={(e) => setPatient(e.target.value)} autoComplete="off" />}</Field>
            <Field label="Age (years)" error={errors.age}>{(a) => <input {...a} className="input" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" />}</Field>
          </div>
          <Field label="Your mobile number" error={errors.phone}>{(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}</Field>
          <Field label="Reason for the visit (optional)" hint="A few words is enough, like fever for three days or a tooth ache. Tell the doctor the rest in person.">
            {(a) => <input {...a} className="input" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <button type="submit" className="btn-accent w-full text-lg sm:w-auto sm:px-8"><WhatsappLogo size={20} weight="bold" aria-hidden /> Request this appointment</button>
        </form>

        <aside aria-label="Your OP slip" className="self-start lg:sticky lg:top-24">
          <div className="op-slip rounded-b-2xl px-6 pb-6 pt-4 font-mono text-[14px] leading-relaxed">
            <p className="text-center font-body text-lg font-bold">{SHOP}</p>
            <p className="text-center text-xs">Banashankari 2nd Stage, Bengaluru</p>
            <p className="mt-3 border-y border-dashed border-current/40 py-1 text-center text-xs">OUTPATIENT SLIP</p>
            <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-y-1">
              <dt>Doctor</dt><dd>{doc?.name ?? "..."}</dd>
              <dt>Date</dt><dd>{chosenDay ? niceDate(chosenDay) : "..."}</dd>
              <dt>Time</dt><dd>{slot ? clock(slot.start) : "pick a time"}</dd>
              <dt>Token</dt><dd className="text-2xl font-bold">{slot ? slot.token : "–"}</dd>
              <dt>Patient</dt><dd>{patient.trim() || "..."}{age ? `, ${age} y` : ""}</dd>
              <dt>Fee</dt><dd>{doc ? rupees(doc.fee) : "..."}</dd>
            </dl>
            <p className="mt-4 text-xs">Please come 10 minutes early with old prescriptions and reports.</p>
          </div>
          <div className="mt-6 flex gap-3 rounded-2xl border border-bad/30 bg-bad/[0.05] p-4 text-[15px]">
            <FirstAid size={24} className="shrink-0 text-bad" aria-hidden />
            <p><span className="font-semibold">An emergency?</span> Don't book: call 108 for an ambulance, or 112, or go to the nearest hospital emergency. This is a clinic, not a hospital.</p>
          </div>
        </aside>
      </div>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your appointment request is ready" message={message} shop={SHOP} />
    </section>
  );
}

// ------------------------------------------------------------------------------------------- the rest
function Fees({ data }: { data: Loaded<Data> }) {
  return (
    <section id="fees" aria-labelledby="fees-title" className="bg-field text-on-field">
      <div className="page py-20 md:py-24">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 id="fees-title" className="text-4xl font-bold tracking-tight md:text-5xl">Fees, before you walk in</h2>
          <p className="max-w-[46ch] text-on-field/85">Medicines and lab tests are billed separately at MRP or the lab's printed rate. You're told the cost before any treatment.</p>
        </div>
        {data.status === "ok" ? (
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {data.data.fees.map((g) => (
              <div key={g.group}>
                <h3 className="text-xl font-semibold">{g.group}</h3>
                <ul className="mt-3 divide-y divide-on-field/20 border-y border-on-field/20 text-[15px]">
                  {g.items.map(([label, price]) => <li key={label} className="flex justify-between gap-4 py-2.5"><span>{label}</span><span className="text-right font-semibold tabular-nums">{price}</span></li>)}
                </ul>
              </div>
            ))}
          </div>
        ) : <div className="mt-10 h-40 rounded-2xl bg-on-field/10" aria-hidden />}
      </div>
    </section>
  );
}

const BRING = [
  ["Old prescriptions and reports", "Even old ones: they save a repeat test."],
  ["The medicines you take now", "The strips or a photo of them, with the doses."],
  ["For children, the vaccination card", "Dr. Hegde fills it in at every visit."],
  ["Fasting for a sugar test", "Nothing but water for 10 to 12 hours before."],
] as const;

function Before() {
  return (
    <section aria-labelledby="before-title" className="page grid items-center gap-12 py-20 md:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <div className="grid grid-cols-2 gap-4">
        <Pic name="bp-check" sizes="(min-width: 1024px) 22vw, 50vw" alt="A blood pressure cuff being put on an arm, beside a stethoscope"
          className="aspect-[4/5] w-full rounded-[1.5rem] object-cover" />
        <div className="space-y-4 pt-10">
          <Pic name="dental-chair" sizes="(min-width: 1024px) 22vw, 50vw" alt="A dentist's chair and lamp in a white room"
            className="aspect-square w-full rounded-[1.5rem] object-cover" />
          <Pic name="waiting" sizes="(min-width: 1024px) 22vw, 50vw" alt="A clinic waiting room with black chairs and a television"
            className="aspect-square w-full rounded-[1.5rem] object-cover" />
        </div>
      </div>
      <div>
        <h2 id="before-title" className="text-4xl font-bold tracking-tight md:text-5xl">What to bring</h2>
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {BRING.map(([a, b]) => <li key={a} className="py-4"><p className="text-lg font-semibold">{a}</p><p className="text-soft">{b}</p></li>)}
        </ul>
      </div>
    </section>
  );
}

function Visit() {
  return (
    <section id="visit" aria-labelledby="visit-heading" className="border-t border-line">
      <div className="page grid gap-10 py-20 md:grid-cols-2 md:py-24">
        <div>
          <h2 id="visit-heading" className="text-4xl font-bold tracking-tight md:text-5xl">Banashankari 2nd Stage</h2>
          <p className="mt-5 flex items-start gap-3 text-lg"><MapPin size={24} className="mt-1 shrink-0" aria-hidden />
            Ground floor, step-free, on the road behind the Banashankari temple bus stop. Bengaluru 560070.</p>
          <p className="mt-3 flex items-start gap-3 text-lg"><Clock size={24} className="mt-1 shrink-0" aria-hidden />
            Mon to Sat, 9am to 1pm and 5 to 8:30pm. Sunday, 10am to 1pm.</p>
          <p className="mt-3 flex items-start gap-3 text-lg"><Phone size={24} className="mt-1 shrink-0" aria-hidden />
            Appointments and questions by WhatsApp; the number is on the board outside.</p>
        </div>
        <Pic name="tulasi" sizes="(min-width: 768px) 45vw, 100vw" alt="A tulasi (holy basil) plant in flower"
          className="aspect-[3/2] w-full rounded-[1.5rem] object-cover" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-ink text-ground">
      <div className="page grid gap-10 py-16 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="flex items-center gap-3 text-4xl font-bold tracking-tight md:text-6xl"><Leaf className="h-12 w-12" /> Tulasi Family Clinic</p>
          <p className="mt-4 max-w-[54ch] text-ground/80">
            A demo clinic website by Adithya Baliga, Bengaluru: doctors, timings and fees in plain sight, and appointment
            requests that arrive on the clinic's WhatsApp. Informational only, as the medical council's rules ask.
          </p>
        </div>
        <div className="text-ground/85">
          <Credits credits={credits} note="Doctors, registration numbers, fees and the address are samples for this demo. The diary is made up." />
        </div>
      </div>
    </footer>
  );
}
