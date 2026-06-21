'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { connectWebSocket, type ServerEvent } from '@/lib/websocket';
import type { Message, Preferences, Store, Toast } from '@/lib/types';

type RealtimeContextValue = {
  messages: Message[];
  stores: Store[];
  toasts: Toast[];
  preferences: Preferences;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  supabaseStatus: 'connected' | 'connecting' | 'disconnected' | 'setup_required';
  supabaseError: string | null;
  setPreferences: (preferences: Preferences) => void;
  dismissToast: (id: string) => void;
  updateMessageStatus: (id: string, status: Message['status']) => Promise<void>;
  refreshData: () => Promise<void>;
};

const DEFAULT_PREFERENCES: Preferences = {
  desktopNotifications: false,
  toastNotifications: true,
  soundAlerts: true,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
};

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const normalizeMessage = (message: Message): Message => ({
  ...message,
  stores: message.stores || null
});

function playChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.24);
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [supabaseStatus, setSupabaseStatus] =
    useState<'connected' | 'connecting' | 'disconnected' | 'setup_required'>('connecting');
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [preferences, setPreferencesState] = useState<Preferences>(DEFAULT_PREFERENCES);
  const seenMessages = useRef(new Set<string>());
  const preferencesRef = useRef(preferences);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    const saved = window.localStorage.getItem('ebay-monitor-preferences');
    if (saved) {
      setPreferencesState({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
    }
  }, []);

  const setPreferences = useCallback((next: Preferences) => {
    setPreferencesState(next);
    window.localStorage.setItem('ebay-monitor-preferences', JSON.stringify(next));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message: Message) => {
    const storeName = message.stores?.name || stores.find((store) => store.id === message.store_id)?.name || 'eBay';
    const prefs = preferencesRef.current;

    if (prefs.toastNotifications) {
      const toast: Toast = {
        id: `${message.id}-${Date.now()}`,
        storeName,
        buyer: message.buyer,
        preview: message.preview
      };
      setToasts((current) => [toast, ...current].slice(0, 4));
      window.setTimeout(() => dismissToast(toast.id), 5000);
    }

    if (prefs.soundAlerts) playChime();

    if (prefs.desktopNotifications && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`New message from ${message.buyer}`, {
        body: `${storeName}: ${message.preview}`,
        tag: message.id
      });
    }
  }, [dismissToast, stores]);

  const mergeMessage = useCallback((message: Message, shouldNotify = false) => {
    const normalized = normalizeMessage(message);
    setMessages((current) => {
      const exists = current.some((item) => item.id === normalized.id);
      
      if (!exists && !seenMessages.current.has(normalized.id)) {
        seenMessages.current.add(normalized.id);
        if (shouldNotify) {
          setTimeout(() => notify(normalized), 0);
        }
      }

      const next = exists
        ? current.map((item) => (item.id === normalized.id ? { ...item, ...normalized } : item))
        : [normalized, ...current];
      return next
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 500);
    });
  }, [notify]);

  const mergeStore = useCallback((store: Store) => {
    setStores((current) => {
      const exists = current.some((item) => item.id === store.id);
      return exists
        ? current.map((item) => (item.id === store.id ? { ...item, ...store } : item))
        : [store, ...current];
    });
  }, []);

  const refreshData = useCallback(async () => {
    const [{ data: messageData, error: messageError }, { data: storeData, error: storeError }] = await Promise.all([
      supabase
        .from('messages')
        .select('*, stores(name)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('stores').select('*').order('last_seen', { ascending: false })
    ]);

    const error = messageError || storeError;
    if (error) {
      const missingTable = error.code === '42P01' || error.message.toLowerCase().includes('could not find the table');
      setSupabaseStatus(missingTable ? 'setup_required' : 'disconnected');
      setSupabaseError(error.message);
      return;
    }

    setSupabaseError(null);
    setMessages((messageData || []).map(normalizeMessage));
    setStores(storeData || []);
    (messageData || []).forEach((message) => seenMessages.current.add(message.id));
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    const handleEvent = (event: ServerEvent) => {
      if (event.type === 'INIT') {
        setMessages((event.messages || []).map(normalizeMessage));
        setStores(event.stores || []);
        (event.messages || []).forEach((message) => seenMessages.current.add(message.id));
      }

      if (event.type === 'NEW_MESSAGE') {
        const message =
          event.message ||
          (({
            id: event.id,
            store_id: event.storeId,
            buyer: event.buyer,
            subject: event.subject || '',
            preview: event.preview,
            unread: event.unreadCount,
            status: 'unread',
            fingerprint: event.id,
            created_at: event.timestamp,
            stores: { name: event.storeName }
          }) as Message);
        mergeMessage(message, true);
      }

      if (event.type === 'STORE_STATUS') {
        mergeStore({
          id: event.storeId,
          name: event.storeName,
          online: event.online,
          last_seen: event.lastSeen
        });
      }

      if (event.type === 'SYNC_INBOX') {
        const storeId = event.storeId;
        const fingerprints = new Set(event.fingerprints || []);
        setMessages((current) =>
          current.filter(
            (msg) => msg.store_id !== storeId || fingerprints.has(msg.fingerprint)
          )
        );
      }
    };

    return connectWebSocket(preferences.wsUrl, handleEvent, setWsStatus);
  }, [mergeMessage, mergeStore, preferences.wsUrl]);

  useEffect(() => {
    setSupabaseStatus('connecting');
    const messageChannel = supabase
      .channel('dashboard-messages-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setMessages((current) => current.filter((message) => message.id !== payload.old.id));
            return;
          }
          mergeMessage(payload.new as Message, payload.eventType === 'INSERT');
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSupabaseStatus('connected');
          setSupabaseError(null);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSupabaseStatus((current) => (current === 'setup_required' ? current : 'disconnected'));
          return;
        }

        setSupabaseStatus((current) => (current === 'setup_required' ? current : 'connecting'));
      });

    const storeChannel = supabase
      .channel('dashboard-stores-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, (payload) => {
        if (payload.eventType !== 'DELETE') mergeStore(payload.new as Store);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(storeChannel);
    };
  }, [mergeMessage, mergeStore]);

  const updateMessageStatus = useCallback(async (id: string, status: Message['status']) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, status } : message)));
    const { error } = await supabase.from('messages').update({ status }).eq('id', id);
    if (error) {
      await refreshData();
      throw error;
    }
  }, [refreshData]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      messages,
      stores,
      toasts,
      preferences,
      wsStatus,
      supabaseStatus,
      supabaseError,
      setPreferences,
      dismissToast,
      updateMessageStatus,
      refreshData
    }),
    [
      messages,
      stores,
      toasts,
      preferences,
      wsStatus,
      supabaseStatus,
      supabaseError,
      setPreferences,
      dismissToast,
      updateMessageStatus,
      refreshData
    ]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside RealtimeProvider');
  return context;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
