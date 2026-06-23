export type MessageStatus = 'unread' | 'read' | 'archived';

export type Store = {
  id: string;
  name: string;
  last_seen: string | null;
  online: boolean;
};

export type StoreLog = {
  id: string;
  storeId: string;
  storeName: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
};

export type SystemLog = {
  id: string;
  source: 'websocket' | 'database';
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
};

export type Message = {
  id: string;
  store_id: string;
  buyer: string;
  subject: string;
  preview: string;
  note?: string | null;
  urgent?: boolean | null;
  unread: number;
  status: MessageStatus;
  fingerprint: string;
  created_at: string;
  stores?: { name: string } | null;
};

export type Toast = {
  id: string;
  storeName: string;
  buyer: string;
  preview: string;
};

export type NotificationItem = {
  id: string;
  messageId?: string;
  storeName: string;
  buyer: string;
  preview: string;
  createdAt: string;
  messageCreatedAt?: string;
};

export type Preferences = {
  desktopNotifications: boolean;
  toastNotifications: boolean;
  soundAlerts: boolean;
  wsUrl: string;
};
