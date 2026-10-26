import { useMemo, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { BookOpen, BowlFood, CaretDown, FirstAid, MapPin, Moon, ShieldCheck, Sun, WhatsappLogo } from "@phosphor-icons/react";
import credits from "../data/credits-preschool.json";
import { PHONE, bengaluruNow, clock, niceDate, openDays, rupees, slotsFor } from "../shared/site";
import { Credits, DayChips, DemoBar, Field, Magnetic, MessagePreview, itemIn, listIn, makePic, spring } from "../shared/ui";

const SHOP = "Little Banyan";
const Pic = makePic("preschool", credits);
const TERM_START = "2027-06-01";
const CLOSED_DAY = 0; // Sunday

type Programme = { id: string; name: string; from: number; to: number; age: string; hours: string; fee: string; colour: string; note: string };
const PROGRAMMES: Programme[] = [
  { id: "roots", name: "Little roots daycare", from: 18, to: 24, age: "18 months to 2 years", hours: "8:30am to 6:30pm, Mon to Sat",
    fee: `${rupees(14500)} a month`, colour: "#cfe0ff", note: "Full day with a cooked lunch and two naps." },
  { id: "playgroup", name: "Playgroup", from: 24, to: 36, age: "2 years by 1 June", hours: "9:30am to 12pm, Mon to Fri",
    fee: `${rupees(62000)} a year`, colour: "#ffe9a3", note: "Six children to a teacher. Sand, water, songs." },
  { id: "nursery", name: "Nursery", from: 36, to: 48, age: "3 years by 1 June", hours: "9am to 12:30pm, Mon to Fri",
    fee: `${rupees(68000)} a year`, colour: "#c9ecd2", note: "Montessori trays, first letters, Kannada rhymes." },
  { id: "lkg", name: "LKG", from: 48, to: 60, age: "4 years by 1 June", hours: "9am to 1pm, Mon to Fri",
    fee: `${rupees(74000)} a year`, colour: "#ffd4c4", note: "Reading readiness, numbers to 50, the garden plot." },
  { id: "ukg", name: "UKG", from: 60, to: 72, age: "5 years by 1 June", hours: "9am to 1pm, Mon to Fri",
    fee: `${rupees(78000)} a year`, colour: "#e3d9ff", note: "Reading, writing and a year getting ready for Class 1." },
];

function monthsOld(dob: string, on = TERM_START): number {
  const [y1, m1, d1] = dob.split("-").map(Number);
  const [y2, m2, d2] = on.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

function ageWords(m: number): string {
  const y = Math.floor(m / 12), mo = m % 12;
  return [y && `${y} ${y === 1 ? "year" : "years"}`, mo && `${mo} ${mo === 1 ? "month" : "months"}`].filter(Boolean).join(" ") || "0 months";
}

type Fit = { kind: "class"; programme: Programme; months: number } | { kind: "young" | "old"; months: number };
function fitFor(dob: string): Fit {
  const months = monthsOld(dob);
  const programme = PROGRAMMES.find((p) => months >= p.from && months < p.to);
  if (programme) return { kind: "class", programme, months };
  return { kind: months < 18 ? "young" : "old", months };
}

export default function App() {
  const [chosen, setChosen] = useState("");
  return (
    <div>
      <DemoBar shop={SHOP} />
      <Header />
      <main>
        <Hero />
        <WhichClass choose={(id) => { setChosen(id); document.getElementById("admissions")?.scrollIntoView({ behavior: "smooth" }); }} />
        <Day />
        <Fees />
        <Care />
        <Faq />
        <Admissions programme={chosen} setProgramme={setChosen} />
      </main>
      <Footer />
    </div>
  );
}

function TreeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={className}>
      <path d="M6 18c0-8 6-13 14-13s14 5 14 13c0 5-4 8-9 8H15c-5 0-9-3-9-8z" fill="rgb(var(--accent))" />
      <path d="M18 24h4v13h-4zM12 26v9M28 26v9" stroke="rgb(var(--ink))" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur-md">
      <div className="page flex h-16 items-center justify-between gap-6">
        <a href="#top" className="flex items-center gap-2 font-display text-2xl font-bold leading-none">
          <TreeMark className="h-9 w-9" /> Little Banyan
        </a>
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-[15px] font-bold">
            {[["#which-class", "Which class?"], ["#day", "A day here"], ["#fees", "Fees"], ["#care", "Care"], ["#faq", "Questions"]].map(([h, l]) => (
              <li key={h}><a href={h} className="underline-offset-8 hover:underline">{l}</a></li>
            ))}
          </ul>
        </nav>
        <a href="#admissions" className="btn-accent min-h-[40px] shrink-0 whitespace-nowrap px-4 py-1.5">Book a visit</a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="page grid items-center gap-12 pb-20 pt-10 md:pt-14 lg:grid-cols-[1fr_1.1fr]">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <p className="inline-flex items-center gap-2 rounded-full bg-field px-3.5 py-1.5 text-sm font-bold">
          <Sun size={18} weight="fill" aria-hidden /> Admissions open for June 2027
        </p>
        <h1 className="mt-6 text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">A big tree for small people</h1>
        <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-soft md:text-xl">
          Little Banyan is a preschool and daycare in HSR Layout for children from 18 months to 6 years: play, stories
          in Kannada and English, a cooked lunch and a proper nap.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Magnetic><a href="#which-class" className="btn-ink px-7 text-lg">Find your child's class</a></Magnetic>
          <a href="#admissions" className="btn-line px-6 text-lg">Book a visit</a>
        </div>
        <p className="mt-8 text-[15px] text-soft">Sector 2, HSR Layout. Mon to Fri for classes, Saturday daycare till 1pm.</p>
      </motion.div>
      <motion.div className="grid grid-cols-6 grid-rows-[auto_auto] gap-3 md:gap-4" initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.1 }}>
        <Pic name="crayons" eager sizes="(min-width: 1024px) 40vw, 100vw" alt="A child's crayon drawing of a house, flowers and a smiling person, with crayons around it"
          className="col-span-6 aspect-[16/10] w-full rounded-[2rem] object-cover md:col-span-4 md:row-span-2 md:aspect-auto md:h-full" />
        <Pic name="wooden-toys" sizes="(min-width: 1024px) 18vw, 50vw" alt="Three wooden toys on wheels: a car, a star and a duck"
          className="col-span-3 aspect-square w-full rounded-[1.5rem] object-cover md:col-span-2" />
        <Pic name="castle" sizes="(min-width: 1024px) 18vw, 50vw" alt="A small wooden toy castle with a drawbridge"
          className="col-span-3 aspect-square w-full rounded-[1.5rem] object-cover md:col-span-2" />
      </motion.div>
    </section>
  );
}

