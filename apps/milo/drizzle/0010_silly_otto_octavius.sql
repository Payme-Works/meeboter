ALTER TABLE "bots" ADD COLUMN "screenshots" json NOT NULL DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "log_level" varchar(10) DEFAULT 'TRACE';