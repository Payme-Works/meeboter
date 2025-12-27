-- Drop the deprecated bot_pool_queue table
-- Queue functionality has been consolidated into the global deployment_queue table

DROP TABLE IF EXISTS "bot_pool_queue";
