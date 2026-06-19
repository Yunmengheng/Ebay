'use client';

import { Circle, Copy } from 'lucide-react';
import { useRealtime } from '@/components/RealtimeProvider';
import { relativeTime } from '@/lib/utils';

export default function StoresPage() {
  const { stores, messages } = useRealtime();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-white">Stores</h1>
        <p className="mt-1 text-sm text-muted">Chrome profiles reporting into the unified monitor.</p>
      </div>

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        <div className="grid grid-cols-[1fr_120px_140px] border-b border-border px-4 py-3 text-xs uppercase tracking-normal text-muted max-md:hidden">
          <div>Store</div>
          <div>Messages</div>
          <div>Last seen</div>
        </div>

        {stores.map((store) => {
          const storeMessages = messages.filter((message) => message.store_id === store.id);
          const lastMessage = storeMessages[0];
          return (
            <div
              key={store.id}
              className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1fr_120px_140px] md:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Circle
                    className={`h-3 w-3 fill-current ${
                      store.online ? 'animate-pulse text-success' : 'text-danger'
                    }`}
                  />
                  <span className="truncate font-semibold text-white">{store.name}</span>
                </div>
                <button
                  className="mt-2 inline-flex max-w-full items-center gap-2 truncate rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:text-white"
                  onClick={() => navigator.clipboard.writeText(store.id)}
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{store.id}</span>
                </button>
              </div>
              <div className="text-sm text-neutral-300">
                {storeMessages.length}
                {lastMessage ? <span className="block text-xs text-muted">Last: {relativeTime(lastMessage.created_at)}</span> : null}
              </div>
              <div className="text-sm text-neutral-300">{relativeTime(store.last_seen)}</div>
            </div>
          );
        })}

        {!stores.length && <div className="p-8 text-center text-sm text-muted">No stores have connected yet.</div>}
      </section>
    </div>
  );
}

