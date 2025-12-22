-- Migration: Rename and cleanup bot columns
--
-- Renames:
--   bot_display_name -> display_name
--   bot_image -> image_url
--   meeting_info -> meeting
--
-- Drops (unused columns):
--   meeting_title
--   chat_enabled
--   deployment_error
--   heartbeat_interval

-- Rename columns
ALTER TABLE "bots" RENAME COLUMN "bot_display_name" TO "display_name";
ALTER TABLE "bots" RENAME COLUMN "bot_image" TO "image_url";
ALTER TABLE "bots" RENAME COLUMN "meeting_info" TO "meeting";

-- Drop unused columns
ALTER TABLE "bots" DROP COLUMN IF EXISTS "meeting_title";
ALTER TABLE "bots" DROP COLUMN IF EXISTS "chat_enabled";
ALTER TABLE "bots" DROP COLUMN IF EXISTS "deployment_error";
ALTER TABLE "bots" DROP COLUMN IF EXISTS "heartbeat_interval";
