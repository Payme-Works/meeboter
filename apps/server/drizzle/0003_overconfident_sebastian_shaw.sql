CREATE INDEX "bots_user_id_idx" ON "bots" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bots_status_idx" ON "bots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bots_start_time_idx" ON "bots" USING btree ("startTime");--> statement-breakpoint
CREATE INDEX "bots_end_time_idx" ON "bots" USING btree ("endTime");--> statement-breakpoint
CREATE INDEX "bots_last_heartbeat_idx" ON "bots" USING btree ("lastHeartbeat");--> statement-breakpoint
CREATE INDEX "bots_user_id_status_idx" ON "bots" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "bots_user_id_created_at_idx" ON "bots" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "bots_created_at_idx" ON "bots" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "events_bot_id_idx" ON "events" USING btree ("botId");--> statement-breakpoint
CREATE INDEX "events_event_time_idx" ON "events" USING btree ("eventTime");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "events" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "events_bot_id_event_time_idx" ON "events" USING btree ("botId","eventTime");--> statement-breakpoint
CREATE INDEX "events_bot_id_event_type_idx" ON "events" USING btree ("botId","eventType");--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("createdAt");