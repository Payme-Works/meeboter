import {
	boolean,
	date,
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

const pgTable = pgTableCreator((name) => name);

export const subscriptionEnum = z.enum(["PRO", "PAY_AS_YOU_GO", "CUSTOM"]);
export type Subscription = z.infer<typeof subscriptionEnum>;

export const subscriptionsTable = pgTable("subscription", {
	id: serial("id").primaryKey(),

	userId: text("userId")
		.references(() => usersTable.id, { onDelete: "cascade" })
		.notNull(),

	type: varchar("type", { length: 50 }).$type<Subscription>().notNull(),
	isActive: boolean("isActive").notNull().default(true),

	startDate: timestamp("startDate").notNull().defaultNow(),
	endDate: timestamp("endDate"),

	createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const usersTable = pgTable("user", {
	id: text("id").primaryKey(),

	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull().default(false),

	image: text("image"),

	customDailyBotLimit: integer("customDailyBotLimit"),

	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const sessionsTable = pgTable("session", {
	id: text("id").primaryKey(),

	expiresAt: timestamp("expiresAt").notNull(),
	token: text("token").notNull().unique(),

	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),

	userId: text("userId")
		.notNull()
		.references(() => usersTable.id, { onDelete: "cascade" }),

	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const accountsTable = pgTable("account", {
	id: text("id").primaryKey(),

	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),

	userId: text("userId")
		.notNull()
		.references(() => usersTable.id, { onDelete: "cascade" }),

	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),

	accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),

	scope: text("scope"),
	password: text("password"),

	createdAt: timestamp("createdAt").notNull().defaultNow(),
	updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verificationTable = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt").notNull(),
	createdAt: timestamp("createdAt").defaultNow(),
	updatedAt: timestamp("updatedAt").defaultNow(),
});

export const apiKeysTable = pgTable("apiKeys", {
	id: serial("id").primaryKey(),
	userId: text("userId")
		.references(() => usersTable.id)
		.notNull(),
	key: varchar("key", { length: 64 }).notNull().unique(),
	name: varchar("name", { length: 255 }).notNull(),
	createdAt: timestamp("createdAt").defaultNow(),
	lastUsedAt: timestamp("lastUsedAt"),
	expiresAt: timestamp("expiresAt"),
	isRevoked: boolean("isRevoked").default(false),
});

export const insertApiKeySchema = createInsertSchema(apiKeysTable).pick({
	name: true,
	expiresAt: true,
});

export const selectApiKeySchema = createSelectSchema(apiKeysTable);

/** API REQUEST LOGS */
export const apiRequestLogsTable = pgTable("apiRequestLogs", {
	id: serial("id").primaryKey(),
	apiKeyId: integer("apiKeyId")
		.references(() => apiKeysTable.id)
		.notNull(),
	userId: text("userId")
		.references(() => usersTable.id)
		.notNull(),
	method: varchar("method", { length: 10 }).notNull(),
	path: varchar("path", { length: 255 }).notNull(),
	statusCode: integer("statusCode").notNull(),
	requestBody: json("requestBody").$type<Record<string, unknown> | null>(),
	responseBody: json("responseBody").$type<Record<string, unknown> | null>(),
	error: varchar("error", { length: 1024 }),
	duration: integer("duration").notNull(),
	createdAt: timestamp("createdAt").defaultNow(),
});

export const insertApiRequestLogSchema = createInsertSchema(
	apiRequestLogsTable,
).omit({
	id: true,
	createdAt: true,
});

export const selectApiRequestLogSchema = createSelectSchema(
	apiRequestLogsTable,
	{
		requestBody: z.any(),
		responseBody: z.any(),
	},
);

export const speakerTimeframeSchema = z.object({
	speakerName: z.string(),
	start: z.number(),
	end: z.number(),
});
export type SpeakerTimeframe = z.infer<typeof speakerTimeframeSchema>;

/** BOT CONFIG */
const automaticLeaveSchema = z.object({
	waitingRoomTimeout: z.number(), // the milliseconds before the bot leaves the meeting if it is in the waiting room
	noOneJoinedTimeout: z.number(), // the milliseconds before the bot leaves the meeting if no one has joined
	everyoneLeftTimeout: z.number(), // the milliseconds before the bot leaves the meeting if everyone has left
	inactivityTimeout: z.number(), // the milliseconds before the bot leaves the meeting if there has been no activity
});

export type AutomaticLeave = z.infer<typeof automaticLeaveSchema>;

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

// Define base status codes
export const status = z.enum([
	"READY_TO_DEPLOY",
	"DEPLOYING",
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"CALL_ENDED",
	"DONE",
	"FATAL",
]);

export type Status = z.infer<typeof status>;

// Event codes include all status codes plus additional event-only codes
const allEventCodes = [
	...status.options,
	"PARTICIPANT_JOIN",
	"PARTICIPANT_LEAVE",
	"LOG",
] as const;

// Define descriptions for all event types
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

// Define event codes with descriptions
export const eventCode = z.enum(allEventCodes).describe("Event type code");

export type EventCode = z.infer<typeof eventCode>;

export const botsTable = pgTable("bots", {
	id: serial("id").primaryKey(),
	botDisplayName: varchar("botDisplayName", { length: 255 }).notNull(),
	botImage: varchar("botImage", { length: 255 }),

	userId: text("userId")
		.references(() => usersTable.id)
		.notNull(),

	meetingTitle: varchar("meetingTitle", { length: 255 }).notNull(),
	meetingInfo: json("meetingInfo").$type<MeetingInfo>().notNull(),

	startTime: timestamp("startTime").notNull(),
	endTime: timestamp("endTime").notNull(),

	recording: varchar("recording", { length: 255 }),
	recordingEnabled: boolean("recordingEnabled").notNull().default(false),
	speakerTimeframes: json("speakerTimeframes")
		.$type<SpeakerTimeframe[]>()
		.notNull()
		.default([]),
	lastHeartbeat: timestamp("lastHeartbeat"),

	status: varchar("status", { length: 255 })
		.$type<Status>()
		.notNull()
		.default("READY_TO_DEPLOY"),

	deploymentError: varchar("deploymentError", { length: 1024 }),

	heartbeatInterval: integer("heartbeatInterval").notNull(),
	automaticLeave: json("automaticLeave").$type<AutomaticLeave>().notNull(),
	callbackUrl: varchar("callbackUrl", { length: 1024 }),

	createdAt: timestamp("createdAt").defaultNow(),
});

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
});
export type InsertBotType = z.infer<typeof insertBotSchema>;

export const selectBotSchema = createSelectSchema(botsTable, {
	meetingInfo: meetingInfoSchema,
	automaticLeave: automaticLeaveSchema,
	speakerTimeframes: z.array(speakerTimeframeSchema),
});
export type SelectBotType = z.infer<typeof selectBotSchema>;

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
});
export type BotConfig = z.infer<typeof botConfigSchema>;

