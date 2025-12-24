import { EventEmitter } from "node:events";

import {
	type EventCode,
	STATUS_EVENT_CODES,
	type Status,
	type TrpcClient,
} from "../trpc";

interface BotEventEmitterOptions {
	botId: number;
	trpc: TrpcClient;
}

/**
 * Centralized event emitter for bot lifecycle events.
 *
 * Uses native EventEmitter.emit() for events. Listeners handle:
 * - Auto-setting state for status events
 * - Reporting events to backend
 * - Updating backend status
 */
export class BotEventEmitter extends EventEmitter {
	private state: string = "INITIALIZING";
	private readonly botId: number;
	private readonly trpc: TrpcClient;

	/** Bound handler for internal event processing (preserved across reset) */
	private readonly boundEventHandler: (
		eventCode: EventCode,
		data?: Record<string, unknown>,
	) => void;

	constructor(options: BotEventEmitterOptions) {
		super();

		this.botId = options.botId;
		this.trpc = options.trpc;

		// Create bound handler so we can identify it during reset
		this.boundEventHandler = (
			eventCode: EventCode,
			data?: Record<string, unknown>,
		) => {
			this.handleEvent(eventCode, data);
		};

		// Listen to our own events and handle backend reporting
		this.on("event", this.boundEventHandler);
	}

	/**
	 * Resets the emitter state for a new bot attempt.
	 * Removes all external listeners while preserving internal event handler.
	 */
	reset(): void {
		// Reset state to initial
		this.state = "INITIALIZING";

		// Remove all listeners except our internal handler
		const eventListeners = this.listeners("event");

		for (const listener of eventListeners) {
			if (listener !== this.boundEventHandler) {
				this.off("event", listener as (...args: unknown[]) => void);
			}
		}

		// Remove all stateChange listeners (these are all external)
		this.removeAllListeners("stateChange");
	}

	/**
	 * Gets the current bot state.
	 */
	getState(): string {
		return this.state;
	}

	/**
	 * Handles event processing: state updates, backend reporting, status changes.
	 */
	private handleEvent(
		eventCode: EventCode,
		data?: Record<string, unknown>,
	): void {
		// Auto-set state for status events
		if (STATUS_EVENT_CODES.includes(eventCode)) {
			const oldState = this.state;
			this.state = eventCode;
			this.emit("stateChange", eventCode, oldState);
		}

		// Report to backend (fire-and-forget, errors logged)
		this.reportToBackend(eventCode, data).catch(() => {
			// Errors are logged in reportToBackend
		});
	}

	/**
	 * Reports event to backend and updates status if applicable.
	 */
	private async reportToBackend(
		eventCode: EventCode,
		data?: Record<string, unknown>,
	): Promise<void> {
		// Report event
		await this.trpc.bots.events.report.mutate({
			id: String(this.botId),
			event: {
				eventType: eventCode,
				eventTime: new Date(),
				data: data
					? {
							description:
								(data.message as string) || (data.description as string),
							sub_code: data.sub_code as string | undefined,
						}
					: null,
			},
		});

		// Update status if this is a status-changing event
		if (STATUS_EVENT_CODES.includes(eventCode)) {
			await this.trpc.bots.updateStatus.mutate({
				id: String(this.botId),
				status: eventCode as unknown as Status,
			});
		}
	}
}
