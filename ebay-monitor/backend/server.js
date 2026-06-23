import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import pg from 'pg';

const PORT = Number(process.env.PORT || process.env.WS_PORT || 3001);
const DASHBOARD_MESSAGE_LIMIT = Number(process.env.DASHBOARD_MESSAGE_LIMIT || 5000);
const STORE_WRITE_INTERVAL_MS = Number(process.env.STORE_WRITE_INTERVAL_MS || 15000);
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL. Add your Neon pooled Postgres connection string to backend/.env.');
}

const { Pool } = pg;
const db = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const storeWriteCache = new Map();

const server = createServer(async (req, res) => {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'ebay-message-monitor-backend' }));
    return;
  }

  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/init') {
      const data = await fetchInit();
      writeJson(res, 200, data);
      return;
    }

    const messageMatch = url.pathname.match(/^\/messages\/([^/]+)$/);
    if (req.method === 'PATCH' && messageMatch) {
      const body = await readJsonBody(req);
      const data = await updateMessage(messageMatch[1], body);
      broadcastDashboards({ type: 'MESSAGE_UPDATED', message: data });
      writeJson(res, 200, { message: data });
      return;
    }

    const storeMatch = url.pathname.match(/^\/stores\/([^/]+)$/);
    if (req.method === 'DELETE' && storeMatch) {
      await deleteStore(storeMatch[1]);
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
const dashboards = new Set();
const extensions = new Map();

const safeJson = (raw) => {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
};

const setCorsHeaders = (res) => {
  res.setHeader('access-control-allow-origin', process.env.DASHBOARD_ORIGIN || '*');
  res.setHeader('access-control-allow-methods', 'GET,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
};

const writeJson = (res, status, payload) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
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

const fingerprintFor = (storeId, buyer, subject = '') =>
  createHash('sha256').update(`${storeId}:${buyer}:${subject.trim().toLowerCase()}`).digest('base64url');

const send = (client, payload) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
};

const broadcastDashboards = (payload) => {
  dashboards.forEach((client) => send(client, payload));
};

function cleanErrorMessage(error) {
  const raw = String(error?.message || error || 'Unknown error');
  const lower = raw.toLowerCase();

  if (lower.includes('connection timed out') || lower.includes('timeout')) {
    return 'Database connection timed out. Retrying or try again in a few minutes.';
  }

  if (lower.includes('too many connections') || error?.code === '53300') {
    return 'Database has too many active connections. Slow down ingest or increase the pool/database size.';
  }

  return raw.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isRetryableDbError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code.startsWith('08') ||
    code === '40001' ||
    code === '53300' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    message.includes('timeout') ||
    message.includes('terminated') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('too many connections')
  );
}

