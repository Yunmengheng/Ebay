'use client';

import { Activity, Inbox, Radio, Store as StoreIcon } from 'lucide-react';
import { startOfTodayIso } from '@/lib/utils';
import type { Message, Store } from '@/lib/types';

type Props = {
  messages: Message[];
  stores: Store[];
};

export function StatsBar({ messages, stores }: Props) {
  const today = startOfTodayIso();
  const todayCount = messages.filter((message) => message.created_at >= today).length;
  const unread = messages.reduce((total, message) => total + (message.status === 'unread' ? message.unread || 1 : 0), 0);
  const onlineStores = stores.filter((store) => store.online).length;
  const countsByStore = messages.reduce<Record<string, number>>((acc, message) => {
    acc[message.store_id] = (acc[message.store_id] || 0) + 1;
    return acc;
  }, {});
  const activeStoreId = Object.entries(countsByStore).sort((a, b) => b[1] - a[1])[0]?.[0];
  const activeStore = stores.find((store) => store.id === activeStoreId)?.name || 'No activity yet';

  const items = [
    { label: 'Messages today', value: todayCount, icon: Inbox },
    { label: 'Most active store', value: activeStore, icon: Activity },
    { label: 'Total unread', value: unread, icon: Radio },
    { label: 'Stores online', value: `${onlineStores}/${stores.length}`, icon: StoreIcon }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-normal text-muted">{item.label}</div>
              <div className="mt-2 truncate text-xl font-semibold text-white">{item.value}</div>
            </div>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-panel text-accent">
              <item.icon className="h-4 w-4" />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

