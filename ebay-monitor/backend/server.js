import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || process.env.WS_PORT || 3001);
const DASHBOARD_MESSAGE_LIMIT = Number(process.env.DASHBOARD_MESSAGE_LIMIT || 500);

const stores = new Map();
const messages = new Map();
const dashboards = new Set();
const extensions = new Map();

const server = createServer(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    writeJson(res, 200, { ok: true, service: 'ebay-message-monitor-backend', persistence: 'memory' });
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/init') {
      writeJson(res, 200, fetchInit());
      return;
    }

    const messageMatch = url.pathname.match(/^\/messages\/([^/]+)$/);
    if (req.method === 'PATCH' && messageMatch) {
      const body = await readJsonBody(req);
      const message = updateMessage(messageMatch[1], body);
      broadcastDashboards({ type: 'MESSAGE_UPDATED', message });
      writeJson(res, 200, { message });
      return;
    }

    const storeMatch = url.pathname.match(/^\/stores\/([^/]+)$/);
    if (req.method === 'DELETE' && storeMatch) {
      deleteStore(storeMatch[1]);
      broadcastDashboards({ type: 'STORE_DELETED', storeId: storeMatch[1] });
      writeJson(res, 200, { ok: true });
      return;
    }
  } catch (error) {
    writeJson(res, 500, { error: cleanErrorMessage(error) });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server });

