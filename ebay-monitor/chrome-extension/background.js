const DEFAULT_WS_URL = 'ws://localhost:3001';
const DASHBOARD_URL = 'http://localhost:3000/dashboard';

let socket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let heartbeatTimer = null;
let status = 'disconnected';
let currentStore = null;
let unreadCount = 0;
let notificationQueue = [];
let notificationTimer = null;

const getStorage = (keys) => chrome.storage.local.get(keys);
const setStorage = (value) => chrome.storage.local.set(value);

async function getWsUrl() {
  const data = await getStorage(['wsUrl']);
  return data.wsUrl || DEFAULT_WS_URL;
}

function setStatus(nextStatus) {
  status = nextStatus;
  chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', status }).catch(() => {});
}

function sendSocket(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

async function ensureStore(storeName) {
  const data = await getStorage(['storeId', 'storeName']);
  const storeId = data.storeId || crypto.randomUUID();
  const resolvedName = storeName || data.storeName || 'Unknown eBay Store';
  currentStore = { storeId, storeName: resolvedName };
  await setStorage(currentStore);
  return currentStore;
}

async function connect() {
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);

  const wsUrl = await getWsUrl();
  setStatus('connecting');
  socket = new WebSocket(`${wsUrl}?role=extension`);

  socket.addEventListener('open', async () => {
    reconnectAttempt = 0;
    setStatus('connected');

    if (currentStore) {
      sendSocket({ type: 'REGISTER_EXTENSION', ...currentStore, timestamp: Date.now() });
    }

    heartbeatTimer = setInterval(() => {
      if (currentStore) {
        sendSocket({ type: 'HEARTBEAT', ...currentStore, timestamp: Date.now() });
      }
    }, 30000);
  });

  socket.addEventListener('close', scheduleReconnect);
  socket.addEventListener('error', scheduleReconnect);
}

function scheduleReconnect() {
  clearInterval(heartbeatTimer);
  setStatus('disconnected');
  const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, delay);
}

function flushNotifications() {
  const batch = notificationQueue.splice(0);
  notificationTimer = null;
  if (!batch.length) return;

  const first = batch[0];
  const title =
    batch.length === 1
      ? `New message from ${first.buyer}`
      : `${batch.length} new eBay messages`;
  const message =
    batch.length === 1
      ? `In ${first.storeName}: ${first.preview}`
      : batch.map((item) => `${item.storeName}: ${item.buyer}`).slice(0, 4).join('\n');

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon.svg',
    title,
    message,
    priority: 2
  });
}

function queueNotification(message) {
  notificationQueue.push(message);
  if (!notificationTimer) {
    notificationTimer = setTimeout(flushNotifications, 10000);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  connect();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'STORE_DETECTED') {
      const store = await ensureStore(message.storeName);
      sendSocket({ type: 'REGISTER_EXTENSION', ...store, timestamp: Date.now() });
      sendResponse({ ok: true, ...store, status });
      return;
    }

    if (message.type === 'NEW_MESSAGE') {
      const store = await ensureStore(message.storeName);
      const event = {
        type: 'NEW_MESSAGE',
        ...store,
        buyer: message.buyer,
        preview: message.preview,
        unreadCount: message.unreadCount || 1,
        fingerprint: message.fingerprint,
        timestamp: Date.now()
      };

      unreadCount += 1;
      await setStorage({ unreadCount });
      queueNotification(event);
      sendSocket(event);
      sendResponse({ ok: true, status });
      return;
    }

    if (message.type === 'GET_POPUP_STATE') {
      const data = await getStorage(['storeId', 'storeName', 'unreadCount', 'wsUrl']);
      sendResponse({
        status,
        storeId: data.storeId,
        storeName: data.storeName,
        unreadCount: data.unreadCount || unreadCount,
        wsUrl: data.wsUrl || DEFAULT_WS_URL
      });
      return;
    }

    if (message.type === 'SET_WS_URL') {
      await setStorage({ wsUrl: message.wsUrl || DEFAULT_WS_URL });
      connect();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'OPEN_DASHBOARD') {
      chrome.tabs.create({ url: DASHBOARD_URL });
      sendResponse({ ok: true });
    }
  })();

  return true;
});

connect();

