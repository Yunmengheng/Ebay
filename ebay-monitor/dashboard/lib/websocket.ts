import type { Message, Store, StoreLog } from './types';

export type ServerEvent =
  | { type: 'INIT'; messages: Message[]; stores: Store[] }
  | { type: 'NEW_MESSAGE'; message?: Message; id: string; storeId: string; storeName: string; buyer: string; subject?: string; preview: string; unreadCount: number; timestamp: string }
  | { type: 'STORE_STATUS'; storeId: string; storeName: string; online: boolean; lastSeen: string }
  | ({ type: 'STORE_LOG' } & StoreLog)
  | { type: 'SYNC_INBOX'; storeId: string; fingerprints: string[] }
  | { type: 'ERROR'; message: string };

export function connectWebSocket(
  url: string,
  onEvent: (event: ServerEvent) => void,
  onStatus: (status: 'connected' | 'connecting' | 'disconnected') => void,
  onLog?: (level: 'info' | 'success' | 'warning' | 'error', message: string) => void
) {
  let socket: WebSocket | null = null;
  let closedByClient = false;
  let attempt = 0;
  let reconnectTimer: number | null = null;

  const open = () => {
    onStatus('connecting');
    onLog?.('info', `Opening WebSocket connection to ${url}?role=dashboard`);
    socket = new WebSocket(`${url}?role=dashboard`);

    socket.onopen = () => {
      attempt = 0;
      onLog?.('success', 'WebSocket connected');
      onStatus('connected');
    };

    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        onLog?.('warning', 'Ignored malformed WebSocket message');
        // Ignore malformed frames from non-dashboard clients.
      }
    };

    socket.onclose = (event) => {
      onStatus('disconnected');
      const details = `WebSocket closed (code ${event.code}${event.reason ? `, reason: ${event.reason}` : ''})`;
      if (closedByClient) {
        onLog?.('info', `${details}; closed by dashboard`);
        return;
      }
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      onLog?.('warning', `${details}; reconnecting in ${Math.round(delay / 1000)}s`);
      attempt += 1;
      reconnectTimer = window.setTimeout(open, delay);
    };

    socket.onerror = () => {
      onLog?.('error', 'WebSocket error. Check backend URL, Render service status, and browser network access.');
      socket?.close();
    };
  };

  open();

  return () => {
    closedByClient = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    onLog?.('info', 'Closing WebSocket connection');
    socket?.close();
  };
}
