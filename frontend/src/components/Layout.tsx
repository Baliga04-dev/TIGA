import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3, Bot, BookOpen, ClipboardList, Cpu, FileText, Gauge, Inbox, KanbanSquare, Menu, MessageSquare,
  Moon, Send, Settings as SettingsIcon, Sparkles, Sun, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { ReminderWatcher } from './ReminderWatcher';
import { WakeListener } from './WakeListener';

type Item = { name: string; href: string; icon: LucideIcon };

/** Pages grouped by the job they serve, in the order a working day goes. */
const GROUPS: { label: string; items: Item[] }[] = [
  { label: 'Today', items: [
    { name: 'Dashboard', href: '/', icon: Gauge },
    { name: 'Tiga Chat', href: '/chat', icon: MessageSquare },
  ] },
  { label: 'Clients', items: [
    { name: 'Prospects', href: '/prospects', icon: Users },
    { name: 'Outreach', href: '/outreach', icon: Send },
    { name: 'Pipeline', href: '/pipeline', icon: KanbanSquare },
    { name: 'Email Bot', href: '/email', icon: Inbox },
  ] },
  { label: 'Studio', items: [
    { name: 'Prompts', href: '/prompts', icon: Sparkles },
  ] },
  { label: 'System', items: [
    { name: 'Reports', href: '/reports', icon: FileText },
    { name: 'Crew', href: '/crew', icon: ClipboardList },
    { name: 'Agents', href: '/agents', icon: Bot },
    { name: 'AI usage', href: '/usage', icon: Cpu },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ] },
];
const LEARN: Item = { name: 'Learn', href: '/learn', icon: BookOpen };

function Wordmark() {
  return (
    <span className="font-display text-[2.1rem] uppercase leading-none tracking-wide text-mark" aria-label="Tiga">
      Tiga
    </span>
  );
}

function ThemeButton({ theme, toggle }: { theme: 'light' | 'dark'; toggle: () => void }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="btn p-2 text-on-board/80 hover:bg-white/10 hover:text-on-board"
    >
      {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

function NavGroups({ groups, onNavigate }: { groups: typeof GROUPS; onNavigate: () => void }) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="mb-1.5 px-3 text-xs font-medium text-on-board/75">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  end={item.href === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-on-board/10 text-on-board' : 'text-on-board/75 hover:bg-on-board/5 hover:text-on-board',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span aria-hidden="true" className={cn('h-4 w-1 rounded-full', isActive ? 'bg-mark' : 'bg-transparent')} />
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.name}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const [learn, setLearn] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();

  // The Learn page exists only when the owner enabled it; any failure leaves it hidden.
  useEffect(() => {
    api.getFeatures().then((f) => setLearn(f.learn)).catch(() => setLearn(false));
  }, []);
  useEffect(() => setOpen(false), [location.pathname]);

  const groups = learn
    ? GROUPS.map((g) => (g.label === 'Studio' ? { ...g, items: [...g.items, LEARN] } : g))
    : GROUPS;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a
        href="#main"
        className="sr-only rounded bg-sheet px-3 py-2 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      {/* The signboard: Tiga's one loud element. Fixed side panel on large screens, top bar + drawer on phones. */}
      <header className="sticky top-0 z-40 bg-board text-on-board lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:pb-6 lg:pt-6">
          <Wordmark />
          <div className="flex items-center gap-1">
            <ThemeButton theme={theme} toggle={toggle} />
            <button
              type="button"
              className="btn p-2 text-on-board hover:bg-white/10 lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="main-nav"
            >
              {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <nav id="main-nav" aria-label="Main" className={cn('px-2 pb-4 lg:block', open ? 'block' : 'hidden')}>
          <NavGroups groups={groups} onNavigate={() => setOpen(false)} />
        </nav>
        <p className="hidden px-5 pb-6 text-xs text-on-board/75 lg:block">
          <BarChart3 className="mr-1 inline size-3.5" aria-hidden="true" />
          Freelance desk, Bengaluru
        </p>
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 px-5 pb-20 pt-8 outline-none sm:px-8 lg:px-12 lg:pt-10">
        <div className="mx-auto w-full max-w-6xl">
          <Outlet />
        </div>
        <ReminderWatcher />
        <WakeListener />
      </main>
    </div>
  );
}