// ------------------------------------------------------------------------------------- which class
const CHART_MAX = 84; // months on the wall chart

function WhichClass({ choose }: { choose: (id: string) => void }) {
  const today = bengaluruNow().date;
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [fit, setFit] = useState<Fit | null>(null);
  const child = name.trim() || "Your child";

  const check = (e: FormEvent) => {
    e.preventDefault();
    if (!dob) { setError("Enter the date of birth."); setFit(null); return; }
    if (dob > today) { setError("That date is in the future. Check the year."); setFit(null); return; }
    if (monthsOld(dob) > 120) { setError("That makes your child over ten. Check the year."); setFit(null); return; }
    setError("");
    setFit(fitFor(dob));
  };
  const y = (m: number) => 470 - (Math.min(m, CHART_MAX) / CHART_MAX) * 440;

  return (
    <section id="which-class" aria-labelledby="which-title" className="bg-field text-on-field">
      <div className="page grid items-center gap-12 py-20 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
        <div>
          <h2 id="which-title" className="text-4xl font-extrabold leading-none tracking-tight md:text-6xl">Which class in June 2027?</h2>
          <p className="mt-5 max-w-[50ch] text-lg leading-relaxed">
            Karnataka counts age on 1 June: a child must be six by then to start Class 1. Enter a birthday and the wall
            chart shows where your child stands.
          </p>
          <form onSubmit={check} noValidate className="mt-8 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Child's first name (optional)">
              {(a) => <input {...a} className="input border-ink/20 bg-ground" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label="Date of birth" error={error}>
              {(a) => <input {...a} type="date" max={today} min="2016-01-01" className="input border-ink/20 bg-ground" value={dob}
                onChange={(e) => setDob(e.target.value)} />}
            </Field>
            <button type="submit" className={`btn-ink ${error ? "sm:mb-7" : ""}`}>Show the class</button>
          </form>
          <div aria-live="polite" className="mt-8 min-h-[9rem]">
            {fit && (
              <motion.div key={`${dob}-${name}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                className="rounded-[1.75rem] bg-ground p-6 text-ink shadow-[0_18px_40px_-24px_rgb(var(--ink)/0.5)]">
                <p className="text-[15px] text-soft">{child} will be {ageWords(fit.months)} old on 1 June 2027.</p>
                {fit.kind === "class" ? (
                  <>
                    <p className="mt-2 font-display text-3xl font-extrabold leading-tight">{fit.programme.name}</p>
                    <p className="mt-1">{fit.programme.hours}. {fit.programme.fee}.</p>
                    <button type="button" className="btn-accent mt-5" onClick={() => choose(fit.programme.id)}>
                      Book a visit for {fit.programme.name}
                    </button>
                  </>
                ) : fit.kind === "young" ? (
                  <>
                    <p className="mt-2 font-display text-3xl font-extrabold leading-tight">A little early for us</p>
                    <p className="mt-1">We take children from 18 months. Ask us to keep a daycare seat for when {name.trim() || "they"} turn{name.trim() ? "s" : ""} 18 months.</p>
                    <button type="button" className="btn-accent mt-5" onClick={() => choose("roots")}>Join the daycare waiting list</button>
                  </>
                ) : (
                  <>
                    <p className="mt-2 font-display text-3xl font-extrabold leading-tight">Ready for Class 1</p>
                    <p className="mt-1">At six or older, {name.trim() || "your child"} starts primary school. Our after-school daycare runs 1pm to 6:30pm for ages up to 8.</p>
                    <button type="button" className="btn-accent mt-5" onClick={() => choose("roots")}>Ask about after-school daycare</button>
                  </>
                )}
              </motion.div>
            )}
          </div>
        </div>

        <figure className="mx-auto w-full max-w-[420px]">
          <svg viewBox="0 0 320 500" role="img" aria-labelledby="chart-title" className="w-full">
            <title id="chart-title">
              {fit ? `Wall chart: ${child} at ${ageWords(fit.months)} on 1 June 2027` : "Wall chart of classes by age on 1 June 2027"}
            </title>
            <rect x="60" y="20" width="200" height="460" rx="18" fill="rgb(var(--ground))" />
            <rect x="60" y={y(18)} width="200" height={y(0) - y(18)} fill="#eceff4" />
            <text x="100" y={(y(0) + y(18)) / 2 + 6} fontSize="15" fill="rgb(var(--soft))" fontFamily="var(--font-body)">Under 18 months</text>
            {PROGRAMMES.map((p) => (
              <g key={p.id}>
                <rect x="60" y={y(p.to)} width="200" height={y(p.from) - y(p.to)} fill={p.colour}
                  opacity={fit && fit.kind === "class" && fit.programme.id !== p.id ? 0.45 : 1} />
                <text x="100" y={(y(p.from) + y(p.to)) / 2 + 6} fontSize="17" fontWeight="700" fill="rgb(var(--ink))" fontFamily="var(--font-display)">{p.name.replace(" daycare", "")}</text>
              </g>
            ))}
            <rect x="60" y={y(CHART_MAX)} width="200" height={y(72) - y(CHART_MAX)} fill="#f4f4f1" />
            <text x="100" y={(y(72) + y(CHART_MAX)) / 2 + 6} fontSize="17" fontWeight="700" fill="rgb(var(--soft))" fontFamily="var(--font-display)">Class 1</text>
            {Array.from({ length: CHART_MAX / 6 + 1 }, (_, i) => i * 6).map((m) => (
              <g key={m}>
                <line x1="60" x2={m % 12 ? 72 : 82} y1={y(m)} y2={y(m)} stroke="rgb(var(--ink))" strokeWidth="2" />
                {m % 12 === 0 && <text x="50" y={y(m) + 5} fontSize="14" textAnchor="end" fill="rgb(var(--ink))" fontFamily="var(--font-body)">{m / 12}y</text>}
              </g>
            ))}
            <motion.g initial={false} animate={{ y: fit ? y(fit.months) : y(0), opacity: fit ? 1 : 0 }} transition={spring}>
              <line x1="52" x2="268" y1="0" y2="0" stroke="rgb(var(--accent))" strokeWidth="4" strokeLinecap="round" />
              <rect x="186" y="-30" width="118" height="26" rx="13" fill="rgb(var(--accent))" />
              <text x="245" y="-12" fontSize="14" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="var(--font-body)">
                {child.length > 12 ? child.slice(0, 11) + "." : child}
              </text>
            </motion.g>
          </svg>
          <figcaption className="mt-3 text-center text-sm">Age on 1 June 2027, as Karnataka counts it.</figcaption>
        </figure>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------------------------- day
const DAY = [
  [8 * 60 + 30, "Arrive", "Daycare children come in; breakfast for anyone who missed it."],
  [9 * 60, "Circle time", "Songs in Kannada and English, the weather, who is here today."],
  [9 * 60 + 30, "Work time", "Montessori trays, blocks, painting. Children choose; teachers watch and help."],
  [10 * 60 + 45, "Ragi malt and fruit", "Made in our kitchen. No packaged snacks, no sugar drinks."],
  [11 * 60, "Out in the yard", "Sand pit, slide, the vegetable patch, water play in summer."],
  [12 * 60, "Story and home time", "A picture book, then Playgroup and Nursery go home."],
  [13 * 60, "Lunch and nap", "Rice, sambar, a palya and curd for daycare children, then a nap till three."],
  [16 * 60, "Afternoon", "Snack, the library corner, and free play until parents arrive."],
  [18 * 60 + 30, "Doors close", "Every child handed only to an adult on their pick-up card."],
] as const;

function Day() {
  return (
    <section id="day" aria-labelledby="day-title" className="page py-20 md:py-28">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 id="day-title" className="text-4xl font-extrabold leading-none tracking-tight md:text-6xl">A day at Little Banyan</h2>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-soft">
            The same rhythm every day, so even the youngest know what comes next. No screens, no homework.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Pic name="montessori" sizes="(min-width: 1024px) 20vw, 50vw" alt="Montessori materials on a shelf: bead bars, colour tablets and a pink tower"
              className="aspect-square w-full rounded-[1.5rem] object-cover" />
            <Pic name="books" sizes="(min-width: 1024px) 20vw, 50vw" alt="A row of colourful children's book spines"
              className="mt-10 aspect-square w-full rounded-[1.5rem] object-cover" />
          </div>
        </div>
        <motion.ol className="relative border-l-[3px] border-dashed border-accent/40 pl-8" variants={listIn} initial="hidden"
          whileInView="show" viewport={{ once: true, margin: "-60px" }}>
          {DAY.map(([t, title, text]) => (
            <motion.li key={t} variants={itemIn} className="relative pb-9 last:pb-0">
              <span className="absolute -left-[2.6rem] top-1 grid h-5 w-5 place-items-center rounded-full bg-accent ring-4 ring-ground" aria-hidden />
              <p className="text-sm font-bold tabular-nums text-accent">{clock(t)}</p>
              <h3 className="mt-1 font-display text-2xl font-bold">{title}</h3>
              <p className="mt-1 max-w-[52ch] text-[17px] leading-relaxed text-soft">{text}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

function Fees() {
  return (
    <section id="fees" aria-labelledby="fees-title" className="bg-tint">
      <div className="page py-20 md:py-24">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <h2 id="fees-title" className="text-4xl font-extrabold leading-none tracking-tight md:text-6xl">Classes and fees, 2027 to 2028</h2>
          <p className="max-w-[40ch] text-[15px] text-soft">Paid in three terms. Admission fee {rupees(12000)}, once. No donation, no capitation, no van.</p>
        </div>
        <div className="mt-10 overflow-x-auto rounded-[1.5rem] bg-ground" tabIndex={0} role="region" aria-label="Classes and fees table">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <caption className="sr-only">Classes, ages, hours and fees</caption>
            <thead className="border-b border-line text-sm text-soft">
              <tr><th scope="col" className="px-6 py-4 font-bold">Class</th><th scope="col" className="px-6 py-4 font-bold">Age on 1 June</th>
                <th scope="col" className="px-6 py-4 font-bold">Hours</th><th scope="col" className="px-6 py-4 text-right font-bold">Fee</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {PROGRAMMES.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="px-6 py-5">
                    <span className="flex items-center gap-3 font-display text-xl font-bold"><span className="h-4 w-4 shrink-0 rounded-full" style={{ background: p.colour }} aria-hidden />{p.name}</span>
                    <span className="mt-0.5 block pl-7 font-normal text-soft">{p.note}</span>
                  </th>
                  <td className="px-6 py-5">{p.age}</td>
                  <td className="px-6 py-5">{p.hours}</td>
                  <td className="px-6 py-5 text-right font-bold tabular-nums">{p.fee}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="px-6 py-5 font-display text-xl font-bold">After-class daycare</th>
                <td className="px-6 py-5">Any class, up to 8 years</td><td className="px-6 py-5">Until 6:30pm</td>
                <td className="px-6 py-5 text-right font-bold tabular-nums">{rupees(8500)} a month</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

const CARE = [
  [ShieldCheck, "Collected only by people you name", "Each child has a pick-up card with up to four photos. Anyone else waits while we call you."],
  [BowlFood, "Cooked here every morning", "Ragi malt, idli, khichdi, fruit. Tell us about allergies and the kitchen keeps a separate plate."],
  [Moon, "A real nap room", "Low cots, fans, a teacher in the room for the whole nap. Bring a sheet from home if it helps."],
  [FirstAid, "Two first-aiders on every shift", "Paediatric first aid refreshed each year; a clinic on 27th Main two minutes away."],
  [BookOpen, "Six to eight children a teacher", "Six in Playgroup and daycare, eight from Nursery up, and an aaya in every room."],
] as const;

function Care() {
  return (
    <section id="care" aria-labelledby="care-title" className="page py-20 md:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
        <div>
          <h2 id="care-title" className="text-4xl font-extrabold leading-none tracking-tight md:text-6xl">What parents ask about first</h2>
          <motion.ul className="mt-10 divide-y divide-line border-y border-line" variants={listIn} initial="hidden" whileInView="show"
            viewport={{ once: true, margin: "-60px" }}>
            {CARE.map(([Icon, title, text]) => (
              <motion.li key={title} variants={itemIn} className="grid grid-cols-[auto_1fr] gap-5 py-6">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-field"><Icon size={26} aria-hidden /></span>
                <div><h3 className="font-display text-2xl font-bold leading-tight">{title}</h3>
                  <p className="mt-1 max-w-[54ch] text-[17px] leading-relaxed text-soft">{text}</p></div>
              </motion.li>
            ))}
          </motion.ul>
        </div>
        <div className="space-y-4 lg:pt-28">
          <Pic name="slide" sizes="(min-width: 1024px) 35vw, 100vw" alt="A yellow slide on a playground climbing frame"
            className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
          <Pic name="insets" sizes="(min-width: 1024px) 35vw, 100vw" alt="A Montessori metal inset tray with a blue square in a pink frame and coloured pencils"
            className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  ["Does my child need to be toilet trained?", "Not for daycare or Playgroup. We help with that, and ask you to send spare clothes and nappies. From Nursery up, we expect most children to be trained."],
  ["Which language do the teachers speak?", "English and Kannada through the day, and Hindi or Telugu when a child needs comfort in the language they know. Rhymes come in all of them."],
  ["Can my child join in the middle of the year?", "Yes, when a seat is free. Fees are charged from the term your child joins."],
  ["Do you have a school van?", "No. Most families live within 3 km and drop off on the way to work. We share a list of parents who are happy to car-pool."],
  ["How will I know how my child's day went?", "A note in the diary every day, a WhatsApp photo or two each week, and a meeting with the class teacher every term."],
  ["Is there an entrance test or interview?", "No test. We meet the family and the child plays in the class for an hour, so you can both see if it suits."],
] as const;

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="border-t border-line">
      <div className="page grid gap-10 py-20 md:py-24 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="faq-title" className="text-4xl font-extrabold leading-none tracking-tight md:text-5xl">Questions</h2>
          <Pic name="book-shelf" sizes="(min-width: 1024px) 30vw, 100vw" alt="Picture books displayed face out on low wooden shelves"
            className="mt-8 hidden aspect-[4/3] w-full rounded-[1.5rem] object-cover object-[50%_20%] lg:block" />
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-2">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-3 font-display text-xl font-bold leading-snug">
                {q}
                <CaretDown size={22} className="shrink-0 transition-transform duration-300 group-open:rotate-180" aria-hidden />
              </summary>
              <p className="max-w-[62ch] pb-5 text-[17px] leading-relaxed text-soft">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------- admissions
function Admissions({ programme, setProgramme }: { programme: string; setProgramme: (id: string) => void }) {
  const days = useMemo(() => openDays(CLOSED_DAY, 12), []);
  const [child, setChild] = useState("");
  const [dob, setDob] = useState("");
  const [parent, setParent] = useState("");
  const [phone, setPhone] = useState("");
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState<number | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const isSaturday = new Date(day + "T00:00:00Z").getUTCDay() === 6;
  const times = isSaturday ? slotsFor(day, 10 * 60, 11 * 60 + 30) : [...slotsFor(day, 10 * 60, 11 * 60 + 30), ...slotsFor(day, 15 * 60, 17 * 60)];
  const today = bengaluruNow().date;
  const picked = PROGRAMMES.find((p) => p.id === programme);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (child.trim().length < 2) next.child = "Write your child's first name.";
    if (!dob || dob > today) next.dob = "Enter your child's date of birth.";
    if (!programme) next.programme = "Choose a class, or use the wall chart above.";
    if (parent.trim().length < 2) next.parent = "Write your name.";
    if (!PHONE.test(phone.trim())) next.phone = "Write a 10-digit Indian mobile number, like 99001 27458.";
    if (time === "" || !times.includes(time)) next.time = times.length ? "Pick a time for the visit." : "No visits left today. Pick another day.";
    setErrors(next);
    if (!Object.keys(next).length) setPreview(true);
  };
  const message = ["Visit request for Little Banyan", `Child: ${child.trim()}, born ${dob ? niceDate(dob) + " " + dob.slice(0, 4) : ""}`,
    `Class for June 2027: ${picked?.name ?? ""}`, `Parent: ${parent.trim()}, ${phone.trim()}`,
    `Visit: ${niceDate(day)}, ${time === "" ? "" : clock(time)}`].join("\n");

  return (
    <section id="admissions" aria-labelledby="admissions-title" className="bg-ink text-ground">
      <div className="page grid gap-12 py-20 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <h2 id="admissions-title" className="text-4xl font-extrabold leading-none tracking-tight md:text-6xl">Come and see a class</h2>
          <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-ground/85">
            Visits are on weekday mornings while classes run, and on weekday afternoons for the daycare. Bring your
            child; there's a tray waiting.
          </p>
          <Pic name="classroom" sizes="(min-width: 1024px) 30vw, 100vw" alt="A bright classroom with low round tables, small chairs and children's art on the walls"
            className="mt-8 aspect-[4/3] w-full rounded-[1.5rem] object-cover" />
        </div>
        <form onSubmit={submit} noValidate className="min-w-0 space-y-5 self-start rounded-[2rem] bg-ground p-6 text-ink md:p-9">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Child's first name" error={errors.child}>
              {(a) => <input {...a} className="input" value={child} onChange={(e) => setChild(e.target.value)} />}
            </Field>
            <Field label="Date of birth" error={errors.dob}>
              {(a) => <input {...a} type="date" max={today} className="input" value={dob} onChange={(e) => {
                setDob(e.target.value);
                if (e.target.value && !programme) { const f = fitFor(e.target.value); if (f.kind === "class") setProgramme(f.programme.id); }
              }} />}
            </Field>
          </div>
          <Field label="Class for June 2027" error={errors.programme} hint="Filled in from the date of birth; change it if you like.">
            {(a) => (
              <select {...a} className="input" value={programme} onChange={(e) => setProgramme(e.target.value)}>
                <option value="">Choose a class</option>
                {PROGRAMMES.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.fee}</option>)}
              </select>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" error={errors.parent}>
              {(a) => <input {...a} className="input" value={parent} onChange={(e) => setParent(e.target.value)} autoComplete="name" />}
            </Field>
            <Field label="Mobile number" error={errors.phone}>
              {(a) => <input {...a} className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" />}
            </Field>
          </div>
          <DayChips days={days} value={day} onChange={(d) => { setDay(d); setTime(""); }} legend="Day of the visit"
            activeClass="bg-accent text-on-accent" idleClass="bg-tint hover:bg-line" />
          <Field label="Time" error={errors.time}>
            {(a) => (
              <select {...a} className="input" value={time} onChange={(e) => setTime(e.target.value ? Number(e.target.value) : "")}>
                <option value="">{times.length ? "Choose a time" : "No visits left today"}</option>
                {times.map((t) => <option key={t} value={t}>{clock(t)}</option>)}
              </select>
            )}
          </Field>
          <button type="submit" className="btn-accent w-full text-lg sm:w-auto sm:px-8">
            <WhatsappLogo size={20} weight="bold" aria-hidden /> Ask for a visit
          </button>
        </form>
      </div>
      <MessagePreview open={preview} onClose={() => setPreview(false)} title="Your visit request is ready" message={message} shop={SHOP} />
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ground/10 bg-ink text-ground">
      <div className="page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="flex items-center gap-3 font-display text-5xl font-extrabold leading-none md:text-7xl">
            <TreeMark className="h-14 w-14 md:h-20 md:w-20" /> Little Banyan
          </p>
          <p className="mt-5 flex items-start gap-3 text-ground/85"><MapPin size={22} className="mt-0.5 shrink-0" aria-hidden />
            Sector 2, HSR Layout, Bengaluru 560102. Classes Mon to Fri; daycare Mon to Sat.</p>
          <p className="mt-3 max-w-[54ch] text-ground/75">
            A demo preschool website by Adithya Baliga, Bengaluru: classes, fees, a class finder and visit requests that
            arrive on the school's WhatsApp.
          </p>
        </div>
        <div className="text-ground/85">
          <Credits credits={credits} note="Classes, fees, timings and the address are sample content for this demo." />
        </div>
      </div>
    </footer>
  );
}
