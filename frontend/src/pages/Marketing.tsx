import { useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Toast } from '../components/ui';
import { WeekPanel } from './marketing/Week';
import { NetworkPanel } from './marketing/Network';
import { WalkInsPanel } from './marketing/WalkIns';
import { ContactsPanel } from './marketing/Contacts';

const TABS = [
  { id: 'week', label: 'This week' },
  { id: 'network', label: 'My network' },
  { id: 'walk-ins', label: 'Walk-ins' },
  { id: 'contacts', label: 'Contacts' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function Marketing() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === asked) ? (asked as TabId) : 'week';
  const [toast, setToast] = useState<string | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (id: TabId) => setParams(id === 'week' ? {} : { tab: id }, { replace: true });
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : step ? (i + step + TABS.length) % TABS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(TABS[to].id);
    refs.current[to]?.focus();
  };

  return (
    <>
      <PageHeader
        title="Marketing"
        description="Win shops the way they're won: people you know, walk-in visits, and follow-ups only to people who said yes. Tiga prepares and remembers; you talk and press send."
      />
      <div role="tablist" aria-label="Marketing" className="mb-6 flex gap-1 overflow-x-auto border-b border-rule">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => choose(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'border-pen text-ink' : 'border-transparent text-ink-2 hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === 'week' && <WeekPanel onToast={setToast} />}
        {tab === 'network' && <NetworkPanel onToast={setToast} />}
        {tab === 'walk-ins' && <WalkInsPanel onToast={setToast} />}
        {tab === 'contacts' && <ContactsPanel onToast={setToast} />}
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
