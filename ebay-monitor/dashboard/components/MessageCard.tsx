'use client';

import { useState, useEffect } from 'react';
import { Archive, GripVertical, Mail, MailOpen, Star, Store as StoreIcon } from 'lucide-react';
import type { Message, Store } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import { useRealtime } from './RealtimeProvider';

type Props = {
  message: Message;
  store?: Store;
  isSelected: boolean;
  onSelectToggle: (id: string) => void;
};

export function MessageCard({ message, store, isSelected, onSelectToggle }: Props) {
  const { updateMessageStatus } = useRealtime();
  const storeName = store?.name || message.stores?.name || 'Unknown Store';
  const unread = message.status === 'unread';
  const [isStarred, setIsStarred] = useState(false);

  useEffect(() => {
    const starred = localStorage.getItem(`starred-${message.id}`) === 'true';
    setIsStarred(starred);
  }, [message.id]);

  const toggleStar = () => {
    const next = !isStarred;
    setIsStarred(next);
    if (next) {
      localStorage.setItem(`starred-${message.id}`, 'true');
    } else {
      localStorage.removeItem(`starred-${message.id}`);
    }
  };

  const rowBg = isSelected
    ? 'bg-accent/15 border-l-2 border-accent'
    : unread
    ? 'bg-panel/70 border-l-2 border-accent/70 hover:bg-panel'
    : 'bg-transparent border-l-2 border-transparent hover:bg-panel/40';

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 sm:py-2 transition-all duration-150 border-b border-border/60 last:border-b-0 cursor-pointer ${rowBg}`}
      onClick={() => onSelectToggle(message.id)}
    >
      {/* 1. Grip Handle (hidden on mobile, visible on desktop hover) */}
      <div className="hidden sm:flex items-center text-neutral-700 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <GripVertical className="h-4 w-3 cursor-grab" />
      </div>

      {/* 2. Checkbox */}
      <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectToggle(message.id)}
          className="h-4 w-4 rounded border-border bg-panel text-accent focus:ring-accent cursor-pointer"
        />
      </div>

      {/* 3. Star Icon */}
      <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={toggleStar} className="text-neutral-500 hover:text-yellow-500 transition-colors">
          <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-500 text-yellow-500' : 'text-neutral-600'}`} />
        </button>
      </div>

      {/* 4. Store Badge */}
      <div className="hidden md:flex items-center shrink-0">
        <span className="inline-flex items-center gap-1 rounded border border-border bg-panel px-1.5 py-0.5 text-[10px] text-neutral-400 font-medium">
          <StoreIcon className="h-3 w-3" />
          <span className="max-w-[70px] truncate">{storeName}</span>
        </span>
      </div>

      {/* 5. Sender / Buyer */}
      <div className={`w-24 sm:w-36 shrink-0 truncate text-sm ${unread ? 'font-semibold text-white' : 'text-neutral-300'}`}>
        {message.buyer}
      </div>

      {/* 6. Subject / Preview */}
      <div className={`flex-1 min-w-0 truncate text-sm ${unread ? 'font-medium text-white' : 'text-neutral-400'}`}>
        {message.preview}
      </div>

      {/* 7. Hover Actions or Time */}
      <div className="shrink-0 pl-2 min-w-[70px] flex justify-end" onClick={(e) => e.stopPropagation()}>
        <div className="hidden group-hover:flex items-center gap-1">
          {/* Toggle Read/Unread */}
          <button
            onClick={() => updateMessageStatus(message.id, unread ? 'read' : 'unread')}
            title={unread ? 'Mark as read' : 'Mark as unread'}
            className="p-1 rounded-md hover:bg-panel text-neutral-400 hover:text-white transition-colors"
          >
            {unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          </button>
          {/* Archive */}
          {message.status !== 'archived' && (
            <button
              onClick={() => updateMessageStatus(message.id, 'archived')}
              title="Archive"
              className="p-1 rounded-md hover:bg-panel text-neutral-400 hover:text-white transition-colors"
            >
              <Archive className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="block group-hover:hidden text-xs text-muted whitespace-nowrap">
          {relativeTime(message.created_at)}
        </div>
      </div>
    </div>
  );
}


