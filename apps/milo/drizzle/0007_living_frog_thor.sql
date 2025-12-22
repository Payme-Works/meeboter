CREATE TABLE "bot_pool_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"botId" integer NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"queuedAt" timestamp DEFAULT now() NOT NULL,
	"timeoutAt" timestamp NOT NULL,
	CONSTRAINT "bot_pool_queue_botId_unique" UNIQUE("botId")
);
--> statement-breakpoint
CREATE TABLE "bot_pool_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"coolifyServiceUuid" varchar(255) NOT NULL,
	"slotName" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'idle' NOT NULL,
	"assignedBotId" integer,
	"lastUsedAt" timestamp,
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bot_pool_slots_coolifyServiceUuid_unique" UNIQUE("coolifyServiceUuid")
);
--> statement-breakpoint
ALTER TABLE "bot_pool_queue" ADD CONSTRAINT "bot_pool_queue_botId_bots_id_fk" FOREIGN KEY ("botId") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_pool_slots" ADD CONSTRAINT "bot_pool_slots_assignedBotId_bots_id_fk" FOREIGN KEY ("assignedBotId") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_pool_queue_priority_queued_at_idx" ON "bot_pool_queue" USING btree ("priority","queuedAt");--> statement-breakpoint
CREATE INDEX "bot_pool_slots_status_idx" ON "bot_pool_slots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bot_pool_slots_assigned_bot_id_idx" ON "bot_pool_slots" USING btree ("assignedBotId");