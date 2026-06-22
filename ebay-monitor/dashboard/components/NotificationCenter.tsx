'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { useRealtime } from '@/components/RealtimeProvider';
import { relativeTime } from '@/lib/utils';

export function NotificationCenter() {
  const { notifications, unseenNotifications, markNotificationsSeen, clearNotifications } = useRealtime();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    markNotificationsSeen();

    const handleClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [markNotificationsSeen, open]);

  const openNotification = (messageId?: string) => {
    if (!messageId) return;
    setOpen(false);
    router.push(`/dashboard?message=${encodeURIComponent(messageId)}`);
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative grid h-9 w-9 place-items-center rounded-md text-muted transition hover:bg-panel hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
        aria-label="Open notifications"
      >
        <Bell className="h-4 w-4" />
        {unseenNotifications > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {unseenNotifications > 9 ? '9+' : unseenNotifications}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-card border border-border bg-surface shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-panel px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-foreground">Notifications</div>
              <div className="text-xs text-muted">{notifications.length} recent message alerts</div>
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-surface hover:text-danger"
                  aria-label="Clear notifications"
                  title="Clear notifications"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-surface hover:text-foreground"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length ? (
              <div className="divide-y divide-border/50">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => openNotification(notification.messageId)}
                    disabled={!notification.messageId}
                    className="block w-full p-3 text-left transition hover:bg-panel disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {notification.storeName}
                        </div>
                        <div className="mt-1 text-sm text-soft">New message from {notification.buyer}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{relativeTime(notification.createdAt)}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm text-muted">{notification.preview}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid min-h-[180px] place-items-center p-6 text-center">
                <div>
                  <CheckCheck className="mx-auto h-8 w-8 text-muted" />
                  <div className="mt-3 text-sm font-semibold text-foreground">No notifications yet</div>
                  <p className="mt-1 text-sm text-muted">New message alerts will stay here after the toast disappears.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
