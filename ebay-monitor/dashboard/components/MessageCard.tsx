'use client';

import { useState, useEffect } from 'react';
import { Archive, Mail, MailOpen, Star } from 'lucide-react';
import type { Message, Store } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import { useRealtime } from './RealtimeProvider';

type Props = {
  message: Message;
  store?: Store;
  isSelected: boolean;
  onSelectToggle: (id: string) => void;
  onOpen: (message: Message) => void;
};

export function MessageCard({ message, store, isSelected, onSelectToggle, onOpen }: Props) {
  const { updateMessageStatus } = useRealtime();
  const storeName = store?.name || message.stores?.name || 'Unknown Store';
  const unread = message.status === 'unread';
  const [isStarred, setIsStarred] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const starred = localStorage.getItem(`starred-${message.id}`) === 'true';
    setIsStarred(starred);
  }, [message.id]);

  const toggleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isStarred;
    setIsStarred(next);
    if (next) {
      localStorage.setItem(`starred-${message.id}`, 'true');
    } else {
      localStorage.removeItem(`starred-${message.id}`);
    }
  };

  const handleCopyBuyer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(message.buyer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const rowBg = isSelected
    ? 'bg-accent/10 border-l-2 border-accent hover:bg-accent/15'
    : unread
      ? 'bg-panel/50 border-l-2 border-accent hover:bg-panel/75'
      : 'bg-transparent border-l-2 border-transparent hover:bg-panel/40';

  // Shared hash function for consistent color assignment
  const nameHash = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  // Avatar circle colors (buyer)
  const AVATAR_COLORS = [
    'bg-red-500/20 text-red-400 border-red-500/30',
    'bg-green-500/20 text-green-400 border-green-500/30',
    'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    'bg-teal-500/20 text-teal-400 border-teal-500/30',
  ];

  // Store badge colors — more vibrant/saturated so they stand out
  const STORE_BADGE_COLORS = [
    'bg-violet-500/20 text-violet-300 border-violet-500/40 ring-violet-500/20',
    'bg-sky-500/20 text-sky-300 border-sky-500/40 ring-sky-500/20',
    'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-emerald-500/20',
    'bg-orange-500/20 text-orange-300 border-orange-500/40 ring-orange-500/20',
    'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-rose-500/20',
    'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 ring-cyan-500/20',
    'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40 ring-fuchsia-500/20',
    'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-amber-500/20',
    'bg-lime-500/20 text-lime-300 border-lime-500/40 ring-lime-500/20',
    'bg-teal-500/20 text-teal-300 border-teal-500/40 ring-teal-500/20',
  ];

  const buyerName = message.buyer || 'Unknown';
  const initials = buyerName.charAt(0).toUpperCase();
  const avatarClass = AVATAR_COLORS[nameHash(buyerName) % AVATAR_COLORS.length];
  const storeBadgeClass = STORE_BADGE_COLORS[nameHash(storeName) % STORE_BADGE_COLORS.length];

  return (
    <div
      className={`group flex items-start gap-4 px-4 py-3.5 transition-all duration-150 border-b border-border/40 last:border-b-0 cursor-pointer ${rowBg}`}
      onClick={() => onOpen(message)}
    >
      {/* 1. Left Selection (Checkbox & Unread Dot) */}
      <div className="flex items-center gap-3 shrink-0 mt-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectToggle(message.id)}
          className="h-4 w-4 rounded border-border bg-panel text-accent focus:ring-accent cursor-pointer"
        />

        {/* Unread Blue Dot */}
        <div className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
          {unread && (
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
          )}
        </div>
      </div>

      {/* 2. Avatar Circle (initials) */}
      <div className="shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm border ${avatarClass}`}>
          {initials}
        </div>
      </div>

      {/* 3. Main Stacked Content Area */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Line 1: Sender Name, Badges, and Date/Time */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              onClick={handleCopyBuyer}
              className={`text-sm ${unread ? 'font-bold text-white' : 'font-semibold text-neutral-200'} hover:text-accent transition-colors truncate cursor-pointer`}
              title="Click to copy customer name"
            >
              {buyerName}
            </span>
            {copied && (
              <span className="text-[10px] text-green-400 shrink-0 font-medium animate-fade-in">Copied!</span>
            )}

            {/* Store Badge — colored per store */}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shrink-0 tracking-wide ring-1 ring-inset ${storeBadgeClass}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80 shrink-0" />
              {storeName}
            </span>
          </div>

          {/* Time text / Hover Action Icons */}
          <div className="shrink-0 min-w-[70px] flex justify-end" onClick={(e) => e.stopPropagation()}>
            {/* Action icons visible on hover */}
            <div className="hidden group-hover:flex items-center gap-1">
              {/* Star toggle */}
              <button
                onClick={toggleStar}
                title={isStarred ? 'Unstar' : 'Star'}
                className="p-1 rounded hover:bg-panel text-neutral-400 hover:text-white transition-colors"
              >
                <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-yellow-500 text-yellow-500' : 'text-neutral-500'}`} />
              </button>

              {/* Read/Unread toggle */}
              <button
                onClick={() => updateMessageStatus(message.id, unread ? 'read' : 'unread')}
                title={unread ? 'Mark as read' : 'Mark as unread'}
                className="p-1 rounded hover:bg-panel text-neutral-400 hover:text-white transition-colors"
              >
                {unread ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              </button>

              {/* Archive button */}
              {message.status !== 'archived' && (
                <button
                  onClick={() => updateMessageStatus(message.id, 'archived')}
                  title="Archive"
                  className="p-1 rounded hover:bg-panel text-neutral-400 hover:text-white transition-colors"
                >
                  <Archive className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Normal relative time text */}
            <span className="block group-hover:hidden text-xs text-muted whitespace-nowrap">
              {relativeTime(message.created_at)}
            </span>
          </div>
        </div>

        {/* Line 2: Subject/Listing Title */}
        {message.subject && (
          <div className={`text-sm truncate ${unread ? 'font-medium text-neutral-100' : 'text-neutral-400'}`}>
            {message.subject}
          </div>
        )}

        {/* Line 3: Message Preview */}
        {message.preview && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 truncate">
            {/* Small curved arrow icon like eBay */}
            <span className="text-[12px] font-bold text-neutral-600 shrink-0 select-none">↳</span>
            <span className="truncate">{message.preview}</span>
          </div>
        )}
      </div>
    </div>
  );
}
