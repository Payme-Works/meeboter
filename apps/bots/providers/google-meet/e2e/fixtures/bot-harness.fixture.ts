import { EventEmitter } from "node:events";
import type { Page } from "@playwright/test";
import type { BotEventEmitter } from "../../../../src/events";
import type { BotLogger } from "../../../../src/logger";
import type { BotConfig, TrpcClient } from "../../../../src/trpc";
import { GoogleMeetBot } from "../../src/bot";

/**
 * Creates a mock tRPC client for E2E tests.
 * All mutations are no-ops, queries return empty data.
 */
export function createMockTrpc(): TrpcClient {
	const noopMutate = () => Promise.resolve();
	const noopQuery = () => Promise.resolve(null);

	return {
		bots: {
			events: {
				report: { mutate: noopMutate },
			},
			updateStatus: { mutate: noopMutate },
			logs: {
				stream: { mutate: noopMutate },
				flush: { mutate: noopMutate },
			},
			chat: {
				dequeueMessage: { query: noopQuery },
			},
			addScreenshot: { mutate: noopMutate },
		},
	} as unknown as TrpcClient;
}

/**
 * Creates a mock BotEventEmitter for E2E tests.
 * Tracks emitted events for assertions.
 */
export function createMockEmitter(): BotEventEmitter & {
	emittedEvents: Array<{ code: string; data?: unknown }>;
} {
	const emitter = new EventEmitter() as BotEventEmitter & {
		emittedEvents: Array<{ code: string; data?: unknown }>;
	};

	emitter.emittedEvents = [];

	let state = "INITIALIZING";

	emitter.getState = () => state;

	const originalEmit = emitter.emit.bind(emitter);

	emitter.emit = ((event: string, ...args: unknown[]) => {
		if (event === "event") {
			const [code, data] = args;
			emitter.emittedEvents.push({ code: code as string, data });

			const statusCodes = [
				"DEPLOYING",
				"JOINING_CALL",
				"IN_WAITING_ROOM",
				"IN_CALL",
				"CALL_ENDED",
				"DONE",
				"FATAL",
			];

			if (statusCodes.includes(code as string)) {
				const oldState = state;
				state = code as string;
				originalEmit("stateChange", code, oldState);
			}
		}

		return originalEmit(event, ...args);
	}) as typeof emitter.emit;

	return emitter;
}

/**
 * Creates a mock BotLogger for E2E tests.
 * Logs to console with [E2E] prefix.
 */
export function createMockLogger(emitter: BotEventEmitter): BotLogger {
	const log = (level: string, message: string, context?: unknown) => {
		const state = emitter.getState();
		console.log(`[E2E] [${level}] [${state}] ${message}`, context ?? "");
	};

	return {
		trace: (msg: string, ctx?: unknown) => log("TRACE", msg, ctx),
		debug: (msg: string, ctx?: unknown) => log("DEBUG", msg, ctx),
		info: (msg: string, ctx?: unknown) => log("INFO", msg, ctx),
		warn: (msg: string, ctx?: unknown) => log("WARN", msg, ctx),
		error: (msg: string, _err?: Error, ctx?: unknown) => log("ERROR", msg, ctx),
		fatal: async (msg: string, _err?: Error, ctx?: unknown) => {
			log("FATAL", msg, ctx);

			return null;
		},
		getState: () => emitter.getState(),
		setPage: (_page: Page) => {},
		setLogLevel: () => {},
		setLogLevelFromString: () => {},
		enableStreaming: () => {},
		shutdown: async () => {},
		captureScreenshot: async () => null,
	} as unknown as BotLogger;
}

/**
 * Creates a default BotConfig for E2E tests.
 */
export function createTestConfig(
	meetUrl: string,
	botDisplayName: string,
): BotConfig {
	return {
		id: 999,
		userId: "e2e-test-user",
		meetingInfo: {
			meetingUrl: meetUrl,
			platform: "google-meet",
		},
		meetingTitle: "E2E Test Meeting",
		startTime: new Date(),
		endTime: new Date(Date.now() + 3600000),
		botDisplayName,
		recordingEnabled: false,
		heartbeatInterval: 30000,
		automaticLeave: {
			waitingRoomTimeout: 60000,
			noOneJoinedTimeout: 300000,
			everyoneLeftTimeout: 60000,
			inactivityTimeout: 600000,
		},
		chatEnabled: false,
	};
}

/**
 * Test harness for creating and managing GoogleMeetBot in E2E tests.
 */
export class BotTestHarness {
	readonly bot: GoogleMeetBot;
	readonly emitter: ReturnType<typeof createMockEmitter>;
	readonly logger: BotLogger;
	readonly trpc: TrpcClient;
	readonly config: BotConfig;

	constructor(meetUrl: string, botDisplayName: string) {
		this.emitter = createMockEmitter();
		this.logger = createMockLogger(this.emitter);
		this.trpc = createMockTrpc();
		this.config = createTestConfig(meetUrl, botDisplayName);

		this.bot = new GoogleMeetBot(
			this.config,
			this.emitter,
			this.logger,
			this.trpc,
		);
	}

	/**
	 * Waits for a specific event to be emitted.
	 */
	async waitForEvent(
		eventCode: string,
		timeoutMs = 30000,
	): Promise<{ code: string; data?: unknown }> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeoutMs) {
			const event = this.emitter.emittedEvents.find(
				(e) => e.code === eventCode,
			);

			if (event) {
				return event;
			}

			await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
		}

		throw new Error(
			`Timeout waiting for event ${eventCode}. Emitted events: ${this.emitter.emittedEvents.map((e) => e.code).join(", ")}`,
		);
	}

	/**
	 * Checks if an event has been emitted.
	 */
	hasEvent(eventCode: string): boolean {
		return this.emitter.emittedEvents.some((e) => e.code === eventCode);
	}

	/**
	 * Gets the current bot state.
	 */
	getState(): string {
		return this.emitter.getState();
	}

	/**
	 * Cleans up the bot resources.
	 */
	async cleanup(): Promise<void> {
		try {
			await this.bot.cleanup();
		} catch {
			// Ignore cleanup errors
		}
	}
}
