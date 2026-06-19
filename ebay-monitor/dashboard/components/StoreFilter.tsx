'use client';

import { Archive, Inbox, Search } from 'lucide-react';
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

export function StoreFilter({
  stores,
  storeId,
  status,
  query,
  onStoreChange,
  onStatusChange,
  onQueryChange
}: Props) {
  return (
    <section className="grid gap-3 lg:grid-cols-[220px_1fr_280px]">
      <select
        value={storeId}
        onChange={(event) => onStoreChange(event.target.value)}
        className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-white outline-none transition focus:border-accent"
        aria-label="Filter by store"
      >
        <option value="all">All stores</option>
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>

      <div className="flex h-10 rounded-md border border-border bg-surface p-1">
        {[
          { value: 'all', label: 'All', icon: Inbox },
          { value: 'unread', label: 'Unread', icon: Inbox },
          { value: 'archived', label: 'Archived', icon: Archive }
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

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search buyer or preview"
          className="h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-accent"
        />
      </label>
    </section>
  );
}

