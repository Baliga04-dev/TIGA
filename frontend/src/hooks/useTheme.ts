import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'tiga-theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

/** The effective theme, and a toggle that pins the other one (remembered per browser). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? systemTheme());

  useEffect(() => {
    if (savedTheme()) return;
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    const follow = () => setTheme(query.matches ? 'dark' : 'light');
    query?.addEventListener?.('change', follow);
    return () => query?.removeEventListener?.('change', follow);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Private windows can refuse storage; the theme still applies for this visit.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
