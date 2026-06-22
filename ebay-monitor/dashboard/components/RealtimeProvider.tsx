'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { connectWebSocket, type ServerEvent } from '@/lib/websocket';
import type { Message, NotificationItem, Preferences, Store, StoreLog, SystemLog, Toast } from '@/lib/types';

type RealtimeContextValue = {
  messages: Message[];
  stores: Store[];
  storeLogs: StoreLog[];
  systemLogs: SystemLog[];
  notifications: NotificationItem[];
  unseenNotifications: number;
  toasts: Toast[];
  preferences: Preferences;
  wsStatus: 'connected' | 'connecting' | 'disconnected';
  supabaseStatus: 'connected' | 'connecting' | 'disconnected' | 'setup_required';
  supabaseError: string | null;
  setPreferences: (preferences: Preferences) => void;
  dismissToast: (id: string) => void;
  markNotificationsSeen: () => void;
  clearNotifications: () => void;
  updateMessageStatus: (id: string, status: Message['status']) => Promise<void>;
  updateMessageNote: (id: string, note: string) => Promise<void>;
  updateMessageUrgent: (id: string, urgent: boolean) => Promise<void>;
  deleteStore: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
};

const DEFAULT_PREFERENCES: Preferences = {
  desktopNotifications: false,
  toastNotifications: true,
  soundAlerts: true,
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'wss://ebay-message-monitor-backend.onrender.com'
};

