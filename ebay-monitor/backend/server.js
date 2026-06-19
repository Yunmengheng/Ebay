import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';

const PORT = Number(process.env.WS_PORT || 3001);
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

const fingerprintFor = (storeId, buyer, preview) =>
  createHash('sha256').update(`${storeId}:${buyer}:${preview}`).digest('base64url');

const send = (client, payload) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(payload));
  }
};

const broadcastDashboards = (payload) => {
  dashboards.forEach((client) => send(client, payload));
};

async function fetchInit() {
  const [{ data: messages, error: messageError }, { data: stores, error: storeError }] =
    await Promise.all([
      supabaseAdmin
        .from('messages')
        .select('*, stores(name)')
        .order('created_at', { ascending: false })
        .limit(75),
      supabaseAdmin
        .from('stores')
        .select('*')
        .order('last_seen', { ascending: false })
    ]);

  if (messageError) console.error('Failed to fetch messages:', messageError.message);
  if (storeError) console.error('Failed to fetch stores:', storeError.message);

  return { messages: messages || [], stores: stores || [] };
}

async function upsertStore(storeId, storeName) {
  const payload = {
    id: storeId,
    name: storeName || 'Unknown eBay Store',
    last_seen: new Date().toISOString(),
    online: true
  };

  const { error } = await supabaseAdmin.from('stores').upsert(payload);
  if (error) throw error;

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
  const unread = Number(event.unreadCount !== undefined ? event.unreadCount : (event.unread !== undefined ? event.unread : 1));

  if (!storeId || !preview) return null;

  await upsertStore(storeId, storeName);

  const fingerprint = event.fingerprint || fingerprintFor(storeId, buyer, preview);
  const targetStatus = unread > 0 ? 'unread' : 'read';

  // 1. Check if the message already exists in database
  const { data: existing, error: findError } = await supabaseAdmin
    .from('messages')
    .select('id, status, unread, created_at')
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (findError) throw findError;

  let data;
  if (existing) {
    // Only update if not archived, and if status or unread count actually changed
    if (existing.status !== 'archived' && (existing.status !== targetStatus || existing.unread !== unread)) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('messages')
        .update({ unread, status: targetStatus })
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
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        store_id: storeId,
        buyer,
        preview,
        unread,
        fingerprint,
        status: targetStatus
      })
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
    preview,
    unreadCount: unread,
    timestamp: data.created_at,
    message: data
  };

  broadcastDashboards(payload);
  return payload;
}

async function markOffline(storeId) {
  if (!storeId) return;

  const lastSeen = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({ online: false, last_seen: lastSeen })
    .eq('id', storeId)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Failed to mark store offline:', error.message);
    return;
  }

  broadcastDashboards({
    type: 'STORE_STATUS',
    storeId,
    storeName: data?.name || 'Unknown eBay Store',
    online: false,
    lastSeen
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
        return;
      }

      if (event.type === 'HEARTBEAT') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        await upsertStore(event.storeId, event.storeName);
        return;
      }

      if (event.type === 'NEW_MESSAGE') {
        ws.role = 'extension';
        ws.storeId = event.storeId;
        extensions.set(event.storeId, ws);
        await insertMessage(event);
      }
    } catch (error) {
      console.error(`Failed to process ${event.type}:`, error.message);
      send(ws, { type: 'ERROR', message: error.message });
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

