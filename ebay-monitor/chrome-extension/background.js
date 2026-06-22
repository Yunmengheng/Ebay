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
let socketVersion = 0;
let lastScanLogAt = 0;

const getStorage = (keys) => chrome.storage.local.get(keys);
const setStorage = (value) => chrome.storage.local.set(value);

async function getNotifiedFingerprints() {
  const data = await getStorage(['notifiedFingerprints']);
  return data.notifiedFingerprints || {};
}

async function saveNotifiedFingerprints(map) {
  const keys = Object.keys(map);
  if (keys.length > 1000) {
    const pruned = {};
    keys.slice(-500).forEach((k) => {
      pruned[k] = map[k];
    });
    map = pruned;
  }
  await setStorage({ notifiedFingerprints: map });
}

function normalizeWsUrl(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return DEFAULT_WS_URL;
  if (!candidate.startsWith('ws://') && !candidate.startsWith('wss://')) {
    return DEFAULT_WS_URL;
  }
  return candidate.replace(/\/$/, '');
}

async function getWsUrl() {
  const data = await getStorage(['wsUrl']);
  const wsUrl = normalizeWsUrl(data.wsUrl);
  if (data.wsUrl && data.wsUrl !== wsUrl) {
    await setStorage({ wsUrl });
  }
  return wsUrl;
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
  const incomingName = String(storeName || '').trim();
  // Always prefer the already-saved name so a manual rename via the popup
  // is never overwritten by the auto-detected eBay username on page refresh.
  const resolvedName = data.storeName || (
    incomingName && incomingName !== 'Unknown eBay Store' && incomingName !== 'Open eBay messages'
      ? incomingName
      : 'Unknown eBay Store'
  );
  currentStore = { storeId, storeName: resolvedName };
  await setStorage(currentStore);
  return currentStore;
}

async function renameStore(storeName) {
  const cleanName = String(storeName || '').trim() || 'Unknown eBay Store';
  const data = await getStorage(['storeId']);
  const storeId = data.storeId || crypto.randomUUID();
  currentStore = { storeId, storeName: cleanName };
  await setStorage(currentStore);
  // Send both REGISTER_EXTENSION and HEARTBEAT so the backend upserts
  // the new name into Supabase immediately (which updates the dashboard).
  sendSocket({ type: 'REGISTER_EXTENSION', ...currentStore, timestamp: Date.now() });
  sendSocket({ type: 'HEARTBEAT', ...currentStore, timestamp: Date.now() });
  return currentStore;
}

async function connect() {
  clearTimeout(reconnectTimer);
  clearInterval(heartbeatTimer);
  const version = ++socketVersion;

  const wsUrl = await getWsUrl();
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    socket.close();
  }
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

  socket.addEventListener('close', () => scheduleReconnect(version));
  socket.addEventListener('error', () => scheduleReconnect(version));
}

async function ensureConnectedNow() {
  if (socket?.readyState === WebSocket.OPEN) {
    setStatus('connected');
    return;
  }

  reconnectAttempt = 0;
  clearTimeout(reconnectTimer);
  await connect();
}

function scheduleReconnect(version) {
  if (version !== socketVersion) return;
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

function isEbayMessagesUrl(url = '') {
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split('.');
    const isEbayHost = hostParts.includes('ebay');
    return isEbayHost && (parsed.pathname.startsWith('/cnt/') || parsed.hostname === 'mesg.ebay.com');
  } catch {
    return false;
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    return true;
  } catch {
    return false;
  }
}

