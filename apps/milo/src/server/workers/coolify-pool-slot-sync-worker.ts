/**
 * CoolifyPoolSlotSyncWorker - Synchronizes Coolify applications with database pool slots
 *
 * ## Purpose
 *
 * Ensures consistency between Coolify (infrastructure) and Database (state).
 * Drift can occur due to:
 *   - Failed slot creation (Coolify created, DB insert failed)
 *   - Manual Coolify deletions
 *   - Database migrations or manual cleanup
 *   - Crash during slot lifecycle operations
 *
 * ## Sync Scenarios
 *
 * 1. COOLIFY ORPHANS (exist in Coolify, not in Database):
 *    - Example: Slot creation crashed after Coolify app created
 *    - Action: Delete from Coolify (clean up orphaned infrastructure)
 *
 * 2. DATABASE ORPHANS (exist in Database, not in Coolify):
 *    - Example: Coolify app manually deleted via UI
 *    - Action: Delete from Database (clean up stale records)
 *
 * ## Sync Process
 *
 *   1. Fetch all pool applications from Coolify
 *   2. Fetch all pool slots from Database
 *   3. Compare UUIDs to find orphans in each direction
 *   4. Delete Coolify orphans (infrastructure cleanup)
 *   5. Delete Database orphans (state cleanup)
 *
 * ## Detection Method
 *
 * Uses applicationUuid as the source of truth:
 *   - Coolify apps have unique UUIDs
 *   - Database slots store applicationUuid
 *   - Missing UUID in either direction = orphan
 *
 * ## Relationship with Other Workers
 *
 * - BotRecoveryWorker: Recovers stuck slots/resources (all platforms)
 * - BotHealthWorker: Monitors running bot health
 * - PoolSlotSyncWorker: Infrastructure ↔ Database consistency
 *
 * @see BotRecoveryWorker for slot/resource recovery
 * @see BotHealthWorker for bot health monitoring
 */

import { eq } from "drizzle-orm";

import { botPoolSlotsTable } from "@/server/database/schema";

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
