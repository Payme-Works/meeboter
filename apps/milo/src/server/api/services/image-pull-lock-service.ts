/**
 * Service for coordinating Docker image pulls to prevent redundant parallel pulls.
 *
 * When multiple bots of the same platform are deployed simultaneously, each would
 * trigger a separate image pull for the same Docker image. This service ensures
 * only the first deployment pulls the image, while subsequent deployments wait
 * for that pull to complete and then use the cached image.
 */

interface PendingLock {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: Error) => void;
}

/**
 * Result of acquiring an image pull lock
 */
export interface LockResult {
	/**
	 * Function to release the lock. MUST be called when the operation completes.
	 * Pass an error if the operation failed to notify waiting deployments.
	 */
	release: (error?: Error) => void;

	/**
	 * True if this caller is the first deployer (holds the actual lock).
	 * False if this caller waited for another deployment to complete (image is cached).
	 *
	 * When true, the caller should wait for deployment to complete before releasing.
	 * When false, the image is already cached and deployment can proceed in background.
	 */
	isFirstDeployer: boolean;
}

export class ImagePullLockService {
	private locks = new Map<string, PendingLock>();

	private getImageKey(platform: string, imageTag: string): string {
		return `${platform}:${imageTag}`;
	}

	/**
	 * Acquires a lock for pulling a specific platform's image.
	 *
	 * If another pull for the same image is in progress, waits for it to complete.
	 * Returns a LockResult with:
	 * - release: function that MUST be called when the operation completes
	 * - isFirstDeployer: true if this caller holds the lock (should wait for deployment)
	 */
	async acquireLock(platform: string, imageTag: string): Promise<LockResult> {
		const key = this.getImageKey(platform, imageTag);

		const existingLock = this.locks.get(key);

		if (existingLock) {
			console.log(`[ImagePullLock] Waiting for existing image pull: ${key}`);

			try {
				await existingLock.promise;

				console.log(
					`[ImagePullLock] Existing pull completed, proceeding with cached image: ${key}`,
				);
			} catch {
				console.log(
					`[ImagePullLock] Previous pull failed, will attempt fresh pull: ${key}`,
				);
			}

			// Return no-op release and indicate we're not the first deployer
			return { release: () => {}, isFirstDeployer: false };
		}

		let resolveFunc: () => void = () => {};
		let rejectFunc: (error: Error) => void = () => {};

		const promise = new Promise<void>((res, rej) => {
			resolveFunc = res;
			rejectFunc = rej;
		});

		const lock: PendingLock = {
			promise,
			resolve: resolveFunc,
			reject: rejectFunc,
		};

		this.locks.set(key, lock);

		console.log(`[ImagePullLock] Acquired lock for image pull: ${key}`);

		let released = false;

		const release = (error?: Error) => {
			if (released) return;

			released = true;

			const currentLock = this.locks.get(key);

			if (currentLock === lock) {
				if (error) {
					console.log(
						`[ImagePullLock] Releasing lock with error: ${key} - ${error.message}`,
					);

					lock.reject(error);
				} else {
					console.log(`[ImagePullLock] Releasing lock (success): ${key}`);
					lock.resolve();
				}

				this.locks.delete(key);
			}
		};

		return { release, isFirstDeployer: true };
	}

	hasActiveLock(platform: string, imageTag: string): boolean {
		return this.locks.has(this.getImageKey(platform, imageTag));
	}

	getActiveLockCount(): number {
		return this.locks.size;
	}
}
