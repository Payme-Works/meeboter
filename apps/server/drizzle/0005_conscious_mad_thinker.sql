CREATE TABLE "bot_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"botId" integer NOT NULL,
	"userId" text NOT NULL,
	"messageText" text NOT NULL,
	"templateId" integer,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"templateName" varchar(255) NOT NULL,
	"messages" json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "chatEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_chat_messages" ADD CONSTRAINT "bot_chat_messages_botId_bots_id_fk" FOREIGN KEY ("botId") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_chat_messages" ADD CONSTRAINT "bot_chat_messages_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_chat_messages" ADD CONSTRAINT "bot_chat_messages_templateId_message_templates_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_chat_messages_bot_id_idx" ON "bot_chat_messages" USING btree ("botId");--> statement-breakpoint
CREATE INDEX "bot_chat_messages_user_id_idx" ON "bot_chat_messages" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bot_chat_messages_sent_at_idx" ON "bot_chat_messages" USING btree ("sentAt");--> statement-breakpoint
CREATE INDEX "bot_chat_messages_template_id_idx" ON "bot_chat_messages" USING btree ("templateId");--> statement-breakpoint
CREATE INDEX "message_templates_user_id_idx" ON "message_templates" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "message_templates_created_at_idx" ON "message_templates" USING btree ("createdAt");