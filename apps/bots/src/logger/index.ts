import type { Page } from "playwright";

import type { TrpcClient } from "../trpc";
import {
	colorizeBotId,
	colorizeBreadcrumbLevel,
	colorizeElapsed,
	colorizeErrorDetail,
	colorizeLevel,
	colorizeLocation,
	colorizeState,
} from "./colors";

/**
 * Log levels in order of verbosity (lower = more verbose)
 */
export enum LogLevel {
	TRACE = 0,
	DEBUG = 1,
	INFO = 2,
	WARN = 3,
	ERROR = 4,
	FATAL = 5,
}

/**
 * Structured log entry for streaming to backend
 */
export interface LogEntry {
	id: string;
	botId: number;
	timestamp: Date;
	level: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
	message: string;
	state?: string;
	location?: string;
	context?: Record<string, unknown>;
	elapsed?: string;
}

/**
 * Log level names for display
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
	[LogLevel.TRACE]: "TRACE",
	[LogLevel.DEBUG]: "DEBUG",
	[LogLevel.INFO]: "INFO",
	[LogLevel.WARN]: "WARN",
	[LogLevel.ERROR]: "ERROR",
	[LogLevel.FATAL]: "FATAL",
};

/**
 * Breadcrumb entry for tracking recent actions
 */
interface Breadcrumb {
	elapsed: string;
	level: string;
	message: string;
}

/**
 * Screenshot metadata for storage
 */
export interface ScreenshotData {
	key: string;
	capturedAt: Date;
	type: "error" | "fatal" | "manual" | "state_change";
	state: string;
	trigger?: string;
}

/**
 * Additional context that can be passed to log methods
 */
interface LogContext {
	[key: string]: unknown;
}

/**
 * Configuration for log streaming
 */
interface StreamingConfig {
	/** tRPC client for backend communication */
	trpcClient: TrpcClient;

	/** Interval for flushing logs to backend (ms) */
	flushInterval?: number;

	/** Maximum entries to buffer before forcing flush */
	maxBufferSize?: number;
}

const DEFAULT_FLUSH_INTERVAL = 2000; // 2 seconds
const DEFAULT_MAX_BUFFER_SIZE = 100;

/**
 * Centralized logger for bot instances with structured output,
 * breadcrumb tracking, screenshot capture, and log streaming.
 */
export class BotLogger {
	private readonly botId: number;
	private readonly startTime: Date;
	private readonly maxBreadcrumbs: number;
	private readonly breadcrumbs: Breadcrumb[] = [];
	private page?: Page;

	private currentState = "INITIALIZING";
	private logLevel: LogLevel = LogLevel.TRACE;

	// Streaming configuration
	private streamingConfig?: StreamingConfig;
	private logBuffer: LogEntry[] = [];
	private flushTimer?: NodeJS.Timeout;
	private isShuttingDown = false;

	constructor(
		botId: number,
		options?: {
			page?: Page;
			logLevel?: LogLevel;
			maxBreadcrumbs?: number;
		},
	) {
		this.botId = botId;
		this.startTime = new Date();
		this.page = options?.page;
		this.logLevel = options?.logLevel ?? LogLevel.TRACE;
		this.maxBreadcrumbs = options?.maxBreadcrumbs ?? 20;
	}

	/**
	 * Enables log streaming to the backend.
	 * @param config - Streaming configuration with tRPC client
	 */
	enableStreaming(config: StreamingConfig): void {
		this.streamingConfig = {
			...config,
			flushInterval: config.flushInterval ?? DEFAULT_FLUSH_INTERVAL,
			maxBufferSize: config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
		};

		// Start the flush timer
		this.startFlushTimer();

		this.debug("Log streaming enabled", {
			flushInterval: this.streamingConfig.flushInterval,
			maxBufferSize: this.streamingConfig.maxBufferSize,
		});
	}

