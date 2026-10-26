// Who the demos sell for: every "Get one for your shop" goes to Adithya's WhatsApp.
export const OWNER_WA = "917795052550";
export const OWNER_NAME = "Adithya Baliga";

export function waLink(text: string, number = OWNER_WA): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function rupees(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** The current weekday (0 = Sunday) and minutes since midnight in Bengaluru, whatever the visitor's clock says. */
export function bengaluruNow(at: Date = new Date()): { day: number; minutes: number; date: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit",
      hour12: false, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(at).map((p) => [p.type, p.value]),
  );
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}` };
}

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function niceDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export const PHONE = /^(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

/** The next `count` dates (ISO, Bengaluru) the shop is open, skipping its weekly closed day. */
export function openDays(closedDay: number | null, count: number, from = bengaluruNow().date): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < count; i++) {
    const iso = addDays(from, i);
    if (new Date(iso + "T00:00:00Z").getUTCDay() !== closedDay) out.push(iso);
  }
  return out;
}

/** Half-hour slots from `from` to `to` (minutes); today's slots start an hour from now. */
export function slotsFor(iso: string, from: number, to: number, step = 30): number[] {
  const now = bengaluruNow();
  const out: number[] = [];
  for (let t = from; t <= to; t += step) out.push(t);
  return iso === now.date ? out.filter((t) => t > now.minutes + 60) : out;
}
