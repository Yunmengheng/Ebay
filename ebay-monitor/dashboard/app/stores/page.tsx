'use client';

import { useState } from 'react';
import { AlertTriangle, Circle, Copy, Trash2, X } from 'lucide-react';
import { useRealtime } from '@/components/RealtimeProvider';
import { relativeTime } from '@/lib/utils';
import type { Store } from '@/lib/types';

function DeleteConfirmModal({
  store,
  messageCount,
  onConfirm,
  onCancel,
  isDeleting,
}: {
  store: Store;
  messageCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-red-500/30 bg-[#111216] shadow-2xl animate-slide-in-top">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 border border-red-500/30">
              <Trash2 className="h-4 w-4 text-red-400" />
            </div>
            <h2 className="text-base font-semibold text-white">Remove Store</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md hover:bg-surface text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200/80">
              This action <span className="font-semibold text-yellow-300">cannot be undone</span>. All data for this store will be permanently deleted from the database.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface/50 px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Store name</span>
              <span className="font-semibold text-white truncate max-w-[180px]">{store.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Messages</span>
              <span className="font-semibold text-red-400">{messageCount} will be deleted</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Status</span>
              <span className={`font-semibold ${store.online ? 'text-green-400' : 'text-neutral-400'}`}>
                {store.online ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg border border-border text-sm text-neutral-300 hover:bg-surface hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete Store &amp; All Messages
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StoresPage() {
  const { stores, messages, deleteStore } = useRealtime();
  const [pendingDelete, setPendingDelete] = useState<Store | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteStore(pendingDelete.id);
      setPendingDelete(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete store. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-white">Stores</h1>
        <p className="mt-1 text-sm text-muted">Chrome profiles reporting into the unified monitor.</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-card border border-border bg-surface">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_100px_130px_44px] border-b border-border px-4 py-3 text-xs uppercase tracking-normal text-muted max-md:hidden">
          <div>Store</div>
          <div>Messages</div>
          <div>Last seen</div>
          <div></div>
        </div>

        {stores.map((store) => {
          const storeMessages = messages.filter((m) => m.store_id === store.id);
          const lastMessage = storeMessages[0];
          return (
            <div
              key={store.id}
              className="group grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1fr_100px_130px_44px] md:items-center"
            >
              {/* Store name + ID */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Circle
                    className={`h-3 w-3 fill-current shrink-0 ${
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

              {/* Message count */}
              <div className="text-sm text-neutral-300">
                {storeMessages.length}
                {lastMessage ? (
                  <span className="block text-xs text-muted">Last: {relativeTime(lastMessage.created_at)}</span>
                ) : null}
              </div>

              {/* Last seen */}
              <div className="text-sm text-neutral-300">{relativeTime(store.last_seen)}</div>

              {/* Delete button */}
              <div className="flex items-center justify-end">
                <button
                  onClick={() => { setError(null); setPendingDelete(store); }}
                  title="Remove store and all its messages"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-neutral-600 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}

        {!stores.length && (
          <div className="p-8 text-center text-sm text-muted">No stores have connected yet.</div>
        )}
      </section>

      {/* Confirmation Modal */}
      {pendingDelete && (
        <DeleteConfirmModal
          store={pendingDelete}
          messageCount={messages.filter((m) => m.store_id === pendingDelete.id).length}
          onConfirm={handleDeleteConfirm}
          onCancel={() => !isDeleting && setPendingDelete(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