function setCorsHeaders(res) {
  res.setHeader('access-control-allow-origin', process.env.DASHBOARD_ORIGIN || '*');
  res.setHeader('access-control-allow-methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function writeJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

function safeJson(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function cleanErrorMessage(error) {
  return String(error?.message || error || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function fingerprintFor(storeId, buyer, subject = '') {
  return createHash('sha256').update(`${storeId}:${buyer}:${subject.trim().toLowerCase()}`).digest('base64url');
}

function idForFingerprint(fingerprint) {
  return createHash('sha256').update(String(fingerprint)).digest('base64url');
}

function withStore(message) {
  return {
    ...message,
    stores: message.stores || { name: stores.get(message.store_id)?.name || 'Unknown eBay Store' }
  };
}

function fetchInit() {
  return {
    messages: [...messages.values()]
      .map(withStore)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, DASHBOARD_MESSAGE_LIMIT),
    stores: [...stores.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

function send(client, payload) {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
}

function broadcastDashboards(payload) {
  dashboards.forEach((client) => send(client, payload));
}

function broadcastStoreLog({ storeId, storeName, level = 'info', message }) {
  if (!storeId) return;
  const timestamp = new Date().toISOString();
  broadcastDashboards({
    type: 'STORE_LOG',
    id: `${storeId}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`,
    storeId,
    storeName: storeName || 'Unknown eBay Store',
    level,
    message,
    timestamp
  });
}

function upsertStore(storeId, storeName) {
  if (!storeId) return;
  const payload = {
    id: storeId,
    name: storeName || stores.get(storeId)?.name || 'Unknown eBay Store',
    last_seen: new Date().toISOString(),
    online: true
  };

  stores.set(storeId, { ...stores.get(storeId), ...payload });
  broadcastDashboards({
    type: 'STORE_STATUS',
    storeId,
    storeName: payload.name,
    online: true,
    lastSeen: payload.last_seen
  });
}

function insertMessage(event) {
  const storeId = String(event.storeId || '');
  const storeName = String(event.storeName || 'Unknown eBay Store');
  const buyer = String(event.buyer || 'Unknown buyer').trim();
  const preview = String(event.preview || '').trim();
  const subject = String(event.subject || '').trim();
  const unread = Number(event.unreadCount ?? event.unread ?? 1);

  if (!storeId || (!preview && !subject)) return null;

  upsertStore(storeId, storeName);

  const fingerprint = event.fingerprint || fingerprintFor(storeId, buyer, subject);
  const existing = messages.get(fingerprint);
  const inserted = !existing;
  const targetStatus = unread > 0 ? 'unread' : 'read';
  const createdAt = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  const previewChanged = !existing || existing.preview !== preview;
  const subjectChanged = !existing || (existing.subject || '') !== subject;
  const canRefreshStatus = !existing || existing.status !== 'archived';
  const statusChanged = !existing || existing.status !== targetStatus || existing.unread !== unread;

  if (!inserted && !previewChanged && !subjectChanged && !(canRefreshStatus && statusChanged)) {
    return null;
  }

  const message = withStore({
    id: existing?.id || idForFingerprint(fingerprint),
    store_id: storeId,
    buyer,
    subject,
    preview,
    note: existing?.note || '',
    urgent: existing?.urgent || false,
    unread: canRefreshStatus || previewChanged || subjectChanged ? unread : existing.unread,
    status: canRefreshStatus || previewChanged || subjectChanged ? targetStatus : existing.status,
    fingerprint,
    created_at: previewChanged || subjectChanged ? createdAt : existing?.created_at || createdAt
  });

  messages.set(fingerprint, message);

  const payload = {
    type: 'NEW_MESSAGE',
    id: message.id,
    storeId,
    storeName,
    buyer,
    subject,
    preview,
    unreadCount: unread,
    timestamp: message.created_at,
    message
  };

  broadcastDashboards(inserted ? payload : { type: 'MESSAGE_UPDATED', message });
  return payload;
}

function syncInbox(event) {
  const storeId = String(event.storeId || '');
  const storeName = String(event.storeName || 'Unknown eBay Store');
  const fingerprints = event.fingerprints || [];
  if (!storeId) return;

  upsertStore(storeId, storeName);
  const keep = new Set(fingerprints);
  for (const [fingerprint, message] of messages.entries()) {
    if (message.store_id === storeId && (fingerprints.length === 0 || !keep.has(fingerprint))) {
      messages.delete(fingerprint);
    }
  }

  broadcastDashboards({ type: 'SYNC_INBOX', storeId, fingerprints });
  broadcastStoreLog({
    storeId,
    storeName,
    level: 'info',
    message: `Inbox sync completed (${fingerprints.length} active conversations)`
  });
}

function markOffline(storeId) {
  if (!storeId) return;
  const store = stores.get(storeId);
  const lastSeen = new Date().toISOString();
  if (store) {
    stores.set(storeId, { ...store, online: false, last_seen: lastSeen });
  }

  broadcastDashboards({
    type: 'STORE_STATUS',
    storeId,
    storeName: store?.name || 'Unknown eBay Store',
    online: false,
    lastSeen
  });
  broadcastStoreLog({
    storeId,
    storeName: store?.name || 'Unknown eBay Store',
    level: 'warning',
    message: 'Extension disconnected'
  });
}

function updateMessage(id, patch) {
  const allowed = {};
  if (typeof patch.status === 'string' && ['unread', 'read', 'archived'].includes(patch.status)) {
    allowed.status = patch.status;
  }
  if (typeof patch.note === 'string') {
    allowed.note = patch.note;
  }
  if (typeof patch.urgent === 'boolean') {
    allowed.urgent = patch.urgent;
  }
  if (Object.keys(allowed).length === 0) {
    throw new Error('No valid message fields to update.');
  }

  const current = [...messages.values()].find((message) => message.id === id);
  if (!current) {
    throw new Error('Message not found.');
  }

  const updated = withStore({ ...current, ...allowed });
  messages.set(updated.fingerprint, updated);
  return updated;
}

function deleteStore(storeId) {
  stores.delete(storeId);
  for (const [fingerprint, message] of messages.entries()) {
    if (message.store_id === storeId) {
      messages.delete(fingerprint);
    }
  }
}

wss.on('connection', async (ws, request) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const role = url.searchParams.get('role') || 'dashboard';

  ws.isAlive = true;
  ws.role = role;
  ws.storeId = null;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  if (role === 'dashboard') {
    dashboards.add(ws);
    send(ws, { type: 'INIT', ...fetchInit() });
  }

  ws.on('message', (raw) => {
    const event = safeJson(raw);
    if (!event?.type) return;

    try {
      if (event.type === 'REGISTER_EXTENSION') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        upsertStore(event.storeId, event.storeName);
        broadcastStoreLog({
          storeId: event.storeId,
          storeName: event.storeName,
          level: 'success',
          message: 'Extension registered and connected'
        });
        return;
      }

      if (event.type === 'HEARTBEAT') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        upsertStore(event.storeId, event.storeName);
        broadcastStoreLog({
          storeId: event.storeId,
          storeName: event.storeName,
          level: 'info',
          message: 'Heartbeat received'
        });
        return;
      }

      if (event.type === 'EXTENSION_LOG') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        broadcastStoreLog({
          storeId: event.storeId,
          storeName: event.storeName,
          level: event.level || 'info',
          message: event.message || 'Extension activity'
        });
        return;
      }

      if (event.type === 'NEW_MESSAGE') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        insertMessage(event);
        broadcastStoreLog({
          storeId: event.storeId,
          storeName: event.storeName,
          level: 'success',
          message: `Message scan update: ${event.buyer || 'Unknown buyer'}`
        });
        return;
      }

      if (event.type === 'SYNC_INBOX') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        syncInbox(event);
      }
    } catch (error) {
      const message = cleanErrorMessage(error);
      console.error(`Failed to process ${event.type}:`, message);
      broadcastStoreLog({
        storeId: event.storeId || ws.storeId,
        storeName: event.storeName,
        level: 'error',
        message: `${event.type} failed: ${message}`
      });
      send(ws, { type: 'ERROR', message });
    }
  });

  ws.on('close', () => {
    dashboards.delete(ws);
    if (ws.storeId) {
      extensions.delete(ws.storeId);
      markOffline(ws.storeId);
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`eBay Message Monitor backend listening on http://localhost:${PORT} (memory mode)`);
});
