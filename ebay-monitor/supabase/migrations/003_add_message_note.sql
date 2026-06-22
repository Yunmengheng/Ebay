-- Migration: Add shared notes to messages.
-- Run this in your Supabase SQL editor so notes are visible to every dashboard user.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
