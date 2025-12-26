-- Create global deployment queue for hybrid infrastructure
-- Supports multi-platform bot deployments with capacity limits

CREATE TABLE IF NOT EXISTS "deployment_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"bot_id" integer NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"timeout_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'WAITING' NOT NULL
);--> statement-breakpoint

-- Add foreign key constraint
DO $$ BEGIN
 ALTER TABLE "deployment_queue" ADD CONSTRAINT "deployment_queue_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- Add unique constraint on bot_id
ALTER TABLE "deployment_queue" ADD CONSTRAINT "deployment_queue_bot_id_unique" UNIQUE("bot_id");--> statement-breakpoint

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS "deployment_queue_bot_id_idx" ON "deployment_queue" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_queue_status_idx" ON "deployment_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_queue_priority_queued_at_idx" ON "deployment_queue" USING btree ("priority", "queued_at");
