'use client';

import { X } from 'lucide-react';
import { useRealtime } from './RealtimeProvider';

export function ToastNotification() {
  const { toasts, dismissToast } = useRealtime();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in rounded-card border border-border bg-panel p-4 shadow-2xl shadow-black/30"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{toast.storeName}</div>
              <div className="mt-1 text-sm text-neutral-200">New message from {toast.buyer}</div>
              <div className="mt-1 line-clamp-2 text-sm text-muted">{toast.preview}</div>
            </div>
            <button
              className="rounded-md p-1 text-muted transition hover:bg-surface hover:text-white"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

