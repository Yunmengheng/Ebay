export type MessageStatus = 'unread' | 'read' | 'archived';

export type Store = {
  id: string;
  name: string;
  last_seen: string | null;
  online: boolean;
};

export type Message = {
  id: string;
  store_id: string;
  buyer: string;
  subject: string;
  preview: string;
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

export type Preferences = {
  desktopNotifications: boolean;
  toastNotifications: boolean;
  soundAlerts: boolean;
  wsUrl: string;
};

