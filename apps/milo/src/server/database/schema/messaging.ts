import {
	index,
	integer,
	json,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { pgTable } from "../helpers/columns";
import { botsTable } from "./bots";
import { usersTable } from "./users";

/**
 * Database implementation for message templates
 * Stores reusable message templates with arrays of message variations
 */
export const messageTemplatesTable = pgTable(
	"message_templates",
	{
		/** Unique identifier for the template */
		id: serial("id").primaryKey(),
		/** Reference to the user who owns this template */
		userId: text("user_id")
			.references(() => usersTable.id, { onDelete: "cascade" })
			.notNull(),
		/** User-friendly name for the template */
		templateName: varchar("template_name", { length: 255 }).notNull(),
		/** Array of message variations for randomized selection */
		messages: json("messages").$type<string[]>().notNull(),
		/** When this template was created */
		createdAt: timestamp("created_at").notNull().defaultNow(),
		/** When this template was last updated */
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("message_templates_user_id_idx").on(table.userId),
		index("message_templates_created_at_idx").on(table.createdAt),
	],
);

/**
 * Validation schema for creating new message templates
 */
export const insertMessageTemplateSchema = createInsertSchema(
	messageTemplatesTable,
)
	.omit({
		id: true,
		userId: true,
		createdAt: true,
		updatedAt: true,
	})
	.extend({
		messages: z.array(z.string().min(1)).min(1),
	});

/**
 * Validation schema for message template selection queries
 */
export const selectMessageTemplateSchema = createSelectSchema(
	messageTemplatesTable,
	{
		messages: z.array(z.string()),
	},
);

export type SelectMessageTemplateType = z.infer<
	typeof selectMessageTemplateSchema
>;

/**
 * Database implementation for bot chat messages
 * Stores history of all messages sent through bots
 */
export const botChatMessagesTable = pgTable(
	"bot_chat_messages",
	{
		/** Unique identifier for the message */
		id: serial("id").primaryKey(),
		/** Reference to the bot that sent this message */
		botId: integer("bot_id")
			.references(() => botsTable.id, { onDelete: "cascade" })
			.notNull(),
		/** Reference to the user who initiated this message */
		userId: text("user_id")
			.references(() => usersTable.id, { onDelete: "cascade" })
			.notNull(),
		/** The actual message text that was sent */
		messageText: text("message_text").notNull(),
		/** Reference to the template used (null for manual messages) */
		templateId: integer("template_id").references(
			() => messageTemplatesTable.id,
			{
				onDelete: "set null",
			},
		),
		/** When the message was sent */
		sentAt: timestamp("sent_at").notNull().defaultNow(),
		/** Status of message delivery */
		status: varchar("status", { length: 50 }).notNull().default("pending"),
		/** Error message if delivery failed */
		error: text("error"),
	},
	(table) => [
		index("bot_chat_messages_bot_id_idx").on(table.botId),
		index("bot_chat_messages_user_id_idx").on(table.userId),
		index("bot_chat_messages_sent_at_idx").on(table.sentAt),
		index("bot_chat_messages_template_id_idx").on(table.templateId),
	],
);

/**
 * Validation schema for creating new bot chat messages
 */
export const insertBotChatMessageSchema = createInsertSchema(
	botChatMessagesTable,
).omit({
	id: true,
	sentAt: true,
});

/**
 * Validation schema for bot chat message selection queries
 */
export const selectBotChatMessageSchema =
	createSelectSchema(botChatMessagesTable);

export type SelectBotChatMessageType = z.infer<
	typeof selectBotChatMessageSchema
>;
