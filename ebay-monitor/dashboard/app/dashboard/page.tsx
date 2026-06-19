'use client';

import { useMemo, useState } from 'react';
import { Circle } from 'lucide-react';
import { MessageCard } from '@/components/MessageCard';
import { StatsBar } from '@/components/StatsBar';
import { StoreFilter } from '@/components/StoreFilter';
import { ToastNotification } from '@/components/ToastNotification';
import { useRealtime } from '@/components/RealtimeProvider';

export default function DashboardPage() {
  const { messages, stores, wsStatus, supabaseStatus, supabaseError } = useRealtime();
  const [storeId, setStoreId] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return messages.filter((message) => {
      const storeMatches = storeId === 'all' || message.store_id === storeId;
      const statusMatches = status === 'all' || message.status === status;
      const queryMatches =
        !needle ||
        message.buyer.toLowerCase().includes(needle) ||
        message.preview.toLowerCase().includes(needle) ||
        message.stores?.name?.toLowerCase().includes(needle);
      return storeMatches && statusMatches && queryMatches;
    });
  }, [messages, query, status, storeId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-white">Live inbox feed</h1>
          <p className="mt-1 text-sm text-muted">WebSocket primary updates with Supabase Realtime sync.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <Circle className={`h-2.5 w-2.5 fill-current ${wsStatus === 'connected' ? 'text-success' : 'text-danger'}`} />
            WS {wsStatus}
          </span>
          <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
            <Circle
              className={`h-2.5 w-2.5 fill-current ${
                supabaseStatus === 'connected' ? 'text-success' : 'text-danger'
              }`}
            />
            Supabase {supabaseStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      {supabaseStatus === 'setup_required' && (
        <section className="rounded-card border border-danger/40 bg-danger/10 p-4 text-sm text-red-100">
          <div className="font-semibold text-white">Supabase tables are not ready yet.</div>
          <p className="mt-1 text-red-100/80">
            Run <span className="font-mono">supabase/migrations/001_init.sql</span> in your Supabase SQL editor, then
            refresh this page. Current Supabase response: {supabaseError}
          </p>
        </section>
      )}

      <StatsBar messages={messages} stores={stores} />
      <StoreFilter
        stores={stores}
        storeId={storeId}
        status={status}
        query={query}
        onStoreChange={setStoreId}
        onStatusChange={setStatus}
        onQueryChange={setQuery}
      />

      <section className="space-y-3">
        {filtered.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            store={stores.find((store) => store.id === message.store_id)}
          />
        ))}

        {!filtered.length && (
          <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-muted">
            No messages match the current filters.
          </div>
        )}
      </section>

      <ToastNotification />
    </div>
  );
}