export const deployBotInputSchema = z.object({
	id: z.number(),
	botConfig: botConfigSchema,
});

const participantJoinData = z.object({
	participantId: z.string(),
});

const participantLeaveData = z.object({
	participantId: z.string(),
});

const logData = z.object({
	message: z.string(),
});

const statusData = z.object({
	sub_code: z.string().optional(),
	description: z.string().optional(),
});

export const eventData = z.union([
	participantJoinData,
	participantLeaveData,
	logData,
	statusData,
]);
export type EventData = z.infer<typeof eventData>;

export const events = pgTable("events", {
	id: serial("id").primaryKey(),
	botId: integer("botId")
		.references(() => botsTable.id)
		.notNull(),
	eventType: varchar("eventType", { length: 255 }).$type<EventCode>().notNull(),
	eventTime: timestamp("eventTime").notNull(),
	data: json("data").$type<EventData | null>(),
	createdAt: timestamp("createdAt").defaultNow(),
});

export const insertEventSchema = createInsertSchema(events)
	.omit({
		id: true,
		createdAt: true,
	})
	.extend({
		data: eventData.nullable(),
		eventType: eventCode,
	});

export const selectEventSchema = createSelectSchema(events).extend({
	data: eventData.nullable(),
	eventType: eventCode,
});

export type SelectEventType = z.infer<typeof selectEventSchema>;

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable);
export const selectSubscriptionSchema = createSelectSchema(subscriptionsTable);
