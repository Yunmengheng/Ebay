import type { Message, Store } from './types';

export type ServerEvent =
  | { type: 'INIT'; messages: Message[]; stores: Store[] }
  | { type: 'NEW_MESSAGE'; message?: Message; id: string; storeId: string; storeName: string; buyer: string; subject?: string; preview: string; unreadCount: number; timestamp: string }
  | { type: 'STORE_STATUS'; storeId: string; storeName: string; online: boolean; lastSeen: string }
  | { type: 'SYNC_INBOX'; storeId: string; fingerprints: string[] }
  | { type: 'ERROR'; message: string };

export function connectWebSocket(
  url: string,
  onEvent: (event: ServerEvent) => void,
  onStatus: (status: 'connected' | 'connecting' | 'disconnected') => void
) {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let attempt = 0;
  let reconnectTimer: number | null = null;

  const open = () => {
    onStatus('connecting');
    socket = new WebSocket(`${url}?role=dashboard`);

    socket.onopen = () => {
      attempt = 0;
      onStatus('connected');
    };

    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        // Ignore malformed frames from non-dashboard clients.
      }
    };

    socket.onclose = () => {
      onStatus('disconnected');
      if (closedByClient) return;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = window.setTimeout(open, delay);
    };

    socket.onerror = () => {
      socket?.close();
    };
  };

  open();

  return () => {
    closedByClient = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    socket?.close();
  };
}

