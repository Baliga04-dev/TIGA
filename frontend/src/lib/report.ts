/**
 * Tiga's reports are plain text, so they still read well in an email. This turns that text into blocks the Reports
 * page can lay out: headed sections, figures ("Sent today: 0 of 5"), open issues, test checks and R&D proposals
 * with their Why / Benefit / First step / Sources. Anything it doesn't recognise stays a paragraph, so nothing is lost.
 */

export type Stat = { label: string; value: string };
export type IssueLine = { id: number; title: string; status: string; times: number };
export type Check = { ok: boolean; name: string; detail: string };
export type Proposal = { title: string; tags: string[]; summary: string; fields: Stat[]; sources: string[] };

export type Block =
  | { type: 'stats'; items: Stat[] }
  | { type: 'issues'; items: IssueLine[] }
  | { type: 'checks'; items: Check[] }
  | { type: 'proposals'; items: Proposal[] }
  | { type: 'list'; items: string[] }
  | { type: 'text'; text: string };

export type Section = { heading: string; blocks: Block[] };
export type ParsedReport = { title: string; status: '' | 'red' | 'amber' | 'green'; statusNote: string; sections: Section[] };

/** Report kinds as stored (`weekly` and `research` are both the R&D bot's) and how the page groups them. */
export const REPORT_GROUPS = [
  { id: 'daily', label: 'Daily', kinds: ['daily'] },
  { id: 'rnd', label: 'Research', kinds: ['weekly', 'research'] },
  { id: 'marketing', label: 'Marketing', kinds: ['marketing'] },
] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number]['id'];

export function groupOf(kind: string): ReportGroup | null {
  return REPORT_GROUPS.find((g) => (g.kinds as readonly string[]).includes(kind))?.id ?? null;
}

/** "2026-11-10" -> "Tue 10 Nov"; "2026-W46" -> "Week 46". */
export function reportDate(value: string): string {
  const week = /^\d{4}-W(\d{2})$/.exec(value);
  if (week) return `Week ${Number(week[1])}`;
  const day = new Date(`${value}T12:00:00`);
  return Number.isNaN(day.getTime()) ? value : day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

const HEADING = /^[A-Z][A-Z0-9 '&/(),.:-]{2,}$/;
const TITLED = /^([A-Z][A-Z '&]{2,}):\s+([a-z].+)$/;
const STAT = /^([A-Z][^:]{1,40}):\s+(.+)$/;
const ISSUE = /^#(\d+)\s+(.+?)\s+\[([a-z_]+)\]\s+x(\d+)$/;
const CHECK = /^(ok|FAIL|fail)\s+([\w.-]+):\s*(.*)$/;
const PROPOSAL = /^\[([^\]]+)\]\s+(.+)$/;
const FIELD = /^(Why|Benefit|First step|Sources):\s*(.*)$/;
const URL = /https?:\/\/[^\s,]+/g;

/** Words that keep their own case in a heading ("R&D", "GBP"); everything else becomes sentence case. */
function sentenceCase(heading: string): string {
  const keep = new Set(['R&D', 'GBP', 'SEO', 'AI', 'UPI', 'GST', 'OK']);
  const words = heading.trim().split(/\s+/).map((w) => (keep.has(w) ? w : w.toLowerCase()));
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function push(blocks: Block[], type: Block['type'], item: unknown) {
  const last = blocks[blocks.length - 1];
  if (last && last.type === type && 'items' in last) (last.items as unknown[]).push(item);
  else blocks.push(type === 'text' ? { type, text: item as string } : ({ type, items: [item] } as Block));
}

export function parseReport(body: string): ParsedReport {
  const lines = body.replace(/\r/g, '').split('\n');
  const out: ParsedReport = { title: '', status: '', statusNote: '', sections: [] };
  let section: Section = { heading: '', blocks: [] };
  const start = lines.findIndex((l) => l.trim());
  if (start >= 0) out.title = lines[start].trim();

  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;
    const status = /^Status:\s*(RED|AMBER|GREEN)\b\s*(?:\((.*)\))?/i.exec(line);
    if (status) {
      out.status = status[1].toLowerCase() as ParsedReport['status'];
      out.statusNote = status[2] ?? '';
      continue;
    }
    const titled = TITLED.exec(line);   // "CHANNELS: tries and results, last 7 days / last 4 weeks"
    if ((HEADING.test(line) && /[A-Z]{3}/.test(line)) || titled) {
      if (section.heading || section.blocks.length) out.sections.push(section);
      section = { heading: titled ? `${sentenceCase(titled[1])}: ${titled[2]}` : sentenceCase(line.replace(/:$/, '')), blocks: [] };
      continue;
    }
    const blocks = section.blocks;
    const issue = ISSUE.exec(line);
    if (issue) {
      push(blocks, 'issues', { id: Number(issue[1]), title: issue[2], status: issue[3], times: Number(issue[4]) });
      continue;
    }
    const check = CHECK.exec(line);
    if (check && raw.startsWith(' ')) {
      push(blocks, 'checks', { ok: check[1] === 'ok', name: check[2].replace(/_/g, ' '), detail: check[3] });
      continue;
    }
    if (line.startsWith('- ')) {
      const item = line.slice(2);
      const prop = PROPOSAL.exec(item);
      if (prop) {
        const tags = prop[1].split(',').map((t) => t.trim()).filter(Boolean);
        const [title, ...rest] = tags[0] === 'numbers' ? prop[2].split(/:\s(.+)/) : [prop[2]];
        const proposal: Proposal = { title, tags, summary: rest.filter(Boolean).join(' '), fields: [], sources: [] };
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
          const field = FIELD.exec(lines[++i].trim());
          if (!field) continue;
          if (field[1] === 'Sources') proposal.sources = field[2].match(URL) ?? [];
          else proposal.fields.push({ label: field[1], value: field[2] });
        }
        push(blocks, 'proposals', proposal);
      } else {
        push(blocks, 'list', item);
      }
      continue;
    }
    // "Sent this week: 0; replies 0 (0 interested); drafts waiting for you: 47" is several figures on one line
    if (!section.heading && /^[A-Z][^:]+:\s*\d/.test(line) && line.includes(';')) {
      for (const part of line.split(';')) {
        const m = /^\s*([^:\d]+?)[:\s]\s*(\d.*)$/.exec(part);
        if (m) push(blocks, 'stats', { label: m[1].charAt(0).toUpperCase() + m[1].slice(1).trim(), value: m[2].trim() });
      }
      continue;
    }
    const stat = STAT.exec(line);
    if (stat && stat[2].length <= 90 && !/[.!?]$/.test(stat[2].trim())) {
      push(blocks, 'stats', { label: stat[1], value: stat[2] });
      continue;
    }
    push(blocks, 'text', line);
  }
  if (section.heading || section.blocks.length) out.sections.push(section);
  return out;
}
