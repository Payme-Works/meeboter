import { env } from "@/env";

/**
 * Service for limiting concurrent bot deployments on Coolify.
 *
 * When multiple bots are deployed simultaneously, the Coolify server can become
 * overwhelmed with Docker image pulls, container creation, and startup operations.
 * This service limits concurrent deployments to prevent resource exhaustion.
 */

interface QueuedDeployment {
	botId: string;
	resolve: () => void;
	reject: (error: Error) => void;
	timeoutAt: Date;
	queuedAt: Date;
	timeoutId: NodeJS.Timeout;
}

/**
 * Error thrown when a bot times out waiting in the deployment queue
 */
export class DeploymentQueueTimeoutError extends Error {
	constructor(botId: string) {
		super(`Deployment queue timeout for bot ${botId}`);
		this.name = "DeploymentQueueTimeoutError";
	}
}

/**
 * Statistics about the deployment queue
 */
export interface DeploymentQueueStats {
	active: number;
	queued: number;
	maxConcurrent: number;
}

/**
 * Service for limiting concurrent deployments on Coolify.
 *
 * Uses an in-memory queue with promise-based waiting.
 * Similar pattern to ImagePullLockService but as a counting semaphore.
 */
export class DeploymentQueueService {
	private readonly maxConcurrent = env.DEPLOYMENT_QUEUE_MAX_CONCURRENT;
	private readonly timeoutMs = 30 * 60 * 1000; // 30 minutes

	private activeDeployments = new Set<string>();
	private queue: QueuedDeployment[] = [];

	/**
	 * Acquires a deployment slot.
	 *
	 * If under the concurrency limit, returns immediately.
	 * Otherwise, waits in a FIFO queue until a slot becomes available.
	 *
	 * @param botId - The bot ID requesting deployment
	 * @throws DeploymentQueueTimeoutError if the wait times out
	 */
	async acquireSlot(botId: string): Promise<void> {
		// If under limit, acquire immediately
		if (this.activeDeployments.size < this.maxConcurrent) {
			this.activeDeployments.add(botId);

			console.log(
				`[DeploymentQueue] Acquired slot for bot ${botId} (${this.activeDeployments.size}/${this.maxConcurrent} active)`,
			);

			return;
		}

		// Otherwise, queue and wait
		console.log(
			`[DeploymentQueue] Queueing bot ${botId} (${this.queue.length + 1} waiting, ${this.activeDeployments.size}/${this.maxConcurrent} active)`,
		);

		return new Promise<void>((resolve, reject) => {
			const timeoutAt = new Date(Date.now() + this.timeoutMs);

			const timeoutId = setTimeout(() => {
				// Remove from queue on timeout
				const index = this.queue.findIndex((e) => e.botId === botId);

				if (index !== -1) {
					this.queue.splice(index, 1);

					console.log(
						`[DeploymentQueue] Bot ${botId} timed out after ${this.timeoutMs / 1000 / 60} minutes`,
					);

					reject(new DeploymentQueueTimeoutError(botId));
				}
			}, this.timeoutMs);

			const entry: QueuedDeployment = {
				botId,
				resolve: () => {
					clearTimeout(timeoutId);
					this.activeDeployments.add(botId);

					console.log(
						`[DeploymentQueue] Dequeued bot ${botId} (${this.activeDeployments.size}/${this.maxConcurrent} active, ${this.queue.length} waiting)`,
					);

					resolve();
				},
				reject: (error: Error) => {
					clearTimeout(timeoutId);
					reject(error);
				},
				timeoutAt,
				queuedAt: new Date(),
				timeoutId,
			};

			this.queue.push(entry);
		});
	}

	/**
	 * Releases a deployment slot.
	 *
	 * MUST be called in a finally block after acquireSlot to ensure
	 * the slot is released even if deployment fails.
	 *
	 * @param botId - The bot ID that completed deployment
	 */
	release(botId: string): void {
		if (!this.activeDeployments.delete(botId)) {
			// Was not active (maybe timed out or already released)
			return;
		}

		console.log(
			`[DeploymentQueue] Released slot for bot ${botId} (${this.activeDeployments.size}/${this.maxConcurrent} active)`,
		);

		this.processQueue();
	}

	/**
	 * Gets statistics about the deployment queue
	 */
	getStats(): DeploymentQueueStats {
		return {
			active: this.activeDeployments.size,
			queued: this.queue.length,
			maxConcurrent: this.maxConcurrent,
		};
	}

	/**
	 * Processes the queue when a slot becomes available
	 */
	private processQueue(): void {
		// Clean up any entries that have timed out but weren't caught by setTimeout
		// (edge case: clock skew or delayed setTimeout execution)
		const now = Date.now();

		while (this.queue.length > 0 && this.queue[0].timeoutAt.getTime() < now) {
			const expired = this.queue.shift();

			if (expired) {
				clearTimeout(expired.timeoutId);
				expired.reject(new DeploymentQueueTimeoutError(expired.botId));
			}
		}

		// Process next if slot available
		if (
			this.activeDeployments.size < this.maxConcurrent &&
			this.queue.length > 0
		) {
			const next = this.queue.shift();

			if (next) {
				next.resolve();
			}
		}
	}
}
