import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../services/api';
import { useTheme } from '../hooks/useTheme';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Email Bot', href: '/email' },
  { name: 'Prospects', href: '/prospects' },
  { name: 'Outreach', href: '/outreach' },
  { name: 'Pipeline', href: '/pipeline' },
  { name: 'Reports', href: '/reports' },
  { name: 'Crew', href: '/crew' },
  { name: 'Prompts', href: '/prompts' },
  { name: 'Tiga Chat', href: '/chat' },
  { name: 'Agents', href: '/agents' },
  { name: 'Settings', href: '/settings' },
];

function ThemeButton({ theme, toggle, className }: { theme: 'light' | 'dark'; toggle: () => void; className?: string }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={cn('btn btn-ghost p-2', className)} onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const [learn, setLearn] = useState(false);
  const { theme, toggle } = useTheme();
  // The Learn tab exists only when the owner enabled it; any failure leaves it hidden.
  useEffect(() => {
    api.getFeatures().then((f) => setLearn(f.learn)).catch(() => setLearn(false));
  }, []);
  const items = learn ? [...navigation, { name: 'Learn', href: '/learn' }] : navigation;

  return (
    <header className="border-b border-rule bg-wash">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-x-6 px-5 pt-4 sm:px-8">
        <div className="flex w-full items-center justify-between pb-3 md:w-auto md:pb-0 md:pr-4">
          <span className="font-serif text-2xl font-semibold tracking-tight">Tiga</span>
          <ThemeButton theme={theme} toggle={toggle} className="ml-auto mr-1 md:hidden" />
          <button
            type="button"
            className="btn btn-ghost p-2 md:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="main-nav"
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>

        <nav
          id="main-nav"
          aria-label="Main"
          className={cn('w-full flex-col gap-1 pb-3 md:flex md:w-auto md:flex-1 md:flex-row md:gap-1 md:pb-0', open ? 'flex' : 'hidden')}
        >
          {items.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'px-4 py-2 text-sm font-medium transition-colors md:rounded-t-lg md:border md:border-b-0 md:-mb-px',
                  isActive
                    ? 'bg-paper text-ink md:border-rule md:pb-2.5'
                    : 'text-ink-2 hover:bg-paper/60 hover:text-ink md:border-transparent',
                )
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
        <ThemeButton theme={theme} toggle={toggle} className="mb-2 hidden md:inline-flex" />
      </div>
    </header>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded bg-sheet px-3 py-2 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 outline-none sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
