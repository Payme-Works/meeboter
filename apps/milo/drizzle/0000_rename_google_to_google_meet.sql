-- Migration: Rename platform 'google' to 'google-meet'
-- This updates existing records in the bots table to use the new platform naming convention

UPDATE bots
SET meeting_info = jsonb_set(meeting_info, '{platform}', '"google-meet"')
WHERE meeting_info->>'platform' = 'google';
