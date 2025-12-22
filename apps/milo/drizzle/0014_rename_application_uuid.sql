-- Rename coolify_service_uuid to application_uuid in bot_pool_slots table
ALTER TABLE "bot_pool_slots" RENAME COLUMN "coolify_service_uuid" TO "application_uuid";

-- Drop coolify_service_uuid from bots table (UUID now always comes from pool slot relation)
ALTER TABLE "bots" DROP COLUMN IF EXISTS "coolify_service_uuid";
