'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ebay-monitor-theme';

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function ThemeInitializer() {
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    applyTheme(saved === 'light' ? 'light' : 'dark');
  }, []);

  return null;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    const next = saved === 'light' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }, []);

  const setNextTheme = (next: Theme) => {
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <div className="inline-flex rounded-md border border-border bg-background p-1">
      {[
        { value: 'dark' as const, label: 'Dark', icon: Moon },
        { value: 'light' as const, label: 'Light', icon: Sun },
      ].map((item) => {
        const selected = theme === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => setNextTheme(item.value)}
            className={`inline-flex h-8 items-center gap-2 rounded px-3 text-sm transition ${
              selected ? 'bg-panel text-foreground shadow-sm' : 'text-muted hover:text-foreground'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
