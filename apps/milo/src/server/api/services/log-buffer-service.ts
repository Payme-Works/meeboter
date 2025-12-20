import type { LogEntry } from "@/server/database/schema";

/**
 * Callback type for log entry subscribers
 */
type LogSubscriber = (entries: LogEntry[]) => void;

/**
 * Configuration for the log buffer service
 */
interface LogBufferConfig {
	/** Maximum number of log entries to keep per bot */
	maxEntriesPerBot: number;

	/** How long to keep bot buffers after they become inactive (ms) */
	inactiveBufferTtl: number;
}

const DEFAULT_CONFIG: LogBufferConfig = {
	maxEntriesPerBot: 1000,
	inactiveBufferTtl: 5 * 60 * 1000, // 5 minutes
};

/**
 * In-memory buffer service for bot log entries.
 *
 * Provides:
 * - Per-bot log entry buffering with size limits
 * - Pub/sub for real-time log streaming
 * - Automatic cleanup of inactive bot buffers
 */
class LogBufferService {
	private readonly config: LogBufferConfig;
	private readonly buffers = new Map<number, LogEntry[]>();
	private readonly subscribers = new Map<number, Set<LogSubscriber>>();
	private readonly lastActivity = new Map<number, number>();
	private cleanupInterval: NodeJS.Timeout | null = null;

	constructor(config: Partial<LogBufferConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.startCleanupInterval();
	}

	/**
	 * Appends log entries to a bot's buffer and notifies subscribers.
	 * @param botId - The bot ID
	 * @param entries - Log entries to append
	 */
	append(botId: number, entries: LogEntry[]): void {
		if (entries.length === 0) return;

		// Get or create buffer
		let buffer = this.buffers.get(botId);

		if (!buffer) {
			buffer = [];
			this.buffers.set(botId, buffer);
		}

		// Add entries and trim to max size
		buffer.push(...entries);

		if (buffer.length > this.config.maxEntriesPerBot) {
			const excessCount = buffer.length - this.config.maxEntriesPerBot;

			buffer.splice(0, excessCount);
		}

		// Update last activity timestamp
		this.lastActivity.set(botId, Date.now());

		// Notify subscribers
		const subs = this.subscribers.get(botId);

		if (subs && subs.size > 0) {
			for (const callback of Array.from(subs)) {
				try {
					callback(entries);
				} catch (error) {
					console.error(
						`[LogBufferService] Subscriber callback error for bot ${botId}:`,
						error,
					);
				}
			}
		}
	}

	/**
	 * Gets the current buffer contents for a bot.
	 * @param botId - The bot ID
	 * @returns Copy of the log entries buffer
	 */
	getBuffer(botId: number): LogEntry[] {
		return [...(this.buffers.get(botId) ?? [])];
	}

	/**
	 * Gets the count of entries in a bot's buffer.
	 * @param botId - The bot ID
	 * @returns Number of entries in the buffer
	 */
	getBufferSize(botId: number): number {
		return this.buffers.get(botId)?.length ?? 0;
	}

	/**
	 * Subscribes to new log entries for a bot.
	 * @param botId - The bot ID
	 * @param callback - Function to call with new entries
	 * @returns Unsubscribe function
	 */
	subscribe(botId: number, callback: LogSubscriber): () => void {
		let subs = this.subscribers.get(botId);

		if (!subs) {
			subs = new Set();
			this.subscribers.set(botId, subs);
		}

		subs.add(callback);

		console.log(
			`[LogBufferService] Bot ${botId}: subscriber added (total: ${subs.size})`,
		);

		// Return unsubscribe function
		return () => {
			subs?.delete(callback);

			console.log(
				`[LogBufferService] Bot ${botId}: subscriber removed (remaining: ${subs?.size ?? 0})`,
			);

			// Clean up empty subscriber sets
			if (subs?.size === 0) {
				this.subscribers.delete(botId);
			}
		};
	}

	/**
	 * Gets the number of active subscribers for a bot.
	 * @param botId - The bot ID
	 * @returns Number of subscribers
	 */
	getSubscriberCount(botId: number): number {
		return this.subscribers.get(botId)?.size ?? 0;
	}

	/**
	 * Clears the buffer for a specific bot.
	 * Does not affect subscribers.
	 * @param botId - The bot ID
	 */
	clearBuffer(botId: number): void {
		this.buffers.delete(botId);
		this.lastActivity.delete(botId);
		console.log(`[LogBufferService] Bot ${botId}: buffer cleared`);
	}

	/**
	 * Checks if a bot has an active buffer.
	 * @param botId - The bot ID
	 * @returns True if the bot has a buffer with entries
	 */
	hasBuffer(botId: number): boolean {
		const buffer = this.buffers.get(botId);

		return buffer !== undefined && buffer.length > 0;
	}

	/**
	 * Gets statistics about the buffer service.
	 */
	getStats(): {
		totalBots: number;
		totalEntries: number;
		totalSubscribers: number;
	} {
		let totalEntries = 0;
		let totalSubscribers = 0;

		for (const buffer of Array.from(this.buffers.values())) {
			totalEntries += buffer.length;
		}

		for (const subs of Array.from(this.subscribers.values())) {
			totalSubscribers += subs.size;
		}

		return {
			totalBots: this.buffers.size,
			totalEntries,
			totalSubscribers,
		};
	}

	/**
	 * Starts the periodic cleanup of inactive buffers.
	 */
	private startCleanupInterval(): void {
		// Run cleanup every minute
		this.cleanupInterval = setInterval(() => {
			this.cleanupInactiveBuffers();
		}, 60 * 1000);
	}

	/**
	 * Cleans up buffers for bots that have been inactive.
	 */
	private cleanupInactiveBuffers(): void {
		const now = Date.now();
		const expiredBotIds: number[] = [];

		for (const [botId, lastActive] of Array.from(this.lastActivity.entries())) {
			if (now - lastActive > this.config.inactiveBufferTtl) {
				// Only clean up if no subscribers
				if (
					!this.subscribers.has(botId) ||
					this.subscribers.get(botId)?.size === 0
				) {
					expiredBotIds.push(botId);
				}
			}
		}

		for (const botId of expiredBotIds) {
			this.clearBuffer(botId);

			console.log(
				`[LogBufferService] Bot ${botId}: inactive buffer cleaned up`,
			);
		}

		if (expiredBotIds.length > 0) {
			console.log(
				`[LogBufferService] Cleaned up ${expiredBotIds.length} inactive buffers`,
			);
		}
	}

	/**
	 * Stops the cleanup interval.
	 * Call this when shutting down the service.
	 */
	shutdown(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}

		this.buffers.clear();
		this.subscribers.clear();
		this.lastActivity.clear();
	}
}

/**
 * Singleton instance of the log buffer service
 */
export const logBufferService = new LogBufferService();
