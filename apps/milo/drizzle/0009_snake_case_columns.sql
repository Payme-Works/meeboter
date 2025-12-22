ALTER TABLE "apiKeys" RENAME TO "api_keys";--> statement-breakpoint
ALTER TABLE "apiRequestLogs" RENAME TO "api_request_logs";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "accountId" TO "account_id";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "providerId" TO "provider_id";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "accessToken" TO "access_token";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "refreshToken" TO "refresh_token";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "idToken" TO "id_token";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "lastUsedAt" TO "last_used_at";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "api_keys" RENAME COLUMN "isRevoked" TO "is_revoked";--> statement-breakpoint
ALTER TABLE "api_request_logs" RENAME COLUMN "apiKeyId" TO "api_key_id";--> statement-breakpoint
ALTER TABLE "api_request_logs" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "api_request_logs" RENAME COLUMN "statusCode" TO "status_code";--> statement-breakpoint
ALTER TABLE "api_request_logs" RENAME COLUMN "requestBody" TO "request_body";--> statement-breakpoint
ALTER TABLE "api_request_logs" RENAME COLUMN "responseBody" TO "response_body";--> statement-breakpoint
ALTER TABLE "api_request_logs" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "bot_chat_messages" RENAME COLUMN "botId" TO "bot_id";--> statement-breakpoint
ALTER TABLE "bot_chat_messages" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "bot_chat_messages" RENAME COLUMN "messageText" TO "message_text";--> statement-breakpoint
ALTER TABLE "bot_chat_messages" RENAME COLUMN "templateId" TO "template_id";--> statement-breakpoint
ALTER TABLE "bot_chat_messages" RENAME COLUMN "sentAt" TO "sent_at";--> statement-breakpoint
ALTER TABLE "bot_pool_queue" RENAME COLUMN "botId" TO "bot_id";--> statement-breakpoint
ALTER TABLE "bot_pool_queue" RENAME COLUMN "queuedAt" TO "queued_at";--> statement-breakpoint
ALTER TABLE "bot_pool_queue" RENAME COLUMN "timeoutAt" TO "timeout_at";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "coolifyServiceUuid" TO "coolify_service_uuid";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "slotName" TO "slot_name";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "assignedBotId" TO "assigned_bot_id";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "lastUsedAt" TO "last_used_at";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "errorMessage" TO "error_message";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "recoveryAttempts" TO "recovery_attempts";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "botDisplayName" TO "bot_display_name";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "botImage" TO "bot_image";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "meetingTitle" TO "meeting_title";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "meetingInfo" TO "meeting_info";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "startTime" TO "start_time";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "endTime" TO "end_time";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "recordingEnabled" TO "recording_enabled";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "speakerTimeframes" TO "speaker_timeframes";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "lastHeartbeat" TO "last_heartbeat";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "deploymentError" TO "deployment_error";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "coolifyServiceUuid" TO "coolify_service_uuid";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "heartbeatInterval" TO "heartbeat_interval";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "automaticLeave" TO "automatic_leave";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "callbackUrl" TO "callback_url";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "chatEnabled" TO "chat_enabled";--> statement-breakpoint
ALTER TABLE "bots" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "botId" TO "bot_id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "eventType" TO "event_type";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "eventTime" TO "event_time";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "message_templates" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "message_templates" RENAME COLUMN "templateName" TO "template_name";--> statement-breakpoint
ALTER TABLE "message_templates" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "message_templates" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "ipAddress" TO "ip_address";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "userAgent" TO "user_agent";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "userId" TO "user_id";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "isActive" TO "is_active";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "startDate" TO "start_date";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "endDate" TO "end_date";--> statement-breakpoint
ALTER TABLE "subscription" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "emailVerified" TO "email_verified";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "customDailyBotLimit" TO "custom_daily_bot_limit";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "verification" RENAME COLUMN "expiresAt" TO "expires_at";--> statement-breakpoint
ALTER TABLE "verification" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "verification" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "apiKeys_key_unique";--> statement-breakpoint
ALTER TABLE "bot_pool_queue" DROP CONSTRAINT "bot_pool_queue_botId_unique";--> statement-breakpoint
ALTER TABLE "bot_pool_slots" DROP CONSTRAINT "bot_pool_slots_coolifyServiceUuid_unique";--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT "account_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "apiKeys_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "api_request_logs" DROP CONSTRAINT "apiRequestLogs_apiKeyId_apiKeys_id_fk";
--> statement-breakpoint
ALTER TABLE "api_request_logs" DROP CONSTRAINT "apiRequestLogs_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bot_chat_messages" DROP CONSTRAINT "bot_chat_messages_botId_bots_id_fk";
--> statement-breakpoint
ALTER TABLE "bot_chat_messages" DROP CONSTRAINT "bot_chat_messages_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bot_chat_messages" DROP CONSTRAINT "bot_chat_messages_templateId_message_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "bot_pool_queue" DROP CONSTRAINT "bot_pool_queue_botId_bots_id_fk";
--> statement-breakpoint
ALTER TABLE "bot_pool_slots" DROP CONSTRAINT "bot_pool_slots_assignedBotId_bots_id_fk";
--> statement-breakpoint
ALTER TABLE "bots" DROP CONSTRAINT "bots_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_botId_bots_id_fk";
--> statement-breakpoint
ALTER TABLE "message_templates" DROP CONSTRAINT "message_templates_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT "session_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_userId_user_id_fk";
--> statement-breakpoint
DROP INDEX "bot_chat_messages_bot_id_idx";--> statement-breakpoint
DROP INDEX "bot_chat_messages_user_id_idx";--> statement-breakpoint
DROP INDEX "bot_chat_messages_sent_at_idx";--> statement-breakpoint
DROP INDEX "bot_chat_messages_template_id_idx";--> statement-breakpoint
DROP INDEX "bot_pool_queue_priority_queued_at_idx";--> statement-breakpoint
DROP INDEX "bot_pool_slots_assigned_bot_id_idx";--> statement-breakpoint
DROP INDEX "bots_user_id_idx";--> statement-breakpoint
DROP INDEX "bots_start_time_idx";--> statement-breakpoint
DROP INDEX "bots_end_time_idx";--> statement-breakpoint
DROP INDEX "bots_last_heartbeat_idx";--> statement-breakpoint
DROP INDEX "bots_user_id_status_idx";--> statement-breakpoint
DROP INDEX "bots_user_id_created_at_idx";--> statement-breakpoint
DROP INDEX "bots_created_at_idx";--> statement-breakpoint
DROP INDEX "events_bot_id_idx";--> statement-breakpoint
DROP INDEX "events_event_time_idx";--> statement-breakpoint
DROP INDEX "events_event_type_idx";--> statement-breakpoint
DROP INDEX "events_created_at_idx";--> statement-breakpoint
DROP INDEX "message_templates_user_id_idx";--> statement-breakpoint
DROP INDEX "message_templates_created_at_idx";--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_chat_messages" ADD CONSTRAINT "bot_chat_messages_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_chat_messages" ADD CONSTRAINT "bot_chat_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_chat_messages" ADD CONSTRAINT "bot_chat_messages_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_pool_queue" ADD CONSTRAINT "bot_pool_queue_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_pool_slots" ADD CONSTRAINT "bot_pool_slots_assigned_bot_id_bots_id_fk" FOREIGN KEY ("assigned_bot_id") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_chat_messages_bot_id_idx" ON "bot_chat_messages" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "bot_chat_messages_user_id_idx" ON "bot_chat_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bot_chat_messages_sent_at_idx" ON "bot_chat_messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "bot_chat_messages_template_id_idx" ON "bot_chat_messages" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "bot_pool_queue_priority_queued_at_idx" ON "bot_pool_queue" USING btree ("priority","queued_at");--> statement-breakpoint
CREATE INDEX "bot_pool_slots_assigned_bot_id_idx" ON "bot_pool_slots" USING btree ("assigned_bot_id");--> statement-breakpoint
CREATE INDEX "bots_user_id_idx" ON "bots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bots_start_time_idx" ON "bots" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "bots_end_time_idx" ON "bots" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "bots_last_heartbeat_idx" ON "bots" USING btree ("last_heartbeat");--> statement-breakpoint
CREATE INDEX "bots_user_id_status_idx" ON "bots" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "bots_user_id_created_at_idx" ON "bots" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bots_created_at_idx" ON "bots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_bot_id_idx" ON "events" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "events_event_time_idx" ON "events" USING btree ("event_time");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "message_templates_user_id_idx" ON "message_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_templates_created_at_idx" ON "message_templates" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_key_unique" UNIQUE("key");--> statement-breakpoint
ALTER TABLE "bot_pool_queue" ADD CONSTRAINT "bot_pool_queue_bot_id_unique" UNIQUE("bot_id");--> statement-breakpoint
ALTER TABLE "bot_pool_slots" ADD CONSTRAINT "bot_pool_slots_coolify_service_uuid_unique" UNIQUE("coolify_service_uuid");--> statement-breakpoint
ALTER TABLE "bot_pool_slots" ADD CONSTRAINT "bot_pool_slots_slot_name_unique" UNIQUE("slot_name");