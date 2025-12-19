import { eq } from "drizzle-orm";

import { botPoolSlotsTable } from "@/server/database/schema";

import { BaseWorker, type WorkerResult } from "./base-worker";

export interface PoolSlotSyncResult extends WorkerResult {
	coolifyOrphansDeleted: number;
	databaseOrphansDeleted: number;
	totalCoolifyApps: number;
	totalDatabaseSlots: number;
}

/**
 * Worker that synchronizes Coolify applications with database pool slots.
 *
 * Handles:
 * - Coolify orphans: Apps that exist in Coolify but not in database (deleted from Coolify)
 * - Database orphans: Records that exist in database but not in Coolify (deleted from database)
 *
 * This ensures consistency between the two systems after failures, manual deletions,
 * or other edge cases that could cause drift.
 */
export class PoolSlotSyncWorker extends BaseWorker<PoolSlotSyncResult> {
	readonly name = "PoolSlotSyncWorker";

	protected async execute(): Promise<PoolSlotSyncResult> {
		const result: PoolSlotSyncResult = {
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
			databaseSlots.map((slot) => slot.coolifyServiceUuid),
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
			if (!coolifyUuids.has(slot.coolifyServiceUuid)) {
				console.log(
					`[${this.name}] Found database orphan: ${slot.slotName} (${slot.coolifyServiceUuid})`,
				);

				try {
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
