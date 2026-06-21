-- Migration: Add subject column to messages table
-- Run this in your Supabase SQL editor if the column does not already exist.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '';
