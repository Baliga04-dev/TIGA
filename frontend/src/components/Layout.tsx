import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import {
  LayoutDashboard,
  Mail,
  Bot,
  Settings,
  Workflow,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Email Bot', href: '/email', icon: Mail },
  { name: 'Tiga Chat', href: '/chat', icon: Bot },
  { name: 'Agents', href: '/agents', icon: Workflow },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className={cn(
          'fixed top-4 left-4 z-50 lg:hidden btn btn-ghost p-2',
          mobileOpen && 'left-64'
        )}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen bg-[var(--bg-secondary)] border-r border-[var(--border-color)] transition-all duration-300 lg:translate-x-0',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        <div className="flex flex-col h-full">
          <div className={cn('p-4 border-b border-[var(--border-color)]', collapsed && 'justify-center')}>
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-blue)] flex items-center justify-center">
                  <Bot size={16} className="text-white" />
                </div>
                <span className="font-bold text-lg">TIGA</span>
              </div>
            )}
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto" role="navigation" aria-label="Main">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href ||
                (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)]',
                    isActive
                      ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
                    collapsed && 'justify-center'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon size={20} aria-hidden="true" />
                  {!collapsed && <span>{item.name}</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className={cn('p-3 border-t border-[var(--border-color)]', collapsed && 'justify-center')}>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn('btn btn-ghost w-full justify-center', collapsed && 'p-2')}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      setDarkMode(saved === 'true');
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <Sidebar />
      <main
        className={cn(
          'lg:ml-64 min-h-screen transition-all duration-300',
          'pb-20'
        )}
        role="main"
      >
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, action }: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{title}</h1>
        {description && (
          <p className="text-[var(--text-secondary)] mt-1">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ title, children, action, className = '' }: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card', className)}>
      {title && (
        <div className="card-header">
          <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}