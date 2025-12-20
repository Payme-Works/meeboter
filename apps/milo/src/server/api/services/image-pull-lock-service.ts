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

	private getImageKey(platform: string, imageTag: string): string {
		return `${platform}:${imageTag}`;
	}

	/**
	 * Acquires a lock for a specific platform's image.
	 *
	 * If another operation for the same image is in progress, waits for it to complete
	 * before acquiring the lock.
	 *
	 * @returns LockResult with release function and whether we had to wait
	 */
	async acquireLock(platform: string, imageTag: string): Promise<LockResult> {
		const key = this.getImageKey(platform, imageTag);

		// Check if there's an existing lock we need to wait for
		const existingLock = this.locks.get(key);
		let didWait = false;

		if (existingLock) {
			console.log(
				`[ImagePullLockService] Waiting for existing operation: ${key}`,
			);

			didWait = true;
			await existingLock.promise;

			console.log(
				`[ImagePullLockService] Previous operation completed: ${key}`,
			);
		}

		// Now acquire the lock for ourselves
		let resolveFunc: () => void = () => {};

		const promise = new Promise<void>((res) => {
			resolveFunc = res;
		});

		const lock: PendingLock = {
			promise,
			resolve: resolveFunc,
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
}