	/**
	 * Starts the periodic flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer || !this.streamingConfig) return;

		this.flushTimer = setInterval(() => {
			void this.flushToBackend();
		}, this.streamingConfig.flushInterval);
	}

	/**
	 * Stops the flush timer
	 */
	private stopFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = undefined;
		}
	}

	/**
	 * Flushes buffered logs to the backend
	 */
	private async flushToBackend(): Promise<void> {
		if (!this.streamingConfig || this.logBuffer.length === 0) return;

		const entriesToSend = [...this.logBuffer];

		this.logBuffer = [];

		try {
			await this.streamingConfig.trpcClient.bots.logs.stream.mutate({
				botId: String(this.botId),
				entries: entriesToSend,
			});
		} catch (error) {
			// Re-queue failed entries (but limit to prevent memory issues)
			const maxRequeue = 500;
			const requeuable = entriesToSend.slice(-maxRequeue);

			this.logBuffer = [...requeuable, ...this.logBuffer].slice(-maxRequeue);

			// Only log error if not shutting down
			if (!this.isShuttingDown) {
				console.error(
					`[BotLogger] Failed to stream ${entriesToSend.length} log entries:`,
					error instanceof Error ? error.message : String(error),
				);
			}
		}
	}

	/**
	 * Adds a log entry to the buffer for streaming
	 */
	private bufferLogEntry(
		level: LogLevel,
		message: string,
		location: string,
		elapsed: string,
		context?: LogContext,
	): void {
		if (!this.streamingConfig) return;

		const entry: LogEntry = {
			id: crypto.randomUUID(),
			botId: this.botId,
			timestamp: new Date(),
			level: LOG_LEVEL_NAMES[level] as LogEntry["level"],
			message,
			state: this.currentState,
			location,
			context: context as Record<string, unknown>,
			elapsed,
		};

		this.logBuffer.push(entry);

		// Force flush if buffer is full
		if (
			this.streamingConfig.maxBufferSize &&
			this.logBuffer.length >= this.streamingConfig.maxBufferSize
		) {
			void this.flushToBackend();
		}
	}

	/**
	 * Gracefully shuts down the logger, flushing all pending logs.
	 * Call this when the bot is exiting.
	 */
	async shutdown(): Promise<void> {
		this.isShuttingDown = true;
		this.stopFlushTimer();

		// Final flush of any remaining logs
		if (this.streamingConfig && this.logBuffer.length > 0) {
			await this.flushToBackend();
		}

		// Tell backend to flush to S3
		if (this.streamingConfig) {
			try {
				await this.streamingConfig.trpcClient.bots.logs.flush.mutate({
					botId: String(this.botId),
				});
			} catch (error) {
				console.error(
					"[BotLogger] Failed to trigger S3 flush:",
					error instanceof Error ? error.message : String(error),
				);
			}
		}
	}

	/**
	 * Sets the Playwright page instance for screenshot capture.
	 * Should be called after browser is launched.
	 */
	setPage(page: Page): void {
		this.page = page;
		this.debug("Page instance set for screenshot capture");
	}

	/**
	 * Updates the current bot state for logging context
	 */
	setState(state: string): void {
		this.currentState = state;
		this.debug(`State changed to ${state}`);
	}

	/**
	 * Gets the current bot state
	 */
	getState(): string {
		return this.currentState;
	}

	/**
	 * Updates the log level at runtime
	 */
	setLogLevel(level: LogLevel): void {
		const oldLevel = LOG_LEVEL_NAMES[this.logLevel];
		const newLevel = LOG_LEVEL_NAMES[level];
		this.logLevel = level;
		this.info(`Log level changed from ${oldLevel} to ${newLevel}`);
	}

	/**
	 * Gets the current log level
	 */
	getLogLevel(): LogLevel {
		return this.logLevel;
	}

	/**
	 * Sets log level from string (used by heartbeat response)
	 */
	setLogLevelFromString(level: string): void {
		const upperLevel = level.toUpperCase();
		const levelValue = LogLevel[upperLevel as keyof typeof LogLevel];

		if (levelValue !== undefined) {
			this.setLogLevel(levelValue);
		}
	}

	/**
	 * Gets breadcrumbs for error context
	 */
	getBreadcrumbs(): Breadcrumb[] {
		return [...this.breadcrumbs];
	}

	/**
	 * Calculates elapsed time since bot start
	 */
	private getElapsed(): string {
		const ms = Date.now() - this.startTime.getTime();
		const seconds = Math.floor(ms / 1000);

		if (seconds < 60) {
			return `+${seconds}s`;
		}

		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		return `+${minutes}m${remainingSeconds}s`;
	}

	/**
	 * Gets the caller location from stack trace
	 */
	private getCallerLocation(): string {
		const stack = new Error().stack;

		if (!stack) {
			return "unknown";
		}

		const lines = stack.split("\n");

		// Find the first line that's not from this logger file
		for (const line of lines) {
			if (
				line.includes("at ") &&
				!line.includes("logger/index") &&
				!line.includes("BotLogger") &&
				!line.includes("getCallerLocation")
			) {
				// Extract file:function from stack trace
				const match = line.match(/at\s+(\w+)\s+\(.*\/([^/]+:\d+)/);

				if (match) {
					return `${match[2]}:${match[1]}`;
				}

				// Try simpler pattern for anonymous functions
				const simpleMatch = line.match(/\/([^/]+:\d+)/);

				if (simpleMatch) {
					return simpleMatch[1];
				}
			}
		}

		return "unknown";
	}

	/**
	 * Adds a breadcrumb for tracking recent actions
	 */
	private addBreadcrumb(level: string, message: string): void {
		this.breadcrumbs.push({
			elapsed: this.getElapsed(),
			level,
			message,
		});

		// Keep only the last N breadcrumbs
		while (this.breadcrumbs.length > this.maxBreadcrumbs) {
			this.breadcrumbs.shift();
		}
	}

	/**
	 * Formats and outputs a log message
	 */
	private log(
		level: LogLevel,
		message: string,
		context?: LogContext,
		error?: Error,
	): void {
		const levelName = LOG_LEVEL_NAMES[level];
		const elapsed = this.getElapsed();
		const location = this.getCallerLocation();

		// Always add to breadcrumbs (useful for debugging)
		this.addBreadcrumb(levelName, message);

		// Always buffer ALL logs for streaming to backend (UI and S3)
		// Log level filtering only affects console output, not backend streaming
		this.bufferLogEntry(level, message, location, elapsed, context);

		// Check if this level should be output to console
		if (level < this.logLevel) {
			return;
		}

		// Build the log line for console output
		const parts = [
			colorizeLevel(
				levelName as "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL",
			),
			colorizeBotId(this.botId),
			colorizeState(this.currentState),
			colorizeLocation(location),
			colorizeElapsed(elapsed),
			message,
		];

		// Add context if provided
		if (context && Object.keys(context).length > 0) {
			parts.push(colorizeErrorDetail(JSON.stringify(context)));
		}

		// Output the main log line
		const logLine = parts.join(" ");

		if (level >= LogLevel.ERROR) {
			console.error(logLine);
		} else if (level === LogLevel.WARN) {
			console.warn(logLine);
		} else {
			console.log(logLine);
		}

		// For ERROR/FATAL, output additional context
		if (level >= LogLevel.ERROR && error) {
			this.outputErrorDetails(error, level === LogLevel.FATAL);
		}
	}

	/**
	 * Outputs detailed error information with stack trace and breadcrumbs
	 */
	private outputErrorDetails(error: Error, includeBreadcrumbs: boolean): void {
		// Error message
		console.error(colorizeErrorDetail(`  ├── Error: ${error.message}`));

		// Stack trace
		if (error.stack) {
			const stackLines = error.stack
				.split("\n")
				.slice(1, 5)
				.map((line) => line.trim());

			console.error(colorizeErrorDetail(`  ├── Stack:`));

			for (const line of stackLines) {
				console.error(colorizeErrorDetail(`  │          ${line}`));
			}
		}

		// Breadcrumbs for FATAL errors
		if (includeBreadcrumbs && this.breadcrumbs.length > 0) {
			const recentBreadcrumbs = this.breadcrumbs.slice(-5);

			console.error(
				colorizeErrorDetail(
					`  ├── Breadcrumbs (last ${recentBreadcrumbs.length}):`,
				),
			);

			for (const crumb of recentBreadcrumbs) {
				const levelColored = colorizeBreadcrumbLevel(crumb.level);

				console.error(
					colorizeErrorDetail(
						`  │   [${crumb.elapsed}] ${levelColored}: ${crumb.message}`,
					),
				);
			}
		}
	}

	/**
	 * Captures a screenshot and returns the local path
	 */
	async captureScreenshot(
		type: ScreenshotData["type"] = "manual",
		trigger?: string,
	): Promise<string | null> {
		if (!this.page) {
			this.warn("Cannot capture screenshot: page not available");

			return null;
		}

		try {
			const timestamp = Date.now();
			const filename = `bot-${this.botId}-${type}-${timestamp}.png`;
			const filepath = `/tmp/${filename}`;

			await this.page.screenshot({ path: filepath, fullPage: true });

			this.debug(`Screenshot captured: ${filepath}`, { type, trigger });

			return filepath;
		} catch (err) {
			this.warn(
				`Failed to capture screenshot: ${err instanceof Error ? err.message : String(err)}`,
			);

			return null;
		}
	}

	// Log level methods

	trace(message: string, context?: LogContext): void {
		this.log(LogLevel.TRACE, message, context);
	}

	debug(message: string, context?: LogContext): void {
		this.log(LogLevel.DEBUG, message, context);
	}

	info(message: string, context?: LogContext): void {
		this.log(LogLevel.INFO, message, context);
	}

	warn(message: string, context?: LogContext): void {
		this.log(LogLevel.WARN, message, context);
	}

	error(message: string, error?: Error, context?: LogContext): void {
		this.log(LogLevel.ERROR, message, context, error);
	}

	async fatal(
		message: string,
		error?: Error,
		context?: LogContext,
	): Promise<string | null> {
		this.log(LogLevel.FATAL, message, context, error);

		// Automatically capture screenshot on fatal errors
		const screenshotPath = await this.captureScreenshot(
			"fatal",
			error?.message,
		);

		if (screenshotPath) {
			console.error(colorizeErrorDetail(`  └── Screenshot: ${screenshotPath}`));
		}

		return screenshotPath;
	}
}

/**
 * Parses a log level string to LogLevel enum
 */
export function parseLogLevel(level: string): LogLevel {
	const upperLevel = level.toUpperCase();

	switch (upperLevel) {
		case "TRACE":
			return LogLevel.TRACE;
		case "DEBUG":
			return LogLevel.DEBUG;
		case "INFO":
			return LogLevel.INFO;
		case "WARN":
			return LogLevel.WARN;
		case "ERROR":
			return LogLevel.ERROR;
		case "FATAL":
			return LogLevel.FATAL;
		default:
			return LogLevel.TRACE;
	}
}
