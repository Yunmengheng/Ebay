'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Mail,
  MailOpen,
  NotepadText,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import type { Message, Store } from '@/lib/types';
import { relativeTime } from '@/lib/utils';
import { useRealtime } from './RealtimeProvider';

type Props = {
  message: Message;
  store?: Store;
  onClose: () => void;
};

export function MessageDetailPanel({ message, store, onClose }: Props) {
  const { updateMessageStatus } = useRealtime();
  const storeName = store?.name || message.stores?.name || 'Unknown Store';
  const unread = message.status === 'unread';

  const [note, setNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const noteSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load saved note for this message fingerprint
  useEffect(() => {
    const saved = localStorage.getItem(`note-${message.fingerprint}`);
    setNote(saved || '');
  }, [message.fingerprint]);

  // Auto-save note to localStorage 500ms after user stops typing
  const handleNoteChange = useCallback((val: string) => {
    setNote(val);
    setNoteSaved(false);
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(() => {
      localStorage.setItem(`note-${message.fingerprint}`, val);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 1500);
    }, 500);
  }, [message.fingerprint]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCopyBuyer = async () => {
    await navigator.clipboard.writeText(message.buyer);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleToggleRead = () =>
    updateMessageStatus(message.id, unread ? 'read' : 'unread');

  const handleArchive = () => {
    updateMessageStatus(message.id, 'archived');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch animate-fade-in"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Main panel */}
      <div className="relative flex w-full max-w-5xl mx-auto flex-col rounded-none sm:rounded-2xl overflow-hidden shadow-2xl border border-border/60 bg-[#111216] my-0 sm:my-8 animate-slide-in-top">

        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border/60 bg-panel/60">
          <div className="flex items-center gap-3 min-w-0">
            {/* Store badge */}
            <span className="inline-flex items-center gap-1 rounded border border-border bg-surface px-2 py-0.5 text-[10px] text-neutral-400 font-medium shrink-0">
              <StoreIcon className="h-3 w-3" />
              {storeName}
            </span>
            {/* Buyer name — click to copy */}
            <button
              onClick={handleCopyBuyer}
              title="Click to copy customer name"
              className="group flex items-center gap-1.5 text-base font-semibold text-white hover:text-accent transition-colors truncate"
            >
              <span className="truncate">{message.buyer}</span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-neutral-500 group-hover:text-accent shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
              )}
            </button>
            {/* Unread badge */}
            {unread && (
              <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent border border-accent/30">
                Unread
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleToggleRead}
              title={unread ? 'Mark as read' : 'Mark as unread'}
              className="p-1.5 rounded-md hover:bg-surface text-neutral-400 hover:text-white transition-colors"
            >
              {unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            </button>
            {message.status !== 'archived' && (
              <button
                onClick={handleArchive}
                title="Archive"
                className="p-1.5 rounded-md hover:bg-surface text-neutral-400 hover:text-white transition-colors"
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
            <div className="w-px h-5 bg-border/60 mx-1" />
            <button
              onClick={onClose}
              title="Close (Esc)"
              className="p-1.5 rounded-md hover:bg-surface text-neutral-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body — message left | notes right */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

          {/* Left: Message content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 gap-4">
            {/* Timestamp */}
            <p className="text-xs text-muted">
              {relativeTime(message.created_at)} &mdash;{' '}
              <span className="font-mono">{new Date(message.created_at).toLocaleString()}</span>
            </p>

            {/* Subject line */}
            {message.subject && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-neutral-500 shrink-0 mt-0.5 font-medium uppercase tracking-wide">Subject</span>
                <p className="text-sm font-semibold text-white leading-snug">{message.subject}</p>
              </div>
            )}

            {/* Preview bubble */}
            <div className="rounded-xl border border-border/60 bg-surface/60 px-5 py-4">
              <p className="text-sm leading-relaxed text-neutral-200 whitespace-pre-wrap break-words">
                {message.preview || <span className="text-neutral-500 italic">No preview available</span>}
              </p>
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-border px-2.5 py-1 text-neutral-400 bg-panel">
                Status: <span className="text-white font-medium capitalize">{message.status}</span>
              </span>
              <span className="rounded-md border border-border px-2.5 py-1 text-neutral-400 bg-panel">
                Unread count: <span className="text-white font-medium">{message.unread}</span>
              </span>
              {message.fingerprint && (
                <span className="rounded-md border border-border px-2.5 py-1 text-neutral-400 bg-panel font-mono truncate max-w-xs">
                  ID: {message.fingerprint.slice(0, 16)}…
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px bg-border/50 shrink-0" />
          <div className="md:hidden h-px bg-border/50 shrink-0" />

          {/* Right: Notes panel */}
          <div className="w-full md:w-72 lg:w-80 flex flex-col shrink-0 bg-[#0e1014] p-4 gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <NotepadText className="h-4 w-4 text-accent" />
                Notes
              </div>
              {noteSaved && (
                <span className="text-[10px] text-green-400 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder={`Write notes about ${message.buyer}…`}
              className="flex-1 min-h-[200px] md:min-h-0 resize-none rounded-xl border border-border/60 bg-surface/50 px-3.5 py-3 text-sm text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all leading-relaxed"
            />
            <p className="text-[10px] text-muted">
              Notes are saved locally in your browser.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
