import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.PORT || process.env.WS_PORT || 3001);
const DASHBOARD_MESSAGE_LIMIT = Number(process.env.DASHBOARD_MESSAGE_LIMIT || 5000);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase URL or key. Check backend/.env.');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'ebay-message-monitor-backend' }));
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

  if (raw.includes('522') || lower.includes('connection timed out') || lower.includes('cloudflare')) {
    return 'Supabase connection timed out (Cloudflare 522). Retrying or try again in a few minutes.';
  }

  if (raw.includes('<!DOCTYPE html') || raw.includes('<html')) {
    return 'Supabase returned an HTML error page instead of JSON. Check Supabase status and try again.';
  }

  return raw.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isRetryableSupabaseError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('522') ||
    message.includes('connection timed out') ||
    message.includes('cloudflare') ||
    message.includes('<!doctype html') ||
    message.includes('<html')
  );
}

async function runSupabase(label, operation, retries = 2) {
  let lastResult;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    lastResult = await operation();
    if (!lastResult?.error || !isRetryableSupabaseError(lastResult.error) || attempt === retries) {
      return lastResult;
    }

    const delay = 750 * (attempt + 1);
    console.warn(`${label} failed: ${cleanErrorMessage(lastResult.error)} Retrying in ${delay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  return lastResult;
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
  const [{ data: messages, error: messageError }, { data: stores, error: storeError }] =
    await Promise.all([
      supabaseAdmin
        .from('messages')
        .select('*, stores(name)')
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_MESSAGE_LIMIT),
      supabaseAdmin
        .from('stores')
        .select('*')
        .order('last_seen', { ascending: false })
    ]);

  if (messageError) console.error('Failed to fetch messages:', cleanErrorMessage(messageError));
  if (storeError) console.error('Failed to fetch stores:', cleanErrorMessage(storeError));

  return { messages: messages || [], stores: stores || [] };
}

async function upsertStore(storeId, storeName) {
  const payload = {
    id: storeId,
    name: storeName || 'Unknown eBay Store',
    last_seen: new Date().toISOString(),
    online: true
  };

  const { error } = await runSupabase('Upsert store', () => supabaseAdmin.from('stores').upsert(payload));
  if (error) throw error;

  broadcastDashboards({
    type: 'STORE_STATUS',
    storeId,
    storeName: payload.name,
    online: true,
    lastSeen: payload.last_seen
  });
}

// Runtime flag: detect if the 'subject' column exists in the messages table.
// Set to true once confirmed, stays false if column is missing (run migration 002 to add it).
let hasSubjectColumn = false;

async function detectSubjectColumn() {
  try {
    const { error } = await supabaseAdmin
      .from('messages')
      .select('subject')
      .limit(1);
    if (!error) {
      hasSubjectColumn = true;
      console.log('[server] subject column detected in messages table.');
    } else {
      hasSubjectColumn = false;
      console.warn(`[server] subject column NOT found: ${cleanErrorMessage(error)}. Run supabase/migrations/002_add_subject.sql to add it if needed.`);
    }
  } catch {
    hasSubjectColumn = false;
  }
}

detectSubjectColumn();

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

  // 1. Check if the message already exists in database
  const selectFields = hasSubjectColumn
    ? 'id, status, unread, preview, subject, created_at'
    : 'id, status, unread, preview, created_at';
  const { data: existing, error: findError } = await supabaseAdmin
    .from('messages')
    .select(selectFields)
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (findError) throw findError;

  let data;
  if (existing) {
    const previewChanged = existing.preview !== preview;
    const subjectChanged = (existing.subject || '') !== subject;
    const statusChanged = existing.status !== targetStatus || existing.unread !== unread;

    const shouldUpdateContent = previewChanged || subjectChanged;
    const shouldUpdateStatus = shouldUpdateContent || (existing.status !== 'archived' && statusChanged);
    // Keep existing rows stable during background rescans. eBay exposes relative
    // times like "1h", so rescans produce slightly different timestamps and can
    // make the All stores feed jump around. Only move a conversation when its
    // visible content actually changed, which means a real new latest message.
    const shouldUpdateTs = shouldUpdateContent;

    if (shouldUpdateStatus || shouldUpdateTs) {
      const updatePayload = {};

      if (shouldUpdateStatus) {
        updatePayload.unread = unread;
        updatePayload.status = targetStatus;
      }

      if (previewChanged) {
        updatePayload.preview = preview;
      }

      if (hasSubjectColumn && subjectChanged) {
        updatePayload.subject = subject;
      }

      if (shouldUpdateTs) {
        updatePayload.created_at = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('messages')
        .update(updatePayload)
        .eq('id', existing.id)
        .select('*, stores(name)')
        .single();
      
      if (updateError) throw updateError;
      data = updated;
    } else {
      // No updates needed
      return null;
    }
  } else {
    // 2. Insert new message
    const insertPayload = {
      store_id: storeId,
      buyer,
      preview,
      unread,
      fingerprint,
      status: targetStatus,
      created_at: event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString()
    };
    if (hasSubjectColumn) {
      insertPayload.subject = subject;
    }
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert(insertPayload)
      .select('*, stores(name)')
      .single();

    if (insertError) {
      if (insertError.code === '23505') return null; // race condition safety
      throw insertError;
    }
    data = inserted;
  }

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

  const { error } = await runSupabase('Sync inbox cleanup', () => {
    let query = supabaseAdmin.from('messages').delete().eq('store_id', storeId);
    if (fingerprints.length > 0) {
      query = query.not('fingerprint', 'in', `(${fingerprints.map(f => `"${f}"`).join(',')})`);
    }
    return query;
  });
  if (error) {
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
  const { data, error } = await runSupabase('Mark store offline', () =>
    supabaseAdmin
      .from('stores')
      .update({ online: false, last_seen: lastSeen })
      .eq('id', storeId)
      .select()
      .single()
  );

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to mark store offline:', cleanErrorMessage(error));
    return;
  }

  broadcastDashboards({
    type: 'STORE_STATUS',
    storeId,
    storeName: data?.name || 'Unknown eBay Store',
    online: false,
    lastSeen
  });
  broadcastStoreLog({
    storeId,
    storeName: data?.name || 'Unknown eBay Store',
    level: 'warning',
    message: 'Extension disconnected'
  });
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
    send(ws, { type: 'INIT', ...(await fetchInit()) });
  }

  ws.on('message', async (raw) => {
    const event = safeJson(raw);
    if (!event?.type) return;

    try {
      if (event.type === 'REGISTER_EXTENSION') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        await upsertStore(event.storeId, event.storeName);
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

server.listen(PORT, () => {
  console.log(`eBay Message Monitor WebSocket server listening on ws://localhost:${PORT}`);
});
