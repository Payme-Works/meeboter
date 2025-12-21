import { EventEmitter } from "events";

import {
	type EventCode,
	STATUS_EVENT_CODES,
	type Status,
	type TrpcClient,
} from "../trpc";

interface BotEventEmitterOptions {
	botId: number;
	trpc: TrpcClient;
	onStatusChange?: (eventCode: EventCode) => Promise<void>;
}

/**
 * Centralized event emitter for bot lifecycle events.
 * Handles event reporting to backend and state management.
 *
 * State is automatically updated when status events are emitted.
 */
export class BotEventEmitter extends EventEmitter {
	private state: string = "INITIALIZING";
	private readonly botId: number;
	private readonly trpc: TrpcClient;
	private readonly onStatusChange?: (eventCode: EventCode) => Promise<void>;

	constructor(options: BotEventEmitterOptions) {
		super();
		this.botId = options.botId;
		this.trpc = options.trpc;
		this.onStatusChange = options.onStatusChange;
	}

	/**
	 * Gets the current bot state.
	 */
	getState(): string {
		return this.state;
	}

	/**
	 * Emits a bot event, reports to backend, and updates status if applicable.
	 * State is automatically set for status-changing events.
	 */
	async emitEvent(
		eventCode: EventCode,
		data?: Record<string, unknown>,
	): Promise<void> {
		// Auto-set state for status events
		if (STATUS_EVENT_CODES.includes(eventCode)) {
			const oldState = this.state;
			this.state = eventCode;
			this.emit("stateChange", eventCode, oldState);
		}

		// Emit to local listeners
		this.emit("event", eventCode, data);

		// Report to backend
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

		// Update backend status if this is a status-changing event
		if (STATUS_EVENT_CODES.includes(eventCode)) {
			await this.trpc.bots.updateStatus.mutate({
				id: String(this.botId),
				status: eventCode as unknown as Status,
			});

			// Trigger onStatusChange callback (non-blocking)
			if (this.onStatusChange) {
				this.onStatusChange(eventCode).catch(() => {
					// Ignore errors from status change callback
				});
			}
		}
	}
}