async function scanActiveTab() {
  await ensureConnectedNow();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isEbayMessagesUrl(tab.url)) {
    return { ok: false, reason: 'Open an eBay messages tab first.' };
  }

  await injectContentScript(tab.id);

  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'FORCE_SCAN' });
  } catch {
    return { ok: false, reason: 'Could not reach the eBay page scanner. Refresh the eBay tab.' };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  connect();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isEbayMessagesUrl(tab.url)) {
    injectContentScript(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === 'SCAN_RESULT') {
      unreadCount = message.sentCount || 0;
      await setStorage({
        lastScanAt: Date.now(),
        lastScanCandidateCount: message.candidateCount || 0,
        lastScanSentCount: message.sentCount || 0,
        scannerActive: true,
        unreadCount
      });
      const now = Date.now();
      const data = await getStorage(['storeId', 'storeName']);
      const store = currentStore || (data.storeId ? { storeId: data.storeId, storeName: data.storeName } : null);
      const shouldLogScan = message.skipped || message.sentCount > 0 || now - lastScanLogAt > 30000;
      if (store && shouldLogScan) {
        lastScanLogAt = now;
        sendSocket({
          type: 'EXTENSION_LOG',
          ...store,
          level: message.skipped ? 'warning' : 'info',
          message: message.skipped
            ? `Scan skipped: ${message.reason || 'not on inbox'}`
            : `Scan completed: ${message.candidateCount || 0} rows found, ${message.sentCount || 0} updates sent`,
          timestamp: now
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'STORE_DETECTED') {
      const store = await ensureStore(message.storeName);
      sendSocket({ type: 'REGISTER_EXTENSION', ...store, timestamp: Date.now() });
      sendResponse({ ok: true, ...store, status });
      return;
    }

    if (message.type === 'SET_STORE_NAME') {
      const store = await renameStore(message.storeName);
      sendResponse({ ok: true, ...store, status });
      return;
    }

    if (message.type === 'SYNC_INBOX') {
      const store = await ensureStore(message.storeName);
      sendSocket({
        type: 'SYNC_INBOX',
        storeId: store.storeId,
        storeName: store.storeName,
        fingerprints: message.fingerprints,
        timestamp: Date.now()
      });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'NEW_MESSAGE') {
      const store = await ensureStore(message.storeName);
      const isUnread = (message.unreadCount || 0) > 0;
      const targetStatus = isUnread ? 'unread' : 'read';
      const fingerprint = message.fingerprint;

      const notifiedMap = await getNotifiedFingerprints();
      const previousEntry = notifiedMap[fingerprint];

      // Handle legacy string entry migration safely
      const previousStatus = typeof previousEntry === 'string' ? previousEntry : previousEntry?.status;
      const previousPreview = typeof previousEntry === 'string' ? null : previousEntry?.preview;

      const event = {
        type: 'NEW_MESSAGE',
        ...store,
        buyer: message.buyer,
        subject: message.subject,
        preview: message.preview,
        unreadCount: message.unreadCount !== undefined ? message.unreadCount : 1,
        fingerprint: fingerprint,
        timestamp: message.timestamp || Date.now()
      };

      const hasNewPreview = previousPreview !== null && previousPreview !== message.preview;
      const hasStatusChanged = previousStatus !== targetStatus;

      if (previousStatus === undefined) {
        // Brand new message/thread (never seen before)
        notifiedMap[fingerprint] = { status: targetStatus, preview: message.preview };
        await saveNotifiedFingerprints(notifiedMap);

        if (isUnread) {
          unreadCount += 1;
          await setStorage({ unreadCount });
          queueNotification(event);
        }
      } else if (hasNewPreview || hasStatusChanged) {
        // Status changed or a new message arrived in the same conversation thread
        notifiedMap[fingerprint] = { status: targetStatus, preview: message.preview };
        await saveNotifiedFingerprints(notifiedMap);

        // Trigger notification only if it is actually a new message content (preview changed) AND unread
        if (hasNewPreview && isUnread) {
          unreadCount += 1;
          await setStorage({ unreadCount });
          queueNotification(event);
        }
      }

      // Always send the message event to the backend so it can upsert/synchronize the database.
      // The backend is idempotent and will only perform updates/broadcasts if values actually changed.
      sendSocket(event);

      sendResponse({ ok: true, status });
      return;
    }

    if (message.type === 'GET_POPUP_STATE') {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        ensureConnectedNow();
      }
      const data = await getStorage([
        'storeId',
        'storeName',
        'unreadCount',
        'wsUrl',
        'lastScanAt',
        'lastScanCandidateCount',
        'lastScanSentCount',
        'scannerActive'
      ]);
      sendResponse({
        status,
        storeId: data.storeId,
        storeName: data.storeName,
        unreadCount: data.unreadCount || unreadCount,
        wsUrl: data.wsUrl || DEFAULT_WS_URL,
        scannerActive: Boolean(data.scannerActive),
        lastScanAt: data.lastScanAt || null,
        lastScanCandidateCount: data.lastScanCandidateCount || 0,
        lastScanSentCount: data.lastScanSentCount || 0
      });
      return;
    }

    if (message.type === 'SET_WS_URL') {
      const wsUrl = normalizeWsUrl(message.wsUrl);
      await setStorage({ wsUrl });
      connect();
      sendResponse({ ok: true, wsUrl });
      return;
    }

    if (message.type === 'RESET_WS_URL') {
      await setStorage({ wsUrl: DEFAULT_WS_URL });
      connect();
      sendResponse({ ok: true, wsUrl: DEFAULT_WS_URL });
      return;
    }

    if (message.type === 'RECONNECT_NOW') {
      await ensureConnectedNow();
      sendResponse({ ok: true, status });
      return;
    }

    if (message.type === 'OPEN_DASHBOARD') {
      chrome.tabs.create({ url: DASHBOARD_URL });
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'FORCE_SCAN_ACTIVE_TAB') {
      sendResponse(await scanActiveTab());
    }
  })();

  return true;
});

connect();
