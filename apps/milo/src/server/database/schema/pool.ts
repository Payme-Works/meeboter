import {
	index,
	integer,
	serial,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { pgTable } from "../helpers/columns";
import { botsTable } from "./bots";

/**
 * Pool slot status codes (Coolify platform nomenclature)
 *
 * @see rules/PLATFORM_NOMENCLATURE.md
 */
export const poolSlotStatus = z.enum(["IDLE", "DEPLOYING", "HEALTHY", "ERROR"]);

type PoolSlotStatus = z.infer<typeof poolSlotStatus>;

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
		applicationUuid: varchar("application_uuid", { length: 255 })
			.notNull()
			.unique(),
		/** Slot name for identification (e.g., "pool-google-meet-001") */
		slotName: varchar("slot_name", { length: 255 }).notNull().unique(),
		/** Current status of the slot */
		status: varchar("status", { length: 50 })
			.$type<PoolSlotStatus>()
			.notNull()
			.default("IDLE"),
		/** Reference to the bot currently using this slot */
		assignedBotId: integer("assigned_bot_id").references(() => botsTable.id, {
			onDelete: "set null",
		}),
		/** When this slot was last used */
		lastUsedAt: timestamp("last_used_at"),
		/** Error message if slot is in error state */
		errorMessage: text("error_message"),
		/** Number of recovery attempts made for this slot */
		recoveryAttempts: integer("recovery_attempts").notNull().default(0),
		/** When this slot was created */
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(table) => [
		index("bot_pool_slots_status_idx").on(table.status),
		index("bot_pool_slots_assigned_bot_id_idx").on(table.assignedBotId),
	],
);

/**
 * Validation schema for bot pool slot selection queries
 */
const selectBotPoolSlotSchema = createSelectSchema(botPoolSlotsTable);

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
		botId: integer("bot_id")
			.references(() => botsTable.id, { onDelete: "cascade" })
			.notNull()
			.unique(),
		/** Priority level (lower = higher priority) */
		priority: integer("priority").notNull().default(100),
		/** When the request was queued */
		queuedAt: timestamp("queued_at").notNull().defaultNow(),
		/** When the request should timeout */
		timeoutAt: timestamp("timeout_at").notNull(),
	},
	(table) => [
		index("bot_pool_queue_priority_queued_at_idx").on(
			table.priority,
			table.queuedAt,
		),
	],
);
