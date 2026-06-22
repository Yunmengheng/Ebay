'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Inbox,
  Radio,
  Store as StoreIcon,
  X
} from 'lucide-react';
import { relativeTime, startOfTodayIso } from '@/lib/utils';
import type { Message, Store, StoreLog } from '@/lib/types';

type Props = {
  messages: Message[];
  stores: Store[];
  storeLogs: StoreLog[];
};

const levelStyles: Record<StoreLog['level'], string> = {
  info: 'text-emerald-400',
  success: 'text-sky-400',
  warning: 'text-amber-300',
  error: 'text-red-400'
};

const formatLogTime = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

export function StatsBar({ messages, stores, storeLogs }: Props) {
  const [storeMonitorOpen, setStoreMonitorOpen] = useState(false);
  const [unreadBreakdownOpen, setUnreadBreakdownOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const today = startOfTodayIso();
  const todayCount = messages.filter((message) => message.created_at >= today).length;
  const todayUnreadMessages = messages.filter((message) => message.created_at >= today && message.status === 'unread');
  const unreadToday = todayUnreadMessages.length;
  const onlineStores = stores.filter((store) => store.online).length;
  const offlineStores = stores.filter((store) => !store.online);
  const countsByStore = messages.reduce<Record<string, number>>((acc, message) => {
    acc[message.store_id] = (acc[message.store_id] || 0) + 1;
    return acc;
  }, {});
  const activeStoreId = Object.entries(countsByStore).sort((a, b) => b[1] - a[1])[0]?.[0];
  const activeStore = stores.find((store) => store.id === activeStoreId)?.name || 'No activity yet';

  const items = [
    { label: 'Messages today', value: todayCount, icon: Inbox },
    { label: 'Most active store', value: activeStore, icon: Activity }
  ];
  const hasOfflineStores = offlineStores.length > 0;
  const unreadByStore = useMemo(() => {
    const grouped = todayUnreadMessages.reduce<Record<string, { store: Store | null; messages: Message[] }>>(
      (acc, message) => {
        const store = stores.find((item) => item.id === message.store_id) || null;
        const key = message.store_id;
        if (!acc[key]) {
          acc[key] = { store, messages: [] };
        }
        acc[key].messages.push(message);
        return acc;
      },
      {}
    );

    return Object.entries(grouped)
      .map(([storeId, value]) => ({ storeId, ...value, count: value.messages.length }))
      .sort((a, b) => b.count - a.count);
  }, [stores, todayUnreadMessages]);
  const selectedStore = useMemo(() => {
    if (!stores.length) return null;
    return stores.find((store) => store.id === selectedStoreId) || stores[0];
  }, [selectedStoreId, stores]);
  const selectedLogs = useMemo(
    () => storeLogs.filter((log) => log.storeId === selectedStore?.id),
    [selectedStore?.id, storeLogs]
  );

  const openStoreMonitor = () => {
    setSelectedStoreId((current) => current || stores[0]?.id || null);
    setStoreMonitorOpen(true);
  };

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-card border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-normal text-muted">{item.label}</div>
                <div className="mt-2 truncate text-xl font-semibold text-foreground">{item.value}</div>
              </div>
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-panel text-accent">
                <item.icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setUnreadBreakdownOpen(true)}
          className="rounded-card border border-border bg-surface p-4 text-left transition hover:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-normal text-muted">Unread today</div>
              <div className="mt-2 truncate text-xl font-semibold text-foreground">{unreadToday}</div>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-panel text-accent">
              <Radio className="h-4 w-4" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={openStoreMonitor}
          className={`rounded-card border bg-surface p-4 text-left transition hover:border-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/40 ${
            hasOfflineStores ? 'border-danger/50 bg-danger/5' : 'border-border'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-normal text-muted">Stores online</div>
              <div className={`mt-2 truncate text-xl font-semibold ${hasOfflineStores ? 'text-danger' : 'text-foreground'}`}>
                {onlineStores}/{stores.length}
              </div>
            </div>
            <div
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${
                hasOfflineStores
                  ? 'border-danger/40 bg-danger/10 text-danger'
                  : 'border-border bg-panel text-accent'
              }`}
            >
              {hasOfflineStores ? <AlertTriangle className="h-4 w-4" /> : <StoreIcon className="h-4 w-4" />}
            </div>
          </div>

          <div className="mt-3 border-t border-border/70 pt-3">
            {stores.length === 0 ? (
              <div className="text-xs text-muted">No extensions have connected yet.</div>
            ) : hasOfflineStores ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Extension not working on {offlineStores.length} store{offlineStores.length === 1 ? '' : 's'}
                </div>
                <div className="space-y-1">
                  {offlineStores.slice(0, 3).map((store) => (
                    <div key={store.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-soft">{store.name}</span>
                      <span className="shrink-0 text-muted">
                        {store.last_seen ? relativeTime(store.last_seen) : 'never'}
                      </span>
                    </div>
                  ))}
                </div>
                {offlineStores.length > 3 && (
                  <div className="text-xs text-muted">+{offlineStores.length - 3} more offline</div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All extensions connected
              </div>
            )}
          </div>
        </button>
      </section>

      {unreadBreakdownOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUnreadBreakdownOpen(false);
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-panel px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Unread today</h2>
                <p className="text-xs text-muted">
                  {unreadToday} unread conversation{unreadToday === 1 ? '' : 's'} from today, grouped by store.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUnreadBreakdownOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md border border-border text-soft transition hover:text-foreground"
                aria-label="Close unread breakdown"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4">
              {unreadByStore.length ? (
                <div className="space-y-3">
                  {unreadByStore.map((entry) => (
                    <div key={entry.storeId} className="rounded-md border border-border bg-panel p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">
                            {entry.store?.name || 'Unknown Store'}
                          </div>
                          <div className="mt-1 text-xs text-muted">
                            {entry.messages.length} conversation{entry.messages.length === 1 ? '' : 's'}
                          </div>
                        </div>
                        <div className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-sm font-semibold text-accent">
                          {entry.count}
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        {entry.messages.slice(0, 5).map((message) => (
                          <div key={message.id} className="rounded border border-border/70 bg-surface px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 truncate text-sm font-medium text-foreground">
                                {message.buyer}
                              </div>
                              <div className="shrink-0 text-xs text-muted">{relativeTime(message.created_at)}</div>
                            </div>
                            <div className="mt-1 truncate text-xs text-muted">
                              {message.subject || message.preview || 'No preview available'}
                            </div>
                          </div>
                        ))}
                        {entry.messages.length > 5 && (
                          <div className="text-xs text-muted">+{entry.messages.length - 5} more conversations</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[220px] place-items-center rounded-md border border-dashed border-border bg-panel p-6 text-center">
                  <div>
                    <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                    <div className="mt-3 text-sm font-semibold text-foreground">No unread messages today</div>
                    <p className="mt-1 text-sm text-muted">Today&apos;s unread breakdown will appear here.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {storeMonitorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStoreMonitorOpen(false);
          }}
        >
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border bg-panel px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Store extension monitor</h2>
                <p className="text-xs text-muted">Click a store to see recent extension activity.</p>
              </div>
              <button
                type="button"
                onClick={() => setStoreMonitorOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md border border-border text-soft transition hover:text-foreground"
                aria-label="Close store monitor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
              <div className="min-h-0 overflow-y-auto border-b border-border p-3 md:border-b-0 md:border-r">
                <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted">
                  <span>{stores.length} stores</span>
                  <span>{onlineStores} connected</span>
                </div>
                <div className="space-y-2">
                  {stores.map((store) => {
                    const isSelected = selectedStore?.id === store.id;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => setSelectedStoreId(store.id)}
                        className={`w-full rounded-md border p-3 text-left transition ${
                          isSelected
                            ? 'border-accent/60 bg-accent/10'
                            : 'border-border bg-panel hover:border-accent/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Circle
                            className={`h-2.5 w-2.5 shrink-0 fill-current ${
                              store.online ? 'text-success' : 'text-danger'
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                            {store.name}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                          <span className={store.online ? 'text-success' : 'text-danger'}>
                            {store.online ? 'Connected' : 'Not connected'}
                          </span>
                          <span className="shrink-0 text-muted">
                            {store.last_seen ? relativeTime(store.last_seen) : 'never seen'}
                          </span>
                        </div>
                      </button>
                    );
                  })}

                  {!stores.length && (
                    <div className="rounded-md border border-border bg-panel p-4 text-sm text-muted">
                      No stores have connected yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="border-b border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-foreground">
                        {selectedStore?.name || 'No store selected'}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        Last seen: {selectedStore?.last_seen ? relativeTime(selectedStore.last_seen) : 'never'}
                      </div>
                    </div>
                    {selectedStore && (
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          selectedStore.online
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-danger/30 bg-danger/10 text-danger'
                        }`}
                      >
                        {selectedStore.online ? 'Connected' : 'Not connected'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  {selectedLogs.length ? (
                    <div className="h-full min-h-[320px] overflow-auto rounded-md border border-slate-700 bg-[#202020] p-3 font-mono text-[11px] leading-5 shadow-inner">
                      {selectedLogs.map((log) => (
                        <div key={log.id} className="grid w-full grid-cols-[178px_70px_minmax(120px,190px)_12px_minmax(0,1fr)] gap-2 text-slate-300">
                          <span className="text-slate-400">{formatLogTime(log.timestamp)}</span>
                          <span className={`font-semibold uppercase ${levelStyles[log.level]}`}>{log.level}</span>
                          <span className="truncate text-sky-500">{log.storeName}</span>
                          <span className="text-slate-500">:</span>
                          <span className="min-w-0 break-words text-slate-200">{log.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid h-full min-h-[320px] place-items-center rounded-md border border-slate-700 bg-[#202020] p-6 text-center font-mono">
                      <div>
                        <div className="text-sm font-semibold text-slate-200">No live logs yet</div>
                        <p className="mt-2 max-w-sm text-xs leading-5 text-slate-400">
                          When this extension registers, sends a heartbeat, scans messages, syncs inbox, or disconnects,
                          the activity will appear here.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
