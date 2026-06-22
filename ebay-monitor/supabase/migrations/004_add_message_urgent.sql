-- Migration: Add shared urgent marker to messages.
-- Run this in your Supabase SQL editor so urgent markers sync across devices.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS urgent BOOLEAN NOT NULL DEFAULT FALSE;
