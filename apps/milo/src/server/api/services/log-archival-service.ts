import {
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
} from "@aws-sdk/client-s3";

import type { LogEntry } from "@/server/database/schema";
import { getBucketName, getS3ClientInstance } from "@/server/utils/s3";

/**
 * Configuration for log archival
 */
interface LogArchivalConfig {
	/** Interval for periodic archival (ms) */
	archiveInterval: number;

	/** Minimum entries before archiving */
	minEntriesForArchive: number;
}

const DEFAULT_CONFIG: LogArchivalConfig = {
	archiveInterval: 30 * 1000, // 30 seconds
	minEntriesForArchive: 10,
};

/**
 * Manages log archival to S3.
 *
 * Provides:
 * - Periodic archival of log entries to S3
 * - Retrieval of historical logs from S3
 * - JSONL format for streaming-friendly storage
 */
class LogArchivalService {
	private readonly config: LogArchivalConfig;
	private readonly pendingLogs = new Map<number, LogEntry[]>();
	private archiveTimers = new Map<number, NodeJS.Timeout>();

	constructor(config: Partial<LogArchivalConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Queues log entries for archival.
	 * Starts or resets the archival timer for the bot.
	 * @param botId - The bot ID
	 * @param entries - Log entries to archive
	 */
	queueForArchival(botId: number, entries: LogEntry[]): void {
		if (entries.length === 0) return;

		// Get or create pending queue
		let pending = this.pendingLogs.get(botId);

		if (!pending) {
			pending = [];
			this.pendingLogs.set(botId, pending);
		}

		pending.push(...entries);

		// Reset archive timer
		this.resetArchiveTimer(botId);
	}

	/**
	 * Forces immediate archival of pending logs for a bot.
	 * Called when bot exits to ensure no logs are lost.
	 * @param botId - The bot ID
	 */
	async flushBot(botId: number): Promise<void> {
		// Clear any pending timer
		const timer = this.archiveTimers.get(botId);

		if (timer) {
			clearTimeout(timer);
			this.archiveTimers.delete(botId);
		}

		const pending = this.pendingLogs.get(botId);

		if (!pending || pending.length === 0) {
			return;
		}

		await this.archiveEntries(botId, pending, true);
		this.pendingLogs.delete(botId);
	}

	/**
	 * Retrieves historical logs from S3 for a bot.
	 * @param botId - The bot ID
	 * @param options - Pagination options
	 * @returns Log entries and continuation token
	 */
	async getHistoricalLogs(
		botId: number,
		options: {
			cursor?: string;
			limit?: number;
		} = {},
	): Promise<{
		entries: LogEntry[];
		nextCursor?: string;
	}> {
		const s3Client = getS3ClientInstance();
		const bucketName = getBucketName();
		const prefix = `bots/${botId}/logs/`;
		const limit = options.limit ?? 100;

		try {
			// List log files for this bot
			const listCommand = new ListObjectsV2Command({
				Bucket: bucketName,
				Prefix: prefix,
				MaxKeys: 10, // Get up to 10 files at a time
				ContinuationToken: options.cursor,
			});

			const listResult = await s3Client.send(listCommand);

			if (!listResult.Contents || listResult.Contents.length === 0) {
				return { entries: [] };
			}

			// Sort by key (timestamp-based) in ascending order for chronological display
			const sortedKeys = listResult.Contents.map((obj) => obj.Key)
				.filter((key): key is string => key !== undefined)
				.sort();

			// Fetch and parse log files
			const allEntries: LogEntry[] = [];

			for (const key of sortedKeys) {
				if (allEntries.length >= limit) break;

				try {
					const getCommand = new GetObjectCommand({
						Bucket: bucketName,
						Key: key,
					});

					const result = await s3Client.send(getCommand);
					const body = await result.Body?.transformToString();

					if (body) {
						const lines = body.trim().split("\n");

						for (const line of lines) {
							if (line.trim() && allEntries.length < limit) {
								try {
									const entry = JSON.parse(line) as LogEntry;

									// Ensure date is properly parsed
									entry.timestamp = new Date(entry.timestamp);
									allEntries.push(entry);
								} catch {
									console.warn(
										`[LogArchivalService] Failed to parse log line: ${line.substring(0, 100)}`,
									);
								}
							}
						}
					}
				} catch (error) {
					console.error(
						`[LogArchivalService] Failed to fetch log file ${key}:`,
						error,
					);
				}
			}

			// Sort all entries by timestamp ascending (chronological order)
			allEntries.sort(
				(a, b) =>
					new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			);

			return {
				entries: allEntries.slice(0, limit),
				nextCursor: listResult.NextContinuationToken,
			};
		} catch (error) {
			console.error(
				`[LogArchivalService] Failed to get historical logs for bot ${botId}:`,
				error,
			);

			return { entries: [] };
		}
	}

	/**
	 * Resets or starts the archive timer for a bot.
	 */
	private resetArchiveTimer(botId: number): void {
		// Clear existing timer
		const existingTimer = this.archiveTimers.get(botId);

		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Start new timer
		const timer = setTimeout(async () => {
			await this.archivePendingLogs(botId);
		}, this.config.archiveInterval);

		this.archiveTimers.set(botId, timer);
	}

	/**
	 * Archives pending logs for a bot if threshold is met.
	 */
	private async archivePendingLogs(botId: number): Promise<void> {
		const pending = this.pendingLogs.get(botId);

		if (!pending || pending.length < this.config.minEntriesForArchive) {
			// Not enough entries, reschedule
			if (pending && pending.length > 0) {
				this.resetArchiveTimer(botId);
			}

			return;
		}

		// Take all pending entries
		const entriesToArchive = [...pending];

		pending.length = 0; // Clear the array

		await this.archiveEntries(botId, entriesToArchive, false);

		// Clean up timer
		this.archiveTimers.delete(botId);
	}

	/**
	 * Archives log entries to S3 in JSONL format.
	 */
	private async archiveEntries(
		botId: number,
		entries: LogEntry[],
		isFinal: boolean,
	): Promise<void> {
		if (entries.length === 0) return;

		const s3Client = getS3ClientInstance();
		const bucketName = getBucketName();

		// Create S3 key: bots/{botId}/logs/{YYYY-MM-DD}/{timestamp}.jsonl
		const now = new Date();
		const dateStr = now.toISOString().split("T")[0];
		const timestamp = now.getTime();
		const suffix = isFinal ? "-final" : "";
		const key = `bots/${botId}/logs/${dateStr}/${timestamp}${suffix}.jsonl`;

		// Convert entries to JSONL format
		const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");

		try {
			const putCommand = new PutObjectCommand({
				Bucket: bucketName,
				Key: key,
				Body: jsonl,
				ContentType: "application/x-ndjson",
			});

			await s3Client.send(putCommand);

			console.log(
				`[LogArchivalService] Bot ${botId}: archived ${entries.length} entries to ${key}`,
			);
		} catch (error) {
			console.error(
				`[LogArchivalService] Bot ${botId}: failed to archive ${entries.length} entries:`,
				error,
			);

			// Re-queue failed entries (but limit to prevent infinite growth)
			const existingPending = this.pendingLogs.get(botId) ?? [];

			if (existingPending.length + entries.length <= 5000) {
				this.pendingLogs.set(botId, [...entries, ...existingPending]);
				this.resetArchiveTimer(botId);
			} else {
				console.warn(
					`[LogArchivalService] Bot ${botId}: dropping ${entries.length} entries due to queue overflow`,
				);
			}
		}
	}

	/**
	 * Shuts down the service, flushing all pending logs.
	 */
	async shutdown(): Promise<void> {
		// Flush all pending logs
		const botIds = Array.from(this.pendingLogs.keys());

		await Promise.all(botIds.map((botId) => this.flushBot(botId)));

		// Clear all timers
		for (const timer of Array.from(this.archiveTimers.values())) {
			clearTimeout(timer);
		}

		this.archiveTimers.clear();
	}
}

/**
 * Singleton instance of the log archival service
 */
export const logArchivalService = new LogArchivalService();
