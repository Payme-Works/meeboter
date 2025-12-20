-- Migration: Fix platform 'google' to 'google-meet'
-- The meeting_info column is JSON (not JSONB), so we need to cast it
-- to JSONB for modification, then back to JSON

UPDATE bots
SET meeting_info = jsonb_set(meeting_info::jsonb, '{platform}', '"google-meet"')::json
WHERE meeting_info->>'platform' = 'google';
