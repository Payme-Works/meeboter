-- Add deployment platform tracking columns to bots table
ALTER TABLE "bots" ADD COLUMN "deployment_platform" varchar(20);
ALTER TABLE "bots" ADD COLUMN "platform_identifier" varchar(255);

-- Create index for platform-based queries
CREATE INDEX IF NOT EXISTS "bots_deployment_platform_idx" ON "bots" USING btree ("deployment_platform");
