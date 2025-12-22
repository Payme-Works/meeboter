/**
 * Service for coordinating Docker image pulls to prevent redundant parallel pulls.
 *
 * This is a simple mutex-style lock per image key. When an operation is in progress,
 * other callers wait until it completes. The lock does not track success/failure,
 * that is the caller's responsibility.
 */

interface PendingLock {
	promise: Promise<void>;
	resolve: () => void;
	acquiredAt: Date;
}

/**
 * Result of acquiring an image pull lock
 */
interface LockResult {
	/**
	 * Function to release the lock. MUST be called when the operation completes.
	 */
	release: () => void;

	/**
	 * True if this caller had to wait for another operation to complete.
	 * False if this caller acquired the lock immediately (no one else was holding it).
	 */
	didWait: boolean;
}

export class ImagePullLockService {
	private locks = new Map<string, PendingLock>();
	private readonly waitTimeoutMs = 10 * 60 * 1000; // 10 minutes

	private getImageKey(platform: string, imageTag: string): string {
		return `${platform}:${imageTag}`;
	}

	/**
	 * Acquires a lock for a specific platform's image.
	 *
	 * If another operation for the same image is in progress, waits for it to complete
	 * before acquiring the lock. Times out after 10 minutes to prevent indefinite blocking.
	 * On timeout, force-releases the stale lock and proceeds with acquiring a new one.
	 *
	 * @returns LockResult with release function and whether we had to wait
	 */
	async acquireLock(platform: string, imageTag: string): Promise<LockResult> {
		const key = this.getImageKey(platform, imageTag);

		// Check if there's an existing lock we need to wait for
		const existingLock = this.locks.get(key);
		let didWait = false;

		if (existingLock) {
			const waitStartedAt = Date.now();
			const lockAge = waitStartedAt - existingLock.acquiredAt.getTime();

			console.log(
				`[ImagePullLockService] Waiting for existing operation: ${key} (lock held for ${Math.round(lockAge / 1000)}s)`,
			);

			didWait = true;

			// Wait with timeout to prevent indefinite blocking
			const timedOut = await this.waitWithTimeout(existingLock.promise, key);

			if (timedOut) {
				// Force-release the stale lock and continue to acquire our own
				this.forceReleaseStaleLock(key, existingLock);
			} else {
				console.log(
					`[ImagePullLockService] Previous operation completed: ${key}`,
				);
			}
		}

		// Now acquire the lock for ourselves
		let resolveFunc: () => void = () => {};

		const promise = new Promise<void>((res) => {
			resolveFunc = res;
		});

		const lock: PendingLock = {
			promise,
			resolve: resolveFunc,
			acquiredAt: new Date(),
		};

		this.locks.set(key, lock);

		console.log(`[ImagePullLockService] Acquired lock: ${key}`);

		let released = false;

		const release = () => {
			if (released) return;

			released = true;

			const currentLock = this.locks.get(key);

			if (currentLock === lock) {
				console.log(`[ImagePullLockService] Released lock: ${key}`);

				lock.resolve();
				this.locks.delete(key);
			}
		};

		return { release, didWait };
	}

	hasActiveLock(platform: string, imageTag: string): boolean {
		return this.locks.has(this.getImageKey(platform, imageTag));
	}

	getActiveLockCount(): number {
		return this.locks.size;
	}

	/**
	 * Waits for a promise with timeout.
	 * @returns true if timed out, false if promise resolved
	 */
	private waitWithTimeout(
		promise: Promise<void>,
		key: string,
	): Promise<boolean> {
		return new Promise((resolve) => {
			const timeoutId = setTimeout(() => {
				console.error(
					`[ImagePullLockService] Timeout waiting for lock: ${key} (waited ${this.waitTimeoutMs / 1000 / 60} minutes)`,
				);

				resolve(true);
			}, this.waitTimeoutMs);

			promise.then(() => {
				clearTimeout(timeoutId);
				resolve(false);
			});
		});
	}

	/**
	 * Force-releases a stale lock after timeout.
	 * This allows other waiters to proceed after the original holder appears stuck.
	 */
	private forceReleaseStaleLock(key: string, staleLock: PendingLock): void {
		const currentLock = this.locks.get(key);

		if (currentLock === staleLock) {
			console.warn(
				`[ImagePullLockService] Force-releasing stale lock: ${key} (held since ${staleLock.acquiredAt.toISOString()})`,
			);

			staleLock.resolve();
			this.locks.delete(key);
		}
	}
}
