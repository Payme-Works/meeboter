import {
	boolean,
	index,
	integer,
	json,
	pgTableCreator,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * Creates database tables with consistent naming convention
 */
const pgTable = pgTableCreator((name) => name);

/**
 * Enum defining available subscription types for users
 */
export const subscriptionEnum = z.enum(["PRO", "PAY_AS_YOU_GO", "CUSTOM"]);
export type Subscription = z.infer<typeof subscriptionEnum>;

/**
 * Database implementation for user subscriptions
 * Stores subscription information including type, status, and duration
 */
export const subscriptionsTable = pgTable("subscription", {
	/** Unique identifier for the subscription */
	id: serial("id").primaryKey(),

	/** Reference to the user who owns this subscription */
	userId: text("userId")
		.references(() => usersTable.id, { onDelete: "cascade" })
		.notNull(),

	/** Type of subscription (PRO, PAY_AS_YOU_GO, CUSTOM) */
	type: varchar("type", { length: 50 }).$type<Subscription>().notNull(),
	/** Whether the subscription is currently active */
	isActive: boolean("isActive").notNull().default(true),

	/** When the subscription started */
	startDate: timestamp("startDate").notNull().defaultNow(),
	/** When the subscription ends (null for indefinite) */
	endDate: timestamp("endDate"),

	/** When this subscription record was created */
	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/**
 * Database implementation for application users
 * Stores user profile information and account settings
 */
export const usersTable = pgTable("user", {
	/** Unique identifier for the user */
	id: text("id").primaryKey(),

	/** User's display name */
	name: text("name").notNull(),
	/** User's email address (unique across all users) */
	email: text("email").notNull().unique(),
	/** Whether the user's email has been verified */
	emailVerified: boolean("emailVerified").notNull().default(false),

	/** URL to user's profile image */
	image: text("image"),

	/** Custom daily bot limit for this user (overrides default limits) */
	customDailyBotLimit: integer("customDailyBotLimit"),

	/** When this user account was created */
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	/** When this user account was last updated */
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Database implementation for user authentication sessions
 * Stores session tokens and metadata for logged-in users
 */
export const sessionsTable = pgTable("session", {
	/** Unique identifier for the session */
	id: text("id").primaryKey(),

	/** When this session expires */
	expiresAt: timestamp("expiresAt").notNull(),
	/** Session token (unique across all sessions) */
	token: text("token").notNull().unique(),

	/** IP address where the session was created */
	ipAddress: text("ipAddress"),
	/** User agent string from the client */
	userAgent: text("userAgent"),

	/** Reference to the user who owns this session */
	userId: text("userId")
		.notNull()
		.references(() => usersTable.id, { onDelete: "cascade" }),

	/** When this session was created */
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	/** When this session was last updated */
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Database implementation for OAuth provider accounts
 * Links users to their external authentication providers (Google, GitHub, etc.)
 */
export const accountsTable = pgTable("account", {
	/** Unique identifier for this account link */
	id: text("id").primaryKey(),

	/** Account ID from the external provider */
	accountId: text("accountId").notNull(),
	/** Identifier of the OAuth provider */
	providerId: text("providerId").notNull(),

	/** Reference to the user who owns this account */
	userId: text("userId")
		.notNull()
		.references(() => usersTable.id, { onDelete: "cascade" }),

	/** OAuth access token for API calls */
	accessToken: text("accessToken"),
	/** OAuth refresh token for renewing access */
	refreshToken: text("refreshToken"),
	/** OpenID Connect ID token */
	idToken: text("idToken"),

	/** When the access token expires */
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	/** When the refresh token expires */
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),

	/** OAuth scope permissions granted */
	scope: text("scope"),
	/** Hashed password for local authentication */
	password: text("password"),

	/** When this account was linked */
	createdAt: timestamp("createdAt").notNull().defaultNow(),
	/** When this account was last updated */
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

/**
 * Database implementation for email verification tokens
 * Stores temporary tokens for email verification and password reset flows
 */
export const verificationTable = pgTable("verification", {
	/** Unique identifier for this verification token */
	id: text("id").primaryKey(),
	/** Email address or identifier being verified */
	identifier: text("identifier").notNull(),
	/** Verification token value */
	value: text("value").notNull(),
	/** When this verification token expires */
	expiresAt: timestamp("expiresAt").notNull(),
	/** When this verification token was created */
	createdAt: timestamp("createdAt").defaultNow(),
	/** When this verification token was last updated */
	updatedAt: timestamp("updatedAt").defaultNow(),
});

/**
 * Database implementation for user API keys
 * Stores API keys that users can generate to access the platform programmatically
 */
export const apiKeysTable = pgTable("apiKeys", {
	/** Unique identifier for the API key */
	id: serial("id").primaryKey(),
	/** Reference to the user who owns this API key */
	userId: text("userId")
		.references(() => usersTable.id)
		.notNull(),
	/** The actual API key value (hashed) */
	key: varchar("key", { length: 64 }).notNull().unique(),
	/** User-friendly name for the API key */
	name: varchar("name", { length: 255 }).notNull(),
	/** When this API key was created */
	createdAt: timestamp("createdAt").defaultNow(),
	/** When this API key was last used */
	lastUsedAt: timestamp("lastUsedAt"),
	/** When this API key expires (null for no expiration) */
	expiresAt: timestamp("expiresAt"),
	/** Whether this API key has been revoked */
	isRevoked: boolean("isRevoked").default(false),
});

/**
 * Validation schema for creating new API keys
 * Only includes user-provided fields
 */
export const insertApiKeySchema = createInsertSchema(apiKeysTable).pick({
	name: true,
	expiresAt: true,
});

/**
 * Validation schema for API key selection queries
 */
export const selectApiKeySchema = createSelectSchema(apiKeysTable);

/**
 * Database implementation for API request logging
 * Tracks all API requests for monitoring, debugging, and usage analytics
 */
export const apiRequestLogsTable = pgTable("apiRequestLogs", {
	/** Unique identifier for this request log */
	id: serial("id").primaryKey(),
	/** Reference to the API key used for this request */
	apiKeyId: integer("apiKeyId")
		.references(() => apiKeysTable.id)
		.notNull(),
	/** Reference to the user who made this request */
	userId: text("userId")
		.references(() => usersTable.id)
		.notNull(),
	/** HTTP method used for the request */
	method: varchar("method", { length: 10 }).notNull(),
	/** API endpoint path that was called */
	path: varchar("path", { length: 255 }).notNull(),
	/** HTTP status code returned */
	statusCode: integer("statusCode").notNull(),
	/** JSON body of the request */
	requestBody: json("requestBody").$type<Record<string, unknown> | null>(),
	/** JSON body of the response */
	responseBody: json("responseBody").$type<Record<string, unknown> | null>(),
	/** Error message if the request failed */
	error: varchar("error", { length: 1024 }),
	/** Request duration in milliseconds */
	duration: integer("duration").notNull(),
	/** When this request was made */
	createdAt: timestamp("createdAt").defaultNow(),
});

/**
 * Validation schema for creating new API request logs
 * Excludes auto-generated fields
 */
export const insertApiRequestLogSchema = createInsertSchema(
	apiRequestLogsTable,
).omit({
	id: true,
	createdAt: true,
});

/**
 * Validation schema for API request log selection queries
 * Includes custom validation for JSON fields
 */
export const selectApiRequestLogSchema = createSelectSchema(
	apiRequestLogsTable,
	{
		requestBody: z.any(),
		responseBody: z.any(),
	},
);

/**
 * Schema for speaker timeframe tracking in recordings
 * Defines when each speaker was active during a meeting
 */
export const speakerTimeframeSchema = z.object({
	speakerName: z.string(),
	start: z.number(),
	end: z.number(),
});
export type SpeakerTimeframe = z.infer<typeof speakerTimeframeSchema>;

/**
 * Schema for automatic bot leave configuration
 * Defines timeout conditions for when bots should automatically leave meetings
 */
const automaticLeaveSchema = z.object({
	/** Milliseconds before bot leaves if stuck in waiting room */
	waitingRoomTimeout: z.number(),
	/** Milliseconds before bot leaves if no one joins the meeting */
	noOneJoinedTimeout: z.number(),
	/** Milliseconds before bot leaves if everyone else has left */
	everyoneLeftTimeout: z.number(),
	/** Milliseconds before bot leaves due to meeting inactivity */
	inactivityTimeout: z.number(),
});

export type AutomaticLeave = z.infer<typeof automaticLeaveSchema>;

/**
 * Schema for meeting information
 * Contains platform-specific details needed to join meetings
 */
export const meetingInfoSchema = z.object({
	meetingId: z.string().optional().describe("Meeting ID"),
	meetingPassword: z.string().optional().describe("Meeting password"),
	meetingUrl: z.string().optional().describe("Meeting URL"),
	organizerId: z.string().optional().describe("Organizer ID"),
	tenantId: z.string().optional().describe("Tenant ID"),
	messageId: z.string().optional().describe("Message ID"),
	threadId: z.string().optional().describe("Thread ID"),
	platform: z.enum(["zoom", "teams", "google"]).optional().describe("Platform"),
});
export type MeetingInfo = z.infer<typeof meetingInfoSchema>;

/**
 * Bot status codes representing the current state of a bot
 */
export const status = z.enum([
	"READY_TO_DEPLOY",
	"QUEUED", // Waiting for pool slot
	"DEPLOYING",
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"CALL_ENDED",
	"DONE",
	"FATAL",
]);

export type Status = z.infer<typeof status>;

/**
 * All possible event codes including status codes and additional event types
 */
const allEventCodes = [
	...status.options,
	"PARTICIPANT_JOIN",
	"PARTICIPANT_LEAVE",
	"LOG",
] as const;

/**
 * Descriptions for all event types to help with understanding bot behavior
 */
export const EVENT_DESCRIPTIONS = {
	PARTICIPANT_JOIN:
		"A participant has joined the call. The data.participantId will contain the id of the participant.",
	PARTICIPANT_LEAVE:
		"A participant has left the call. The data.participantId will contain the id of the participant.",
	READY_TO_DEPLOY:
		"Resources have been provisioned and the bot is ready internally to join a meeting.",
	DEPLOYING:
		"The bot is in the process of being deployed with the specified configuration.",
	JOINING_CALL:
		"The bot has acknowledged the request to join the call, and is in the process of connecting.",
	IN_WAITING_ROOM: "The bot is in the waiting room of the meeting.",
	IN_CALL: "The bot is in the meeting, and is currently recording audio.",
	CALL_ENDED:
		"The bot has left the call. The data.sub_code and data.description will contain the reason for why the call ended.",
	DONE: "The bot has shut down.",
	FATAL:
		"The bot has encountered an error. The data.sub_code and data.description will contain the reason for the failure.",
	LOG: "Catch-all for any logs that were produced that don't fit any other event type. The data.message will contain the log contents.",
} as const;

/**
 * Event type codes for bot events and status changes
 */
export const eventCode = z.enum(allEventCodes).describe("Event type code");

export type EventCode = z.infer<typeof eventCode>;

/**
 * Database implementation for meeting bots
 * Stores bot configuration, status, and recording information
 */
export const botsTable = pgTable(
	"bots",
	{
		/** Unique identifier for the bot */
		id: serial("id").primaryKey(),
		/** Display name shown for the bot in meetings */
		botDisplayName: varchar("botDisplayName", { length: 255 }).notNull(),
		/** URL to bot's avatar image */
		botImage: varchar("botImage", { length: 255 }),

		/** Reference to the user who owns this bot */
		userId: text("userId")
			.references(() => usersTable.id)
			.notNull(),

		/** Title of the meeting this bot will join */
		meetingTitle: varchar("meetingTitle", { length: 255 }).notNull(),
		/** Platform-specific meeting connection details */
		meetingInfo: json("meetingInfo").$type<MeetingInfo>().notNull(),

		/** Scheduled start time for the meeting */
		startTime: timestamp("startTime").notNull(),
		/** Scheduled end time for the meeting */
		endTime: timestamp("endTime").notNull(),

		/** Path to the recorded audio file */
		recording: varchar("recording", { length: 255 }),
		/** Whether recording is enabled for this bot */
		recordingEnabled: boolean("recordingEnabled").notNull().default(false),
		/** Timeline of when each speaker was active */
		speakerTimeframes: json("speakerTimeframes")
			.$type<SpeakerTimeframe[]>()
			.notNull()
			.default([]),
		/** Last time the bot sent a heartbeat signal */
		lastHeartbeat: timestamp("lastHeartbeat"),

		/** Current status of the bot */
		status: varchar("status", { length: 255 })
			.$type<Status>()
			.notNull()
			.default("READY_TO_DEPLOY"),

		/** Error message if bot deployment failed */
		deploymentError: varchar("deploymentError", { length: 1024 }),

		/** Coolify service UUID for cleanup when bot finishes */
		coolifyServiceUuid: varchar("coolifyServiceUuid", { length: 255 }),

		/** How often the bot sends heartbeat signals (milliseconds) */
		heartbeatInterval: integer("heartbeatInterval").notNull(),
		/** Configuration for automatic leave conditions */
		automaticLeave: json("automaticLeave").$type<AutomaticLeave>().notNull(),
		/** URL to send bot event notifications to */
		callbackUrl: varchar("callbackUrl", { length: 1024 }),
		/** Whether chat messaging is enabled for this bot */
		chatEnabled: boolean("chatEnabled").notNull().default(false),

		/** When this bot was created */
		createdAt: timestamp("createdAt").defaultNow(),
	},
	(table) => {
		return {
			// Performance indexes for common query patterns
			userIdIdx: index("bots_user_id_idx").on(table.userId),
			statusIdx: index("bots_status_idx").on(table.status),
			startTimeIdx: index("bots_start_time_idx").on(table.startTime),
			endTimeIdx: index("bots_end_time_idx").on(table.endTime),
			lastHeartbeatIdx: index("bots_last_heartbeat_idx").on(
				table.lastHeartbeat,
			),
			// Compound indexes for common queries
			userIdStatusIdx: index("bots_user_id_status_idx").on(
				table.userId,
				table.status,
			),
			userIdCreatedAtIdx: index("bots_user_id_created_at_idx").on(
				table.userId,
				table.createdAt,
			),
			createdAtIdx: index("bots_created_at_idx").on(table.createdAt),
		};
	},
);

/**
 * Validation schema for creating new bots
 * Defines required and optional fields for bot creation
 */
export const insertBotSchema = z.object({
	botDisplayName: z.string().optional(),
	botImage: z.string().url().optional(),
	meetingTitle: z.string().optional(),
	meetingInfo: meetingInfoSchema,
	startTime: z.date().optional(),
	endTime: z.date().optional(),
	recordingEnabled: z.boolean().optional().default(false),
	heartbeatInterval: z.number().optional(),
	automaticLeave: automaticLeaveSchema.optional(),
	callbackUrl: z
		.string()
		.url()
		.optional()
		.describe("URL to receive bot event notifications"),
	chatEnabled: z.boolean().optional().default(true),
});
export type InsertBotType = z.infer<typeof insertBotSchema>;

/**
 * Validation schema for bot selection queries
 * Includes custom validation for complex JSON fields
 */
export const selectBotSchema = createSelectSchema(botsTable, {
	meetingInfo: meetingInfoSchema,
	automaticLeave: automaticLeaveSchema,
	speakerTimeframes: z.array(speakerTimeframeSchema),
});
export type SelectBotType = z.infer<typeof selectBotSchema>;

/**
 * Schema for complete bot configuration
 * Used for bot deployment and runtime configuration
 */
export const botConfigSchema = z.object({
	id: z.number(),
	userId: z.string(),
	meetingInfo: meetingInfoSchema,
	meetingTitle: z.string(),
	startTime: z.date(),
	endTime: z.date(),
	botDisplayName: z.string(),
	botImage: z.string().url().optional(),
	recordingEnabled: z.boolean(),
	heartbeatInterval: z.number(),
	automaticLeave: automaticLeaveSchema,
	callbackUrl: z
		.string()
		.url()
		.optional()
		.describe("URL to receive bot event notifications"),
	chatEnabled: z.boolean(),
	miloUrl: z.string().url().describe("Milo API base URL for tRPC calls"),
});
export type BotConfig = z.infer<typeof botConfigSchema>;

/**
 * Schema for bot deployment requests
 * Includes bot ID and complete configuration
 */
export const deployBotInputSchema = z.object({
	id: z.number(),
	botConfig: botConfigSchema,
});

/**
 * Schema for participant join event data
 */
const participantJoinData = z.object({
	participantId: z.string(),
});

/**
 * Schema for participant leave event data
 */
const participantLeaveData = z.object({
	participantId: z.string(),
});

/**
 * Schema for log event data
 */
const logData = z.object({
	message: z.string(),
});

/**
 * Schema for status change event data
 */
const statusData = z.object({
	sub_code: z.string().optional(),
	description: z.string().optional(),
});

/**
 * Union type for all possible event data structures
 */
export const eventData = z.union([
	participantJoinData,
	participantLeaveData,
	logData,
	statusData,
]);
export type EventData = z.infer<typeof eventData>;

/**
 * Database implementation for bot events
 * Stores all events that occur during bot lifecycle and meeting participation
 */
export const events = pgTable(
	"events",
	{
		/** Unique identifier for this event */
		id: serial("id").primaryKey(),
		/** Reference to the bot that generated this event */
		botId: integer("botId")
			.references(() => botsTable.id)
			.notNull(),
		/** Type of event that occurred */
		eventType: varchar("eventType", { length: 255 })
			.$type<EventCode>()
			.notNull(),
		/** When the event occurred */
		eventTime: timestamp("eventTime").notNull(),
		/** Additional data specific to the event type */
		data: json("data").$type<EventData | null>(),
		/** When this event record was created */
		createdAt: timestamp("createdAt").defaultNow(),
	},
	(table) => {
		return {
			// Critical performance indexes for INSERT and query optimization
			botIdIdx: index("events_bot_id_idx").on(table.botId),
			eventTimeIdx: index("events_event_time_idx").on(table.eventTime),
			eventTypeIdx: index("events_event_type_idx").on(table.eventType),
			// Created at index for chronological queries
			createdAtIdx: index("events_created_at_idx").on(table.createdAt),
		};
	},
);

/**
 * Validation schema for creating new events
 * Excludes auto-generated fields and includes proper type validation
 */
export const insertEventSchema = createInsertSchema(events)
	.omit({
		id: true,
		createdAt: true,
	})
	.extend({
		data: eventData.nullable(),
		eventType: eventCode,
	});

/**
 * Validation schema for event selection queries
 * Includes proper type validation for complex fields
 */
export const selectEventSchema = createSelectSchema(events).extend({
	data: eventData.nullable(),
	eventType: eventCode,
});

export type SelectEventType = z.infer<typeof selectEventSchema>;

/**
 * Validation schema for creating new subscriptions
 */
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable);

/**
 * Validation schema for subscription selection queries
 */
export const selectSubscriptionSchema = createSelectSchema(subscriptionsTable);

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
		userId: text("userId")
			.references(() => usersTable.id, { onDelete: "cascade" })
			.notNull(),
		/** User-friendly name for the template */
		templateName: varchar("templateName", { length: 255 }).notNull(),
		/** Array of message variations for randomized selection */
		messages: json("messages").$type<string[]>().notNull(),
		/** When this template was created */
		createdAt: timestamp("createdAt").notNull().defaultNow(),
		/** When this template was last updated */
		updatedAt: timestamp("updatedAt").notNull().defaultNow(),
	},
	(table) => {
		return {
			userIdIdx: index("message_templates_user_id_idx").on(table.userId),
			createdAtIdx: index("message_templates_created_at_idx").on(
				table.createdAt,
			),
		};
	},
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
		botId: integer("botId")
			.references(() => botsTable.id, { onDelete: "cascade" })
			.notNull(),
		/** Reference to the user who initiated this message */
		userId: text("userId")
			.references(() => usersTable.id, { onDelete: "cascade" })
			.notNull(),
		/** The actual message text that was sent */
		messageText: text("messageText").notNull(),
		/** Reference to the template used (null for manual messages) */
		templateId: integer("templateId").references(
			() => messageTemplatesTable.id,
			{
				onDelete: "set null",
			},
		),
		/** When the message was sent */
		sentAt: timestamp("sentAt").notNull().defaultNow(),
		/** Status of message delivery */
		status: varchar("status", { length: 50 }).notNull().default("pending"),
		/** Error message if delivery failed */
		error: text("error"),
	},
	(table) => {
		return {
			botIdIdx: index("bot_chat_messages_bot_id_idx").on(table.botId),
			userIdIdx: index("bot_chat_messages_user_id_idx").on(table.userId),
			sentAtIdx: index("bot_chat_messages_sent_at_idx").on(table.sentAt),
			templateIdIdx: index("bot_chat_messages_template_id_idx").on(
				table.templateId,
			),
		};
	},
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

/**
 * Pool slot status codes
 */
export const poolSlotStatus = z.enum(["idle", "deploying", "busy", "error"]);
export type PoolSlotStatus = z.infer<typeof poolSlotStatus>;

/**
 * Database implementation for bot pool slots
 * Pre-provisioned Coolify applications for fast bot deployment
 */
export const botPoolSlotsTable = pgTable(
	"bot_pool_slots",
	{
		/** Unique identifier for the pool slot */
		id: serial("id").primaryKey(),
		/** Coolify application UUID */
		coolifyServiceUuid: varchar("coolifyServiceUuid", { length: 255 })
			.notNull()
			.unique(),
		/** Slot name for identification (e.g., "pool-google-meet-001") */
		slotName: varchar("slotName", { length: 255 }).notNull().unique(),
		/** Current status of the slot */
		status: varchar("status", { length: 50 })
			.$type<PoolSlotStatus>()
			.notNull()
			.default("idle"),
		/** Reference to the bot currently using this slot */
		assignedBotId: integer("assignedBotId").references(() => botsTable.id, {
			onDelete: "set null",
		}),
		/** When this slot was last used */
		lastUsedAt: timestamp("lastUsedAt"),
		/** Error message if slot is in error state */
		errorMessage: text("errorMessage"),
		/** Number of recovery attempts made for this slot */
		recoveryAttempts: integer("recoveryAttempts").notNull().default(0),
		/** When this slot was created */
		createdAt: timestamp("createdAt").notNull().defaultNow(),
	},
	(table) => {
		return {
			statusIdx: index("bot_pool_slots_status_idx").on(table.status),
			assignedBotIdIdx: index("bot_pool_slots_assigned_bot_id_idx").on(
				table.assignedBotId,
			),
		};
	},
);

/**
 * Validation schema for bot pool slot selection queries
 */
export const selectBotPoolSlotSchema = createSelectSchema(botPoolSlotsTable);
export type SelectBotPoolSlotType = z.infer<typeof selectBotPoolSlotSchema>;

/**
 * Database implementation for bot pool queue
 * Holds requests waiting for available pool slots
 */
export const botPoolQueueTable = pgTable(
	"bot_pool_queue",
	{
		/** Unique identifier for the queue entry */
		id: serial("id").primaryKey(),
		/** Reference to the bot waiting for a slot */
		botId: integer("botId")
			.references(() => botsTable.id, { onDelete: "cascade" })
			.notNull()
			.unique(),
		/** Priority level (lower = higher priority) */
		priority: integer("priority").notNull().default(100),
		/** When the request was queued */
		queuedAt: timestamp("queuedAt").notNull().defaultNow(),
		/** When the request should timeout */
		timeoutAt: timestamp("timeoutAt").notNull(),
	},
	(table) => {
		return {
			priorityQueuedAtIdx: index("bot_pool_queue_priority_queued_at_idx").on(
				table.priority,
				table.queuedAt,
			),
		};
	},
);

/**
 * Validation schema for bot pool queue selection queries
 */
export const selectBotPoolQueueSchema = createSelectSchema(botPoolQueueTable);
export type SelectBotPoolQueueType = z.infer<typeof selectBotPoolQueueSchema>;
