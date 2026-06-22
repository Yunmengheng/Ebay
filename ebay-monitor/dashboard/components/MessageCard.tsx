'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Message, Store } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import { useRealtime } from './RealtimeProvider';

type Props = {
  message: Message;
  store?: Store;
  onOpen: (message: Message) => void;
};

export function MessageCard({ message, store, onOpen }: Props) {
  const { updateMessageUrgent } = useRealtime();
  const storeName = store?.name || message.stores?.name || 'Unknown Store';
  const unread = message.status === 'unread';
  const [copied, setCopied] = useState(false);
  const urgent = Boolean(message.urgent);

  useEffect(() => {
    const localUrgent = localStorage.getItem(`urgent-${message.fingerprint}`) === 'true';
    if (localUrgent && !message.urgent) {
      updateMessageUrgent(message.id, true)
        .then(() => localStorage.removeItem(`urgent-${message.fingerprint}`))
        .catch(() => {});
    }
  }, [message.fingerprint, message.id, message.urgent, updateMessageUrgent]);

  const handleCopyBuyer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(message.buyer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleUrgent = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateMessageUrgent(message.id, !urgent).catch(() => {});
  };

  const rowBg = unread
    ? 'bg-blue-100/90 border-l-2 border-blue-600 hover:bg-blue-200/70 shadow-[inset_0_1px_0_rgba(37,99,235,0.16)] dark:bg-[#101826] dark:border-sky-400/90 dark:hover:bg-[#142033] dark:shadow-[inset_0_1px_0_rgba(96,165,250,0.08)]'
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

  // Store badge colors use darker text in light mode for readability, with softer neon tones in dark mode.
  const STORE_BADGE_COLORS = [
    'bg-violet-100 text-violet-800 border-violet-300 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40 dark:ring-violet-500/20',
    'bg-sky-100 text-sky-800 border-sky-300 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/40 dark:ring-sky-500/20',
    'bg-emerald-100 text-emerald-800 border-emerald-300 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 dark:ring-emerald-500/20',
    'bg-orange-100 text-orange-800 border-orange-300 ring-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40 dark:ring-orange-500/20',
    'bg-rose-100 text-rose-800 border-rose-300 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40 dark:ring-rose-500/20',
    'bg-cyan-100 text-cyan-800 border-cyan-300 ring-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40 dark:ring-cyan-500/20',
    'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 ring-fuchsia-200 dark:bg-fuchsia-500/20 dark:text-fuchsia-300 dark:border-fuchsia-500/40 dark:ring-fuchsia-500/20',
    'bg-amber-100 text-amber-900 border-amber-300 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 dark:ring-amber-500/20',
    'bg-lime-100 text-lime-900 border-lime-300 ring-lime-200 dark:bg-lime-500/20 dark:text-lime-300 dark:border-lime-500/40 dark:ring-lime-500/20',
    'bg-teal-100 text-teal-800 border-teal-300 ring-teal-200 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/40 dark:ring-teal-500/20',
  ];

  const buyerName = message.buyer || 'Unknown';
  const initials = buyerName.charAt(0).toUpperCase();
  const avatarClass = AVATAR_COLORS[nameHash(buyerName) % AVATAR_COLORS.length];
  const storeBadgeClass = STORE_BADGE_COLORS[nameHash(storeName) % STORE_BADGE_COLORS.length];
  const primaryTextClass = unread ? 'font-semibold text-slate-950 dark:text-slate-50' : 'font-normal text-muted';
  const previewTextClass = unread ? 'font-medium text-slate-700 dark:text-slate-200' : 'font-normal text-muted';
  const previewArrowClass = unread ? 'font-semibold text-sky-600 dark:text-sky-300/80' : 'font-normal text-muted';

  return (
    <div
      className={`group flex items-start gap-4 px-4 py-3.5 transition-all duration-150 border-b border-border/40 last:border-b-0 cursor-pointer ${rowBg}`}
      onClick={() => onOpen(message)}
    >
      {/* 1. Unread Dot */}
      <div className="flex items-center shrink-0 mt-1.5">
        <div className="w-2.5 h-2.5 flex items-center justify-center shrink-0">
          {unread && (
            <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.16)]" />
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
              className={`text-sm ${primaryTextClass} hover:text-accent transition-colors truncate cursor-pointer`}
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

          {/* Time text / Urgency marker */}
          <div className="shrink-0 min-w-[116px] flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <div className={`${urgent ? 'flex' : 'hidden group-hover:flex'} items-center gap-1`}>
              <button
                type="button"
                onClick={toggleUrgent}
                title={urgent ? 'Marked urgent - click to mark not urgent' : 'Not urgent - click to mark urgent'}
                className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
                  urgent
                    ? 'bg-red-500/15 text-red-500 hover:bg-red-500/20'
                    : 'text-muted hover:bg-panel hover:text-red-500'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </button>
            </div>

            {/* Normal relative time text */}
            <span className="text-xs text-muted whitespace-nowrap">
              {relativeTime(message.created_at)}
            </span>
          </div>
        </div>

        {/* Line 2: Subject/Listing Title */}
        {message.subject && (
          <div className={`text-sm truncate ${primaryTextClass}`}>
            {message.subject}
          </div>
        )}

        {/* Line 3: Message Preview */}
        {message.preview && (
          <div className={`flex items-center gap-1.5 text-xs truncate ${previewTextClass}`}>
            {/* Small curved arrow icon like eBay */}
            <span className={`text-[12px] shrink-0 select-none ${previewArrowClass}`}>↳</span>
            <span className="truncate">{message.preview}</span>
          </div>
        )}
      </div>
    </div>
  );
}
