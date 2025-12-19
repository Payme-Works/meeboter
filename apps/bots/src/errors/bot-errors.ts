/**
 * Base error class for bot-related errors.
 * All bot errors should extend this class.
 */
export class BotError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "BotError";
	}
}

/**
 * Error thrown when attempting to use bot methods before initialization.
 */
export class BotNotInitializedError extends BotError {
	constructor() {
		super("Bot has not been initialized", "BOT_NOT_INITIALIZED");
		this.name = "BotNotInitializedError";
	}
}

/**
 * Error thrown when bot creation fails.
 */
export class BotCreationError extends BotError {
	constructor(platform: string, cause?: Error) {
		super(
			`Failed to create bot for platform: ${platform}`,
			"BOT_CREATION_FAILED",
			{ platform },
		);

		this.name = "BotCreationError";
		this.cause = cause;
	}
}

/**
 * Error thrown when platform is unsupported.
 */
export class UnsupportedPlatformError extends BotError {
	constructor(platform: string) {
		super(`Unsupported platform: ${platform}`, "UNSUPPORTED_PLATFORM", {
			platform,
		});

		this.name = "UnsupportedPlatformError";
	}
}

/**
 * Error thrown when platform doesn't match Docker image.
 */
export class PlatformMismatchError extends BotError {
	constructor(platform: string, imageName: string) {
		super(
			`Docker image name ${imageName} does not match platform ${platform}`,
			"PLATFORM_MISMATCH",
			{ platform, imageName },
		);

		this.name = "PlatformMismatchError";
	}
}
