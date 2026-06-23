'use client';

import { Suspense, useMemo, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Circle } from 'lucide-react';
import { MessageCard } from '@/components/MessageCard';
import { MessageDetailPanel } from '@/components/MessageDetailPanel';
import { StatsBar } from '@/components/StatsBar';
import { StoreFilter } from '@/components/StoreFilter';
import { ToastNotification } from '@/components/ToastNotification';
import { useRealtime } from '@/components/RealtimeProvider';
import type { Message } from '@/lib/types';

function DashboardContent() {
  const { messages, stores, storeLogs, wsStatus, supabaseStatus, supabaseError } = useRealtime();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [openMessage, setOpenMessage] = useState<Message | null>(null);

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

  // Keep openMessage in sync with latest data (e.g. status changes)
  useEffect(() => {
    if (!openMessage) return;
    const updated = messages.find((m) => m.id === openMessage.id);
    if (updated) setOpenMessage(updated);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const messageId = searchParams.get('message');
    if (!messageId) return;

    const message = messages.find((item) => item.id === messageId);
    if (message) {
      setOpenMessage(message);
    }
  }, [messages, searchParams]);

  const handleOpenMessage = useCallback((message: Message) => {
    setOpenMessage(message);
  }, []);

  const handleCloseMessage = useCallback(() => {
    setOpenMessage(null);
    if (searchParams.get('message')) {
      router.replace('/dashboard', { scroll: false });
    }
  }, [router, searchParams]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">Live inbox feed</h1>
          <p className="mt-1 text-sm text-muted">WebSocket live updates with backend database persistence.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 min-w-[130px] justify-center">
            <Circle className={`h-2.5 w-2.5 fill-current shrink-0 ${wsStatus === 'connected' ? 'text-success' : wsStatus === 'connecting' ? 'text-yellow-400' : 'text-danger'}`} />
            WS {wsStatus}
          </span>
          <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 min-w-[180px] justify-center">
            <Circle
              className={`h-2.5 w-2.5 fill-current shrink-0 ${
                supabaseStatus === 'connected' ? 'text-success' : supabaseStatus === 'connecting' ? 'text-yellow-400' : 'text-danger'
              }`}
            />
            Database {supabaseStatus.replace('_', ' ')}
          </span>
        </div>
      </div>

      <StatsBar messages={messages} stores={stores} storeLogs={storeLogs} />
      <StoreFilter
        stores={stores}
        storeId={storeId}
        status={status}
        query={query}
        onStoreChange={setStoreId}
        onStatusChange={setStatus}
        onQueryChange={setQuery}
      />

      <section className="rounded-card border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-end border-b border-border bg-panel px-3 py-2 h-12">
          <div className="text-xs text-muted pr-2">
            {filtered.length} messages
          </div>
        </div>

        {/* Message rows */}
        <div className="divide-y divide-border/40">
          {filtered.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              store={stores.find((store) => store.id === message.store_id)}
              onOpen={handleOpenMessage}
            />
          ))}

          {!filtered.length && (
            <div className="p-8 text-center text-sm text-muted">
              No messages match the current filters.
            </div>
          )}
        </div>
      </section>

      <ToastNotification />

      {/* Message Detail Panel (fullscreen overlay) */}
      {openMessage && (
        <MessageDetailPanel
          message={openMessage}
          store={stores.find((s) => s.id === openMessage.store_id)}
          onClose={handleCloseMessage}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
