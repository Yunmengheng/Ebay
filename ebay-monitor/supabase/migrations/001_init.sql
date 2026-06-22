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
  unread INT DEFAULT 0,
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
  fingerprint TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_store_id_idx ON messages(store_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS messages_status_idx ON messages(status);
CREATE INDEX IF NOT EXISTS stores_last_seen_idx ON stores(last_seen DESC);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE stores;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow all" ON stores;
DROP POLICY IF EXISTS "allow all" ON messages;

CREATE POLICY "allow all" ON stores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow all" ON messages FOR ALL USING (true) WITH CHECK (true);
