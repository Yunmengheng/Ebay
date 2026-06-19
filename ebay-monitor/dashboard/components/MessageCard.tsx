'use client';

import { Archive, Check, Store as StoreIcon } from 'lucide-react';
import type { Message, Store } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import { useRealtime } from './RealtimeProvider';

type Props = {
  message: Message;
  store?: Store;
};

export function MessageCard({ message, store }: Props) {
  const { updateMessageStatus } = useRealtime();
  const storeName = message.stores?.name || store?.name || 'Unknown Store';
  const unread = message.status === 'unread';

  return (
    <article
      className={`animate-slide-in-top rounded-card border bg-surface p-4 transition hover:-translate-y-px hover:bg-panel ${
        unread ? 'border-accent/70' : 'border-border'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {unread && (
              <span className="rounded-badge bg-accent px-2 py-1 text-xs font-semibold uppercase tracking-normal text-white">
                Unread
              </span>
            )}
            <span className="inline-flex min-w-0 items-center gap-1 rounded-badge border border-border px-2 py-1 text-xs text-neutral-300">
              <StoreIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{storeName}</span>
            </span>
          </div>

          <h3 className="mt-3 truncate text-base font-semibold text-white">Buyer: {message.buyer}</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-300">{message.preview}</p>
          <div className="mt-3 text-xs text-muted">{relativeTime(message.created_at)}</div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {message.status !== 'read' && (
            <button
              onClick={() => updateMessageStatus(message.id, 'read')}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-neutral-200 transition hover:border-accent hover:text-white"
            >
              <Check className="h-4 w-4" />
              Mark read
            </button>
          )}
          {message.status !== 'archived' && (
            <button
              onClick={() => updateMessageStatus(message.id, 'archived')}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-neutral-200 transition hover:border-accent hover:text-white"
            >
              <Archive className="h-4 w-4" />
              Archive
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

