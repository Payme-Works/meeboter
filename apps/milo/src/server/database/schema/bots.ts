import {
	boolean,
	index,
	integer,
	json,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { pgTable } from "../helpers/columns";
import { usersTable } from "./users";

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
 * Log levels for bot instance logs
 */
export const logLevelSchema = z.enum([
	"TRACE",
	"DEBUG",
	"INFO",
	"WARN",
	"ERROR",
	"FATAL",
]);
export type LogLevel = z.infer<typeof logLevelSchema>;

/**
 * Schema for structured log entries from bot instances
 * Used for real-time log streaming and S3 archival
 */
export const logEntrySchema = z.object({
	/** Unique identifier for deduplication */
	id: z.string(),

	/** Bot instance ID */
	botId: z.number(),

	/** When the log was generated */
	timestamp: z.coerce.date(),

	/** Log level */
	level: logLevelSchema,

	/** Log message */
	message: z.string(),

	/** Bot state when log was generated */
	state: z.string().optional(),

	/** Source file:line location */
	location: z.string().optional(),

	/** Additional structured context data */
	context: z.record(z.string(), z.unknown()).optional(),

	/** Elapsed time since bot start */
	elapsed: z.string().optional(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * Schema for bot screenshot data
 * Captures screenshots during bot lifecycle for debugging
 * 'key' is the S3 object key for the screenshot
 * Uses preprocess to normalize legacy 'url' field to 'key'
 */
export const screenshotDataSchema = z.preprocess(
	(data) => {
		if (typeof data === "object" && data !== null) {
			const d = data as Record<string, unknown>;

			// Normalize legacy 'url' field to 'key'
			if (!d.key && d.url) {
				return { ...d, key: d.url };
			}
		}

		return data;
	},
	z.object({
		key: z.string(),
		capturedAt: z.coerce.date(),
		type: z.enum(["error", "fatal", "manual", "state_change"]),
		state: z.string(),
		trigger: z.string().optional(),
	}),
);
export type ScreenshotData = z.infer<typeof screenshotDataSchema>;

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
	platform: z
		.enum(["zoom", "microsoft-teams", "google-meet"])
		.optional()
		.describe("Platform"),
});
export type MeetingInfo = z.infer<typeof meetingInfoSchema>;

/**
 * Bot status codes representing the current state of a bot
 */
export const status = z.enum([
	"DEPLOYING",
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"LEAVING", // User requested bot to leave, waiting for graceful exit
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
	"USER_REMOVED_FROM_CALL",
	"USER_CANCELLED_DEPLOYMENT",
	"SIGN_IN_REQUIRED",
	"CAPTCHA_DETECTED",
	"MEETING_NOT_FOUND",
	"MEETING_ENDED",
	"PERMISSION_DENIED",
	"JOIN_BLOCKED",
	"RESTARTING",
] as const;

/**
 * Descriptions for all event types to help with understanding bot behavior
 */
export const EVENT_DESCRIPTIONS = {
	PARTICIPANT_JOIN:
		"A participant has joined the call. The data.participantId will contain the id of the participant.",
	PARTICIPANT_LEAVE:
		"A participant has left the call. The data.participantId will contain the id of the participant.",
	DEPLOYING:
		"The bot is in the process of being deployed with the specified configuration.",
	JOINING_CALL:
		"The bot has acknowledged the request to join the call, and is in the process of connecting.",
	IN_WAITING_ROOM: "The bot is in the waiting room of the meeting.",
	IN_CALL: "The bot is in the meeting, and is currently recording audio.",
	LEAVING:
		"The user has requested the bot to leave. The bot is gracefully exiting the meeting.",
	CALL_ENDED:
		"The bot has left the call. The data.sub_code and data.description will contain the reason for why the call ended.",
	DONE: "The bot has shut down.",
	FATAL:
		"The bot has encountered an error. The data.sub_code and data.description will contain the reason for the failure.",
	LOG: "Catch-all for any logs that were produced that don't fit any other event type. The data.message will contain the log contents.",
	USER_REMOVED_FROM_CALL:
		"The bot was manually removed from the call by the user through the dashboard.",
	USER_CANCELLED_DEPLOYMENT:
		"The bot deployment was cancelled by the user before joining the call.",
	SIGN_IN_REQUIRED:
		"The bot was blocked because Google requires sign-in to join this meeting.",
	CAPTCHA_DETECTED:
		"The bot was blocked by a captcha challenge on the meeting page.",
	MEETING_NOT_FOUND:
		"The meeting code or URL is invalid or the meeting does not exist.",
	MEETING_ENDED: "The meeting has already ended and cannot be joined.",
	PERMISSION_DENIED:
		"The bot was denied permission to join the meeting by the host or meeting settings.",
	JOIN_BLOCKED:
		"The bot was unable to join the meeting due to an unspecified blocking screen.",
	RESTARTING:
		"The bot encountered an error and is automatically restarting. The data.description contains the attempt number and error message.",
} as const;

/**
 * Event type codes for bot events and status changes
 */
export const eventCode = z.enum(allEventCodes).describe("Event type code");

export type EventCode = z.infer<typeof eventCode>;

/**
 * Database implementation for meeting bots
 * Stores bot configuration, status, and recording information
 *
 * NOTE: The Coolify application UUID is NOT stored here.
 * It is stored in bot_pool_slots.applicationUuid and accessed via
 * the assignedBotId relationship. This allows pool slots to be
 * reused across multiple bot lifecycles.
 */
export const botsTable = pgTable(
	"bots",
	{
		/** Unique identifier for the bot */
		id: serial("id").primaryKey(),
		/** Display name shown for the bot in meetings */
		botDisplayName: varchar("bot_display_name", { length: 255 }).notNull(),
		/** URL to bot's avatar image */
		botImage: varchar("bot_image", { length: 255 }),

		/** Reference to the user who owns this bot */
		userId: text("user_id")
			.references(() => usersTable.id)
			.notNull(),

		/** Title of the meeting this bot will join */
		meetingTitle: varchar("meeting_title", { length: 255 }).notNull(),
		/** Platform-specific meeting connection details */
		meetingInfo: json("meeting_info").$type<MeetingInfo>().notNull(),

		/** Configuration for automatic leave conditions */
		automaticLeave: json("automatic_leave").$type<AutomaticLeave>().notNull(),

		/** Scheduled start time for the meeting */
		startTime: timestamp("start_time").notNull(),
		/** Scheduled end time for the meeting */
		endTime: timestamp("end_time").notNull(),

		/** Path to the recorded audio file */
		recording: varchar("recording", { length: 255 }),
		/** Whether recording is enabled for this bot */
		recordingEnabled: boolean("recording_enabled").notNull().default(false),
		/** Timeline of when each speaker was active */
		speakerTimeframes: json("speaker_timeframes")
			.$type<SpeakerTimeframe[]>()
			.notNull()
			.default([]),

		/** Current status of the bot */
		status: varchar("status", { length: 255 })
			.$type<Status>()
			.notNull()
			.default("DEPLOYING"),
		/** Last time the bot sent a heartbeat signal */
		lastHeartbeat: timestamp("last_heartbeat"),

		/** Error message if bot deployment failed */
		deploymentError: varchar("deployment_error", { length: 1024 }),

		/** How often the bot sends heartbeat signals (milliseconds) */
		heartbeatInterval: integer("heartbeat_interval").notNull(),
		/** URL to send bot event notifications to */
		callbackUrl: varchar("callback_url", { length: 1024 }),
		/** Whether chat messaging is enabled for this bot */
		chatEnabled: boolean("chat_enabled").notNull().default(false),

		/** Screenshots captured during bot lifecycle for debugging */
		screenshots: json("screenshots")
			.$type<ScreenshotData[]>()
			.notNull()
			.default([]),

		/** Current log level for this bot (runtime configurable) */
		logLevel: varchar("log_level", { length: 10 }).default("TRACE"),

		/** Deployment platform used for this bot (coolify, aws, k8s, local) */
		deploymentPlatform: varchar("deployment_platform", { length: 20 }),

		/** Platform-specific identifier (Job name, task ARN, slot UUID) */
		platformIdentifier: varchar("platform_identifier", { length: 255 }),

		/** When this bot was created */
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => [
		// Performance indexes for common query patterns
		index("bots_user_id_idx").on(table.userId),
		index("bots_status_idx").on(table.status),
		index("bots_start_time_idx").on(table.startTime),
		index("bots_end_time_idx").on(table.endTime),
		index("bots_last_heartbeat_idx").on(table.lastHeartbeat),
		// Compound indexes for common queries
		index("bots_user_id_status_idx").on(table.userId, table.status),
		index("bots_user_id_created_at_idx").on(table.userId, table.createdAt),
		index("bots_created_at_idx").on(table.createdAt),
		// Platform-based queries
		index("bots_deployment_platform_idx").on(table.deploymentPlatform),
	],
);

/**
 * Validation schema for creating new bots
 * Defines required and optional fields for bot creation
 */
export const insertBotSchema = z.object({
	botDisplayName: z.string().optional(),
	botImage: z.url().optional(),
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
	screenshots: z.array(screenshotDataSchema),
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
	botImage: z.url().optional(),
	recordingEnabled: z.boolean(),
	heartbeatInterval: z.number(),
	automaticLeave: automaticLeaveSchema,
	callbackUrl: z
		.string()
		.url()
		.optional()
		.describe("URL to receive bot event notifications"),
	chatEnabled: z.boolean(),
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
		botId: integer("bot_id")
			.references(() => botsTable.id)
			.notNull(),
		/** Type of event that occurred */
		eventType: varchar("event_type", { length: 255 })
			.$type<EventCode>()
			.notNull(),
		/** When the event occurred */
		eventTime: timestamp("event_time").notNull(),
		/** Additional data specific to the event type */
		data: json("data").$type<EventData | null>(),
		/** When this event record was created */
		createdAt: timestamp("created_at").defaultNow(),
	},
	(table) => [
		// Critical performance indexes for INSERT and query optimization
		index("events_bot_id_idx").on(table.botId),
		index("events_event_time_idx").on(table.eventTime),
		index("events_event_type_idx").on(table.eventType),
		// Created at index for chronological queries
		index("events_created_at_idx").on(table.createdAt),
	],
);

/**
 * Validation schema for creating new events
 * Excludes auto-generated fields and includes proper type validation
 */
export const insertEventSchema = z.object({
	botId: z.number(),
	eventType: eventCode,
	eventTime: z.date(),
	data: eventData.nullable(),
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