async function runDb(label, operation, retries = 4) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableDbError(error) || attempt === retries) {
        throw error;
      }

      const delay = Math.min(30000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
      console.warn(`${label} failed: ${cleanErrorMessage(error)} Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

const broadcastStoreLog = ({ storeId, storeName, level = 'info', message }) => {
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
};

async function fetchInit() {
  const [messagesResult, storesResult] = await Promise.all([
    runDb('Fetch messages', () =>
      db.query(
        `SELECT m.*, json_build_object('name', s.name) AS stores
         FROM messages m
         LEFT JOIN stores s ON s.id = m.store_id
         ORDER BY m.created_at DESC
         LIMIT $1`,
        [DASHBOARD_MESSAGE_LIMIT]
      )
    ),
    runDb('Fetch stores', () => db.query('SELECT * FROM stores ORDER BY last_seen DESC'))
  ]);

  return { messages: messagesResult.rows, stores: storesResult.rows };
}

async function upsertStore(storeId, storeName, { force = false } = {}) {
  const payload = {
    id: storeId,
    name: storeName || 'Unknown eBay Store',
    last_seen: new Date().toISOString(),
    online: true
  };

  const lastWrite = storeWriteCache.get(storeId) || 0;
  const shouldWrite = force || Date.now() - lastWrite >= STORE_WRITE_INTERVAL_MS;

  if (shouldWrite) {
    await runDb('Upsert store', () =>
      db.query(
        `INSERT INTO stores (id, name, last_seen, online)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             last_seen = EXCLUDED.last_seen,
             online = true`,
        [payload.id, payload.name, payload.last_seen]
      )
    );
    storeWriteCache.set(storeId, Date.now());
  }

  broadcastDashboards({
    type: 'STORE_STATUS',
    storeId,
    storeName: payload.name,
    online: true,
    lastSeen: payload.last_seen
  });
}

async function insertMessage(event) {
  const storeId = String(event.storeId || '');
  const storeName = String(event.storeName || 'Unknown eBay Store');
  const buyer = String(event.buyer || 'Unknown buyer').trim();
  const preview = String(event.preview || '').trim();
  const subject = String(event.subject || '').trim();
  const unread = Number(event.unreadCount !== undefined ? event.unreadCount : (event.unread !== undefined ? event.unread : 1));

  // Allow empty preview if subject exists (some eBay messages only show subject)
  if (!storeId || (!preview && !subject)) return null;

  await upsertStore(storeId, storeName);

  const fingerprint = event.fingerprint || fingerprintFor(storeId, buyer, subject);
  const targetStatus = unread > 0 ? 'unread' : 'read';

  const createdAt = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  const { rows } = await runDb('Upsert message', () =>
    db.query(
      `WITH changed AS (
         INSERT INTO messages (store_id, buyer, subject, preview, unread, fingerprint, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (fingerprint) DO UPDATE
         SET buyer = EXCLUDED.buyer,
             preview = EXCLUDED.preview,
             subject = EXCLUDED.subject,
             unread = CASE
               WHEN messages.preview IS DISTINCT FROM EXCLUDED.preview
                 OR messages.subject IS DISTINCT FROM EXCLUDED.subject
                 OR messages.status <> 'archived'
               THEN EXCLUDED.unread
               ELSE messages.unread
             END,
             status = CASE
               WHEN messages.preview IS DISTINCT FROM EXCLUDED.preview
                 OR messages.subject IS DISTINCT FROM EXCLUDED.subject
                 OR messages.status <> 'archived'
               THEN EXCLUDED.status
               ELSE messages.status
             END,
             created_at = CASE
               WHEN messages.preview IS DISTINCT FROM EXCLUDED.preview
                 OR messages.subject IS DISTINCT FROM EXCLUDED.subject
               THEN EXCLUDED.created_at
               ELSE messages.created_at
             END
         WHERE messages.preview IS DISTINCT FROM EXCLUDED.preview
            OR messages.subject IS DISTINCT FROM EXCLUDED.subject
            OR (
              messages.status <> 'archived'
              AND (messages.status IS DISTINCT FROM EXCLUDED.status OR messages.unread IS DISTINCT FROM EXCLUDED.unread)
            )
         RETURNING *
       )
       SELECT changed.*, json_build_object('name', stores.name) AS stores
       FROM changed
       LEFT JOIN stores ON stores.id = changed.store_id`,
      [storeId, buyer, subject, preview, unread, fingerprint, targetStatus, createdAt]
    )
  );

  const data = rows[0];
  if (!data) return null;

  const payload = {
    type: 'NEW_MESSAGE',
    id: data.id,
    storeId,
    storeName,
    buyer,
    subject,
    preview,
    unreadCount: unread,
    timestamp: data.created_at,
    message: data
  };

  broadcastDashboards(payload);
  return payload;
}

async function syncInbox(event) {
  const storeId = String(event.storeId || '');
  const storeName = String(event.storeName || 'Unknown eBay Store');
  const fingerprints = event.fingerprints || [];

  if (!storeId) return;

  await upsertStore(storeId, storeName);

  try {
    await runDb('Sync inbox cleanup', () => {
      if (fingerprints.length > 0) {
        return db.query('DELETE FROM messages WHERE store_id = $1 AND NOT (fingerprint = ANY($2::text[]))', [
          storeId,
          fingerprints
        ]);
      }

      return db.query('DELETE FROM messages WHERE store_id = $1', [storeId]);
    });
  } catch (error) {
    const message = cleanErrorMessage(error);
    console.error(`Failed to delete stale messages for store ${storeId}:`, message);
    broadcastStoreLog({
      storeId,
      storeName,
      level: 'error',
      message: `Inbox sync failed: ${message}`
    });
    throw error;
  }

  broadcastDashboards({
    type: 'SYNC_INBOX',
    storeId,
    fingerprints
  });
  broadcastStoreLog({
    storeId,
    storeName,
    level: 'info',
    message: `Inbox sync completed (${fingerprints.length} active conversations)`
  });
}

async function markOffline(storeId) {
  if (!storeId) return;

  const lastSeen = new Date().toISOString();
  let store;
  try {
    const { rows } = await runDb('Mark store offline', () =>
      db.query(
        `UPDATE stores
         SET online = false, last_seen = $2
         WHERE id = $1
         RETURNING *`,
        [storeId, lastSeen]
      )
    );
    store = rows[0];
  } catch (error) {
    console.error('Failed to mark store offline:', cleanErrorMessage(error));
    return;
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

async function updateMessage(id, patch) {
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

  const entries = Object.entries(allowed);
  if (entries.length === 0) {
    throw new Error('No valid message fields to update.');
  }

  const setClause = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
  const values = [id, ...entries.map(([, value]) => value)];
  const { rows } = await runDb('Update message', () =>
    db.query(
      `WITH updated AS (
         UPDATE messages
         SET ${setClause}
         WHERE id = $1
         RETURNING *
       )
       SELECT updated.*, json_build_object('name', stores.name) AS stores
       FROM updated
       LEFT JOIN stores ON stores.id = updated.store_id`,
      values
    )
  );

  if (!rows[0]) {
    throw new Error('Message not found.');
  }

  return rows[0];
}

async function deleteStore(storeId) {
  await runDb('Delete store', () => db.query('DELETE FROM stores WHERE id = $1', [storeId]));
  storeWriteCache.delete(storeId);
}

async function initDb() {
  await runDb('Initialize database schema', () =>
    db.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        last_seen TIMESTAMPTZ DEFAULT NOW(),
        online BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
        buyer TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        urgent BOOLEAN NOT NULL DEFAULT FALSE,
        unread INT DEFAULT 0,
        status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
        fingerprint TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS messages_store_id_idx ON messages(store_id);
      CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);
      CREATE INDEX IF NOT EXISTS messages_status_idx ON messages(status);
      CREATE INDEX IF NOT EXISTS stores_last_seen_idx ON stores(last_seen DESC);
    `)
  );
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
    try {
      send(ws, { type: 'INIT', ...(await fetchInit()) });
    } catch (error) {
      const message = cleanErrorMessage(error);
      console.error('Failed to initialize dashboard:', message);
      send(ws, { type: 'ERROR', message });
    }
  }

  ws.on('message', async (raw) => {
    const event = safeJson(raw);
    if (!event?.type) return;

    try {
      if (event.type === 'REGISTER_EXTENSION') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        await upsertStore(event.storeId, event.storeName, { force: true });
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
        await upsertStore(event.storeId, event.storeName);
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
        await insertMessage(event);
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
        await syncInbox(event);
        return;
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

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`eBay Message Monitor backend listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', cleanErrorMessage(error));
    process.exit(1);
  });
