-- Migration: Fix platform 'google' to 'google-meet' (re-run)
-- This updates existing records in the bots table to use the new platform naming convention
-- Handles both exact match and case-insensitive match

UPDATE bots
SET meeting_info = jsonb_set(meeting_info, '{platform}', '"google-meet"')
WHERE meeting_info->>'platform' = 'google'
   OR LOWER(meeting_info->>'platform') = 'google';
