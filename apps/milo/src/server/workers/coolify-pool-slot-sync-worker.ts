/**
 * CoolifyPoolSlotSyncWorker - Synchronizes Coolify apps with database slots
 *
 * ## Workflow
 *
 *   ┌─────────────────┐           ┌─────────────────┐
 *   │  Coolify Apps   │           │  Database Slots │
 *   │   (by UUID)     │           │   (by UUID)     │
 *   └────────┬────────┘           └────────┬────────┘
 *            │                             │
 *            └──────────┬──────────────────┘
 *                       ▼
 *            ┌─────────────────────┐
 *            │   Compare UUIDs     │
 *            └──────────┬──────────┘
 *                       │
 *         ┌─────────────┴─────────────┐
 *         ▼                           ▼
 *   ┌───────────────┐         ┌───────────────┐
 *   │ In Coolify    │         │ In Database   │
 *   │ NOT in DB     │         │ NOT in Coolify│
 *   └───────┬───────┘         └───────┬───────┘
 *           ▼                         ▼
 *   Delete from Coolify       Delete from Database
 *                             (mark bot as FATAL)
 *
 * ## Sync Scenarios
 *
 *   Coolify orphan: Slot creation crashed after Coolify app created
 *   Database orphan: Coolify app manually deleted via UI
 */

import { eq } from "drizzle-orm";

import { botPoolSlotsTable, botsTable } from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "./base-worker";

export interface CoolifyPoolSlotSyncResult extends WorkerResult {
	coolifyOrphansDeleted: number;
	databaseOrphansDeleted: number;
	totalCoolifyApps: number;
	totalDatabaseSlots: number;
}

/**
 * Worker that synchronizes Coolify applications with database pool slots.
 */
export class CoolifyPoolSlotSyncWorker extends BaseWorker<CoolifyPoolSlotSyncResult> {
	readonly name = "CoolifyPoolSlotSyncWorker";

	protected async execute(): Promise<CoolifyPoolSlotSyncResult> {
		const result: CoolifyPoolSlotSyncResult = {
			coolifyOrphansDeleted: 0,
			databaseOrphansDeleted: 0,
			totalCoolifyApps: 0,
			totalDatabaseSlots: 0,
		};

		if (!this.services.coolify) {
			console.log(
				`[${this.name}] Coolify service not available, skipping sync`,
			);

			return result;
		}

		// Fetch both sources
		const [coolifyApps, databaseSlots] = await Promise.all([
			this.services.coolify.listPoolApplications(),
			this.db.select().from(botPoolSlotsTable),
		]);

		result.totalCoolifyApps = coolifyApps.length;
		result.totalDatabaseSlots = databaseSlots.length;

		// Create lookup sets for efficient comparison
		const coolifyUuids = new Set(coolifyApps.map((app) => app.uuid));

		const databaseUuids = new Set(
			databaseSlots.map((slot) => slot.applicationUuid),
		);

		// Find and delete Coolify orphans (exist in Coolify but not in database)
		for (const app of coolifyApps) {
			if (!databaseUuids.has(app.uuid)) {
				console.log(
					`[${this.name}] Found Coolify orphan: ${app.name} (${app.uuid})`,
				);

				try {
					await this.services.coolify.deleteApplication(app.uuid);
					result.coolifyOrphansDeleted++;

					console.log(
						`[${this.name}] Deleted Coolify orphan: ${app.name} (${app.uuid})`,
					);
				} catch (error) {
					console.error(
						`[${this.name}] Failed to delete Coolify orphan ${app.uuid}:`,
						error,
					);
				}
			}
		}

		// Find and delete database orphans (exist in database but not in Coolify)
		for (const slot of databaseSlots) {
			if (!coolifyUuids.has(slot.applicationUuid)) {
				console.log(
					`[${this.name}] Found database orphan: ${slot.slotName} (${slot.applicationUuid})`,
				);

				try {
					// Mark assigned bot as FATAL before deleting the slot
					// (bot's infrastructure no longer exists)
					if (slot.assignedBotId) {
						await this.db
							.update(botsTable)
							.set({ status: "FATAL", endTime: new Date() })
							.where(eq(botsTable.id, slot.assignedBotId));

						console.log(
							`[${this.name}] Marked bot ${slot.assignedBotId} as FATAL (slot infrastructure missing)`,
						);
					}

					await this.db
						.delete(botPoolSlotsTable)
						.where(eq(botPoolSlotsTable.id, slot.id));

					result.databaseOrphansDeleted++;

					console.log(
						`[${this.name}] Deleted database orphan: ${slot.slotName}`,
					);
				} catch (error) {
					console.error(
						`[${this.name}] Failed to delete database orphan ${slot.slotName}:`,
						error,
					);
				}
			}
		}

		return result;
	}
}
