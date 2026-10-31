import { motion } from "framer-motion";
import { ArrowUpRight, Check, WhatsappLogo } from "@phosphor-icons/react";
import { waLink } from "../shared/site";
import { Magnetic, itemIn, listIn, spring } from "../shared/ui";

const BASE = import.meta.env.BASE_URL;

const DEMOS = [
  { slug: "malnad-table", name: "Malnad Table", kind: "Restaurant, Malleshwaram",
    line: "A menu customers order from: dishes land on a banana leaf, and the leaf goes to the kitchen as one WhatsApp message.",
    tries: ["Build an order and pick a pickup time", "Book a table for tonight", "See whether it's open right now"] },
  { slug: "navilu-boutique", name: "Navilu", kind: "Saree shop, Jayanagar",
    line: "A catalogue of handloom sarees with filters, and a trial shelf: keep four aside and come in to try them on.",
    tries: ["Filter by weave, occasion and price", "Keep sarees aside for a trial", "Book a blouse fitting"] },
  { slug: "little-banyan", name: "Little Banyan", kind: "Preschool and daycare, HSR Layout",
    line: "Parents enter a birthday and a wall chart shows the class for June 2027, the hours and the fee.",
    tries: ["Find a child's class from the birthday", "Read a day at the school, hour by hour", "Ask for a visit"] },
  { slug: "mallige-salon", name: "Mallige", kind: "Unisex salon, Indiranagar",
    line: "Prices with how long each takes, and booking that only offers times the stylist is free for the whole visit.",
    tries: ["Add services and watch the time add up", "Pick a stylist and a free slot", "Request it on WhatsApp"] },
  { slug: "sampige-residency", name: "Sampige Residency", kind: "Small hotel, Basavanagudi",
    line: "Prices for any dates, with weekend rates, extra beds and GST worked out, and rooms that are full say so.",
    tries: ["Pick dates and guests for a live price", "Request a room on WhatsApp", "Walk the neighbourhood list"] },
];

const INCLUDED = [
  "Your own domain, registered in your name, with the logins handed to you",
  "Orders, bookings and enquiries straight to the WhatsApp you already use",
  "No commission on orders and no auto-debit: one price, paid when the site is live",
  "Fast on a basic Android phone and slow mobile data",
  "Your real photos, prices and hours, in English and Kannada if you want both",
  "Linked from your Google Business Profile, so people searching for you find it",
];

export default function App() {
  return (
    <div className="min-h-[100dvh]">
      <header className="page flex h-20 items-center justify-between gap-6">
        <a href="/" className="font-semibold tracking-tight">Adithya Baliga</a>
        <a href="/" className="text-[15px] text-soft underline-offset-8 hover:text-ink hover:underline">Back to the portfolio</a>
      </header>
      <main>
        <section className="page grid gap-10 pb-16 pt-10 md:pt-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <h1 className="max-w-[14ch] text-5xl font-semibold leading-[0.98] tracking-tighter md:text-7xl">Five shop websites you can try</h1>
            <p className="mt-7 max-w-[54ch] text-lg leading-relaxed text-soft md:text-xl">
              Each is a complete website for one kind of Bengaluru shop, built around the thing its customers do most.
              Yours would carry your shop's name, photos, prices and WhatsApp number.
            </p>
          </motion.div>
          <motion.div className="flex flex-wrap gap-3 lg:justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...spring, delay: 0.15 }}>
            <Magnetic>
              <a className="btn-accent px-6 text-lg" href={waLink("Hi Adithya, I saw your demo websites. I'd like one for my shop.")} target="_blank" rel="noreferrer">
                <WhatsappLogo size={20} weight="bold" aria-hidden /> Get one for your shop
              </a>
            </Magnetic>
          </motion.div>
        </section>

        <motion.ol className="page space-y-24 py-16 md:space-y-32" variants={listIn} initial="hidden" animate="show" aria-label="Demo websites">
          {DEMOS.map((d, i) => (
            <motion.li key={d.slug} variants={itemIn} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <a href={`${BASE}${d.slug}/`} className={`group relative block lg:col-span-7 ${i % 2 ? "lg:order-2" : ""}`} aria-label={`Open the ${d.name} demo`}>
                <img src={`${BASE}img/hub/${d.slug}-desk.webp`} width={1200} height={750} loading={i ? "lazy" : "eager"} decoding="async" alt=""
                  className="w-full rounded-[1.5rem] border border-line transition-transform duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1" />
                <img src={`${BASE}img/hub/${d.slug}-phone.webp`} width={390} height={760} loading="lazy" decoding="async" alt=""
                  className={`absolute -bottom-8 hidden w-[22%] rounded-[1.4rem] border-4 border-field shadow-[0_24px_50px_-20px_rgb(0_0_0/0.8)] sm:block ${i % 2 ? "-left-4" : "-right-4"}`} />
              </a>
              <div className={`lg:col-span-5 ${i % 2 ? "lg:order-1" : ""}`}>
                <p className="text-[15px] text-soft">{d.kind}</p>
                <h2 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{d.name}</h2>
                <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-soft">{d.line}</p>
                <ul className="mt-6 space-y-2 text-[15px]">
                  {d.tries.map((t) => <li key={t} className="flex items-start gap-3"><Check size={18} className="mt-0.5 shrink-0 text-[rgb(var(--focus))]" aria-hidden />{t}</li>)}
                </ul>
                <a href={`${BASE}${d.slug}/`} className="btn mt-8 border border-ink/25 px-6 hover:bg-ink/[0.06]">
                  Open the demo <ArrowUpRight size={18} aria-hidden />
                </a>
              </div>
            </motion.li>
          ))}
        </motion.ol>

        <section aria-labelledby="included-title" className="border-t border-line">
          <div className="page grid gap-10 py-20 md:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <h2 id="included-title" className="text-4xl font-semibold tracking-tight md:text-5xl">What every site comes with</h2>
              <p className="mt-5 max-w-[42ch] text-lg text-soft">No leads promised, no lock-in. A website that belongs to you and works on the phones your customers carry.</p>
            </div>
            <ul className="divide-y divide-line border-y border-line">
              {INCLUDED.map((t) => <li key={t} className="flex items-start gap-4 py-5 text-lg"><Check size={22} className="mt-1 shrink-0 text-[rgb(var(--focus))]" aria-hidden />{t}</li>)}
            </ul>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="page flex flex-col gap-4 py-10 text-[15px] text-soft md:flex-row md:items-center md:justify-between">
          <p>The five shops are made up for these demos. Photos are from Wikimedia Commons; each demo credits them in its footer.</p>
          <a href={waLink("Hi Adithya, I saw your demo websites. I'd like one for my shop.")} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 font-medium text-ink underline underline-offset-4">
            <WhatsappLogo size={18} weight="bold" aria-hidden /> WhatsApp Adithya
          </a>
        </div>
      </footer>
    </div>
  );
}
