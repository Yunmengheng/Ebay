'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, Check, ChevronDown, Inbox } from 'lucide-react';
import type { Store } from '@/lib/types';

type Props = {
  stores: Store[];
  storeId: string;
  status: string;
  query: string;
  onStoreChange: (storeId: string) => void;
  onStatusChange: (status: string) => void;
  onQueryChange: (query: string) => void;
};

function StoreDropdown({
  stores,
  storeId,
  onStoreChange,
}: Pick<Props, 'stores' | 'storeId' | 'onStoreChange'>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const selectedLabel =
    storeId === 'all'
      ? 'All stores'
      : stores.find((s) => s.id === storeId)?.name ?? 'All stores';

  const options = [{ id: 'all', name: 'All stores' }, ...stores];

  return (
    // Position relative here — the dropdown list is absolute inside this
    <div ref={containerRef} className="relative h-10">
      {/* Trigger button — fixed size, never changes */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm text-white outline-none transition hover:border-accent focus-visible:border-accent"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-left">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Floating dropdown list — absolutely positioned, never shifts layout */}
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[180px] overflow-hidden rounded-lg border border-border bg-[#1a1d23] shadow-2xl shadow-black/60"
        >
          {options.map((option) => {
            const selected = storeId === option.id;
            return (
              <li
                key={option.id}
                role="option"
                aria-selected={selected}
                onClick={() => { onStoreChange(option.id); setOpen(false); }}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors ${
                  selected
                    ? 'bg-accent/15 text-accent'
                    : 'text-neutral-200 hover:bg-panel hover:text-white'
                }`}
              >
                <span className="truncate">{option.name}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-accent" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function StoreFilter({
  stores,
  storeId,
  status,
  query,
  onStoreChange,
  onStatusChange,
  onQueryChange,
}: Props) {
  return (
    <section className="grid gap-3 lg:grid-cols-[220px_1fr_280px]">
      {/* Custom store dropdown */}
      <StoreDropdown stores={stores} storeId={storeId} onStoreChange={onStoreChange} />

      {/* Status tab buttons */}
      <div className="flex h-10 rounded-md border border-border bg-surface p-1">
        {[
          { value: 'all', label: 'All', icon: Inbox },
          { value: 'unread', label: 'Unread', icon: Inbox },
          { value: 'archived', label: 'Archived', icon: Archive },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => onStatusChange(item.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded px-3 text-sm transition ${
              status === item.value ? 'bg-panel text-white' : 'text-muted hover:text-white'
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <label className="relative block">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search customer name or message..."
          className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-accent"
        />
      </label>
    </section>
  );
}
