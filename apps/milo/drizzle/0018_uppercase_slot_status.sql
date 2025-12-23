-- Migrate pool slot status to UPPERCASE and rename busy to HEALTHY
-- @see rules/PLATFORM_NOMENCLATURE.md

-- Convert lowercase values to UPPERCASE
UPDATE "bot_pool_slots" SET "status" = 'IDLE' WHERE "status" = 'idle';--> statement-breakpoint
UPDATE "bot_pool_slots" SET "status" = 'DEPLOYING' WHERE "status" = 'deploying';--> statement-breakpoint
UPDATE "bot_pool_slots" SET "status" = 'ERROR' WHERE "status" = 'error';--> statement-breakpoint

-- Rename busy to HEALTHY (and handle uppercase BUSY if any)
UPDATE "bot_pool_slots" SET "status" = 'HEALTHY' WHERE "status" = 'busy';--> statement-breakpoint
UPDATE "bot_pool_slots" SET "status" = 'HEALTHY' WHERE "status" = 'BUSY';--> statement-breakpoint

-- Update default value
ALTER TABLE "bot_pool_slots" ALTER COLUMN "status" SET DEFAULT 'IDLE';
