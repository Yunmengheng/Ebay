'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Archive, Circle, Mail, MailOpen } from 'lucide-react';
import { MessageCard } from '@/components/MessageCard';
import { MessageDetailPanel } from '@/components/MessageDetailPanel';
import { StatsBar } from '@/components/StatsBar';
import { StoreFilter } from '@/components/StoreFilter';
import { ToastNotification } from '@/components/ToastNotification';
import { useRealtime } from '@/components/RealtimeProvider';
import type { Message } from '@/lib/types';

export default function DashboardPage() {
  const { messages, stores, wsStatus, supabaseStatus, supabaseError, updateMessageStatus } = useRealtime();
  const [storeId, setStoreId] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMessage, setOpenMessage] = useState<Message | null>(null);

  const masterCheckboxRef = useRef<HTMLInputElement>(null);

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

  // Clear selections that are no longer visible due to filters
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of next) {
        if (!filtered.some((msg) => msg.id === id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  // Keep openMessage in sync with latest data (e.g. status changes)
  useEffect(() => {
    if (!openMessage) return;
    const updated = messages.find((m) => m.id === openMessage.id);
    if (updated) setOpenMessage(updated);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const allVisibleSelected = filtered.length > 0 && filtered.every((msg) => selectedIds.has(msg.id));
  const someVisibleSelected = filtered.length > 0 && filtered.some((msg) => selectedIds.has(msg.id)) && !allVisibleSelected;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const handleSelectToggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllToggle = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((msg) => next.delete(msg.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((msg) => next.add(msg.id));
        return next;
      });
    }
  };

  const handleBulkAction = async (action: 'read' | 'unread' | 'archived') => {
    const idsToUpdate = Array.from(selectedIds).filter((id) =>
      filtered.some((msg) => msg.id === id)
    );
    if (idsToUpdate.length === 0) return;

    try {
      await Promise.all(idsToUpdate.map((id) => updateMessageStatus(id, action)));
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Failed to perform bulk action:', err);
    }
  };

  const handleOpenMessage = useCallback((message: Message) => {
    setOpenMessage(message);
  }, []);

  const handleCloseMessage = useCallback(() => {
    setOpenMessage(null);
  }, []);

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

      <section className="rounded-card border border-border bg-surface overflow-hidden">
        {/* Gmail-style Action Bar */}
        <div className="flex items-center justify-between border-b border-border bg-panel px-3 py-2 h-12">
          <div className="flex items-center gap-3">
            <div className="flex items-center pl-1 sm:pl-3">
              <input
                ref={masterCheckboxRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={handleSelectAllToggle}
                className="h-4 w-4 rounded border-border bg-surface text-accent focus:ring-accent cursor-pointer"
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1 sm:gap-2 animate-slide-in-top">
                <span className="text-xs text-muted font-medium pr-1 sm:pr-2">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => handleBulkAction('read')}
                  title="Mark as read"
                  className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface text-neutral-300 hover:text-white transition text-xs font-medium"
                >
                  <MailOpen className="h-4 w-4 text-neutral-400" />
                  <span className="hidden sm:inline">Mark read</span>
                </button>
                <button
                  onClick={() => handleBulkAction('unread')}
                  title="Mark as unread"
                  className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface text-neutral-300 hover:text-white transition text-xs font-medium"
                >
                  <Mail className="h-4 w-4 text-neutral-400" />
                  <span className="hidden sm:inline">Mark unread</span>
                </button>
                <button
                  onClick={() => handleBulkAction('archived')}
                  title="Archive"
                  className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface text-neutral-300 hover:text-white transition text-xs font-medium"
                >
                  <Archive className="h-4 w-4 text-neutral-400" />
                  <span className="hidden sm:inline">Archive</span>
                </button>
              </div>
            )}
          </div>

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
              isSelected={selectedIds.has(message.id)}
              onSelectToggle={handleSelectToggle}
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