const NOTIFICATION_RECENCY_WINDOW_MS = 30 * 60 * 1000;

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
  const [storeLogs, setStoreLogs] = useState<StoreLog[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unseenNotifications, setUnseenNotifications] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
  const [supabaseStatus, setSupabaseStatus] =
    useState<'connected' | 'connecting' | 'disconnected' | 'setup_required'>('connecting');
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const [preferences, setPreferencesState] = useState<Preferences>(DEFAULT_PREFERENCES);
  const seenMessages = useRef(new Set<string>());
  const preferencesRef = useRef(preferences);
  const wsDisconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    const saved = window.localStorage.getItem('ebay-monitor-preferences');
    if (saved) {
      setPreferencesState({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
    }

    const savedNotifications = window.localStorage.getItem('ebay-monitor-notifications');
    if (savedNotifications) {
      const cutoff = Date.now() - NOTIFICATION_RECENCY_WINDOW_MS;
      const parsed = (JSON.parse(savedNotifications) as NotificationItem[])
        .filter((notification) => {
          const timestamp = new Date(notification.messageCreatedAt || notification.createdAt).getTime();
          return !Number.isNaN(timestamp) && timestamp >= cutoff;
        })
        .sort((a, b) =>
          new Date(b.messageCreatedAt || b.createdAt).getTime() -
          new Date(a.messageCreatedAt || a.createdAt).getTime()
        );
      setNotifications(parsed);
      window.localStorage.setItem('ebay-monitor-notifications', JSON.stringify(parsed));
    }

    const savedUnseen = window.localStorage.getItem('ebay-monitor-unseen-notifications');
    if (savedUnseen) {
      setUnseenNotifications(Number(savedUnseen) || 0);
    }
  }, []);

  const setPreferences = useCallback((next: Preferences) => {
    setPreferencesState(next);
    window.localStorage.setItem('ebay-monitor-preferences', JSON.stringify(next));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const saveNotifications = useCallback((next: NotificationItem[]) => {
    window.localStorage.setItem('ebay-monitor-notifications', JSON.stringify(next));
  }, []);

  const markNotificationsSeen = useCallback(() => {
    setUnseenNotifications(0);
    window.localStorage.setItem('ebay-monitor-unseen-notifications', '0');
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnseenNotifications(0);
    window.localStorage.setItem('ebay-monitor-notifications', '[]');
    window.localStorage.setItem('ebay-monitor-unseen-notifications', '0');
  }, []);

  const notify = useCallback((message: Message) => {
    const storeName = message.stores?.name || stores.find((store) => store.id === message.store_id)?.name || 'eBay';
    const prefs = preferencesRef.current;
    const messageCreatedAt = message.created_at || new Date().toISOString();
    const messageTime = new Date(messageCreatedAt).getTime();

    if (Number.isNaN(messageTime) || Date.now() - messageTime > NOTIFICATION_RECENCY_WINDOW_MS) {
      return;
    }

    const notification: NotificationItem = {
      id: `${message.id}-${Date.now()}`,
      messageId: message.id,
      storeName,
      buyer: message.buyer,
      preview: message.preview,
      createdAt: new Date().toISOString(),
      messageCreatedAt
    };

    setNotifications((current) => {
      const next = [
        notification,
        ...current.filter((item) => item.messageId !== message.id)
      ]
        .sort((a, b) =>
          new Date(b.messageCreatedAt || b.createdAt).getTime() -
          new Date(a.messageCreatedAt || a.createdAt).getTime()
        )
        .slice(0, 100);
      saveNotifications(next);
      return next;
    });
    setUnseenNotifications((current) => {
      const next = Math.min(current + 1, 99);
      window.localStorage.setItem('ebay-monitor-unseen-notifications', String(next));
      return next;
    });

    if (prefs.toastNotifications) {
      const toast: Toast = {
        id: notification.id,
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
  }, [dismissToast, saveNotifications, stores]);

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
      const next = exists
        ? current.map((item) => (item.id === store.id ? { ...item, ...store } : item))
        : [...current, store];
      // Always keep stores sorted alphabetically so the dropdown never reorders
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const addStoreLog = useCallback((log: StoreLog) => {
    setStoreLogs((current) => [log, ...current].slice(0, 300));
  }, []);

  const addSystemLog = useCallback((
    source: SystemLog['source'],
    level: SystemLog['level'],
    message: string
  ) => {
    const timestamp = new Date().toISOString();
    setSystemLogs((current) => [
      {
        id: `${source}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
        source,
        level,
        message,
        timestamp
      },
      ...current
    ].slice(0, 400));
  }, []);

  const refreshData = useCallback(async () => {
    addSystemLog('supabase', 'info', 'Fetching initial messages and stores from Supabase');
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
      addSystemLog('supabase', 'error', `Initial fetch failed: ${error.message}`);
      return;
    }

    setSupabaseError(null);
    setMessages((messageData || []).map(normalizeMessage));
    setStores((storeData || []).slice().sort((a, b) => a.name.localeCompare(b.name)));
    (messageData || []).forEach((message) => seenMessages.current.add(message.id));
    addSystemLog('supabase', 'success', `Initial fetch completed: ${(messageData || []).length} messages, ${(storeData || []).length} stores`);
  }, [addSystemLog]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    const handleEvent = (event: ServerEvent) => {
      if (event.type === 'INIT') {
        setMessages((event.messages || []).map(normalizeMessage));
        setStores((event.stores || []).slice().sort((a, b) => a.name.localeCompare(b.name)));
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
        addStoreLog({
          id: `${event.storeId}-${event.timestamp}-new-message`,
          storeId: event.storeId,
          storeName: event.storeName,
          level: 'success',
          message: `New message from ${event.buyer}`,
          timestamp: event.timestamp
        });
      }

      if (event.type === 'STORE_STATUS') {
        mergeStore({
          id: event.storeId,
          name: event.storeName,
          online: event.online,
          last_seen: event.lastSeen
        });
      }

      if (event.type === 'STORE_LOG') {
        addStoreLog(event);
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

    const stableSetWsStatus = (next: 'connected' | 'connecting' | 'disconnected') => {
      if (next === 'disconnected') {
        // Debounce "disconnected" by 2 s — brief reconnects (e.g. eBay tab refresh)
        // won't flash the indicator red.
        if (wsDisconnectTimer.current) return;
        wsDisconnectTimer.current = setTimeout(() => {
          wsDisconnectTimer.current = null;
          setWsStatus('disconnected');
        }, 2000);
      } else {
        // Immediately clear any pending disconnect and show the new status
        if (wsDisconnectTimer.current) {
          clearTimeout(wsDisconnectTimer.current);
          wsDisconnectTimer.current = null;
        }
        setWsStatus(next);
      }
    };

    return connectWebSocket(
      preferences.wsUrl,
      handleEvent,
      stableSetWsStatus,
      (level, message) => addSystemLog('websocket', level, message)
    );
  }, [addStoreLog, addSystemLog, mergeMessage, mergeStore, preferences.wsUrl]);

  useEffect(() => {
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
        addSystemLog('supabase', status === 'SUBSCRIBED' ? 'success' : 'info', `Messages realtime channel: ${status}`);
        if (status === 'SUBSCRIBED') {
          setSupabaseStatus('connected');
          setSupabaseError(null);
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          addSystemLog('supabase', 'error', `Messages realtime channel problem: ${status}`);
          setSupabaseStatus((current) => (current === 'setup_required' ? current : 'disconnected'));
          return;
        }

        // Only show "connecting" if we haven't successfully connected yet
        setSupabaseStatus((current) =>
          current === 'setup_required' || current === 'connected' ? current : 'connecting'
        );
      });

    const storeChannel = supabase
      .channel('dashboard-stores-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores' }, (payload) => {
        if (payload.eventType !== 'DELETE') mergeStore(payload.new as Store);
      })
      .subscribe((status) => {
        addSystemLog('supabase', status === 'SUBSCRIBED' ? 'success' : 'info', `Stores realtime channel: ${status}`);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          addSystemLog('supabase', 'error', `Stores realtime channel problem: ${status}`);
        }
      });

    return () => {
      addSystemLog('supabase', 'info', 'Removing Supabase realtime channels');
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(storeChannel);
    };
  }, [addSystemLog, mergeMessage, mergeStore]);

  const updateMessageStatus = useCallback(async (id: string, status: Message['status']) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, status } : message)));
    const { error } = await supabase.from('messages').update({ status }).eq('id', id);
    if (error) {
      await refreshData();
      throw error;
    }
  }, [refreshData]);

  const updateMessageNote = useCallback(async (id: string, note: string) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, note } : message)));
    const { error } = await supabase.from('messages').update({ note }).eq('id', id);
    if (error) {
      await refreshData();
      throw error;
    }
  }, [refreshData]);

  const updateMessageUrgent = useCallback(async (id: string, urgent: boolean) => {
    setMessages((current) => current.map((message) => (message.id === id ? { ...message, urgent } : message)));
    const { error } = await supabase.from('messages').update({ urgent }).eq('id', id);
    if (error) {
      await refreshData();
      throw error;
    }
  }, [refreshData]);

  const deleteStore = useCallback(async (id: string) => {
    // Optimistically remove from UI immediately
    setStores((current) => current.filter((s) => s.id !== id));
    setMessages((current) => current.filter((m) => m.store_id !== id));
    // Delete the store — messages cascade-delete via FK ON DELETE CASCADE
    const { error } = await supabase.from('stores').delete().eq('id', id);
    if (error) {
      await refreshData();
      throw error;
    }
  }, [refreshData]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      messages,
      stores,
      storeLogs,
      systemLogs,
      notifications,
      unseenNotifications,
      toasts,
      preferences,
      wsStatus,
      supabaseStatus,
      supabaseError,
      setPreferences,
      dismissToast,
      markNotificationsSeen,
      clearNotifications,
      updateMessageStatus,
      updateMessageNote,
      updateMessageUrgent,
      deleteStore,
      refreshData
    }),
    [
      messages,
      stores,
      storeLogs,
      systemLogs,
      notifications,
      unseenNotifications,
      toasts,
      preferences,
      wsStatus,
      supabaseStatus,
      supabaseError,
      setPreferences,
      dismissToast,
      markNotificationsSeen,
      clearNotifications,
      updateMessageStatus,
      updateMessageNote,
      updateMessageUrgent,
      deleteStore,
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
