import type { AppRouter } from "@meeboter/milo";
import {
	createTRPCProxyClient,
	httpBatchLink,
	type TRPCClient,
} from "@trpc/client";
import superjson from "superjson";

import type { ScreenshotData } from "../logger";

/**
 * Meeting information containing platform-specific identifiers and connection details
 */
export type MeetingInfo = {
	meetingId?: string;
	meetingPassword?: string;
	meetingUrl?: string;
	organizerId?: string;
	tenantId?: string;
	messageId?: string;
	threadId?: string;
	platform?: "zoom" | "teams" | "google";
};

/**
 * Configuration for automatic bot leave timeouts in various meeting scenarios
 */
export type AutomaticLeave = {
	waitingRoomTimeout: number;
	noOneJoinedTimeout: number;
	everyoneLeftTimeout: number;
	inactivityTimeout: number;
};

/**
 * Complete configuration settings for a bot instance in a meeting
 */
export type BotConfig = {
	id: number;
	userId: string;
	meetingInfo: MeetingInfo;
	meetingTitle: string;
	startTime: Date;
	endTime: Date;
	botDisplayName: string;
	botImage?: string;
	recordingEnabled: boolean;
	heartbeatInterval: number;
	automaticLeave: AutomaticLeave;
	callbackUrl?: string;
	chatEnabled: boolean;
};

/**
 * Enumeration of possible bot status states throughout the meeting lifecycle
 */
export enum Status {
	READY_TO_DEPLOY = "READY_TO_DEPLOY",
	DEPLOYING = "DEPLOYING",
	JOINING_CALL = "JOINING_CALL",
	IN_WAITING_ROOM = "IN_WAITING_ROOM",
	IN_CALL = "IN_CALL",
	CALL_ENDED = "CALL_ENDED",
	DONE = "DONE",
	FATAL = "FATAL",
}

/**
 * Enumeration of event codes for bot lifecycle and meeting events
 */
export enum EventCode {
	READY_TO_DEPLOY = "READY_TO_DEPLOY",
	DEPLOYING = "DEPLOYING",
	JOINING_CALL = "JOINING_CALL",
	IN_WAITING_ROOM = "IN_WAITING_ROOM",
	IN_CALL = "IN_CALL",
	CALL_ENDED = "CALL_ENDED",
	DONE = "DONE",
	FATAL = "FATAL",
	PARTICIPANT_JOIN = "PARTICIPANT_JOIN",
	PARTICIPANT_LEAVE = "PARTICIPANT_LEAVE",
	LOG = "LOG",
	SIGN_IN_REQUIRED = "SIGN_IN_REQUIRED",
	CAPTCHA_DETECTED = "CAPTCHA_DETECTED",
	MEETING_NOT_FOUND = "MEETING_NOT_FOUND",
	MEETING_ENDED = "MEETING_ENDED",
	PERMISSION_DENIED = "PERMISSION_DENIED",
	JOIN_BLOCKED = "JOIN_BLOCKED",
}

/**
 * Time-based segment defining when a specific speaker was active during a meeting
 */
export type SpeakerTimeframe = {
	start: number;
	end: number;
	speakerName: string;
};

/**
 * Event data for reporting bot events
 */
export interface EventData {
	message?: string;
	description?: string;
	sub_code?: string;
	recording?: string;
	speakerTimeframes?: SpeakerTimeframe[];
}

/**
 * Heartbeat response from the backend
 */
export interface HeartbeatResponse {
	shouldLeave: boolean;
	logLevel: string | null;
}

/**
 * Queued message from the backend
 */
export interface QueuedMessage {
	messageText: string;
	templateId?: number;
	userId: string;
}

/**
 * Options for creating a TrpcService instance
 */
export interface TrpcServiceOptions {
	url: string;
	authToken: string;
}

/**
 * Service for communicating with the Milo backend via tRPC.
 * Handles all API calls including bot configuration, events, heartbeat, and chat.
 */
export class TrpcService {
	private readonly client: TRPCClient<AppRouter>;

	constructor(options: TrpcServiceOptions) {
		this.client = createTRPCProxyClient<AppRouter>({
			links: [
				httpBatchLink({
					url: `${options.url}/api/trpc`,
					transformer: superjson,
					headers: () => ({
						"X-Milo-Token": options.authToken,
					}),
				}),
			],
		});
	}

	/**
	 * Gets the raw tRPC client for direct access if needed
	 */
	getClient(): TRPCClient<AppRouter> {
		return this.client;
	}

	/**
	 * Fetches bot configuration for a pool slot
	 */
	async getPoolSlot(poolSlotUuid: string): Promise<BotConfig> {
		return this.client.bots.getPoolSlot.query({ poolSlotUuid });
	}

	/**
	 * Sends a heartbeat to the backend
	 */
	async sendHeartbeat(botId: number): Promise<HeartbeatResponse> {
		return this.client.bots.heartbeat.mutate({ id: String(botId) });
	}

	/**
	 * Status event codes that should trigger a status update in addition to logging
	 */
	private static readonly STATUS_EVENT_CODES: readonly EventCode[] = [
		EventCode.READY_TO_DEPLOY,
		EventCode.DEPLOYING,
		EventCode.JOINING_CALL,
		EventCode.IN_WAITING_ROOM,
		EventCode.IN_CALL,
		EventCode.CALL_ENDED,
		EventCode.DONE,
		EventCode.FATAL,
	];

	/**
	 * Reports an event to the backend.
	 * If the event is a status-related event, also updates the bot's status.
	 */
	async reportEvent(
		botId: number,
		eventType: EventCode,
		eventData?: EventData | null,
	): Promise<void> {
		// Report the event to the events log
		await this.client.bots.reportEvent.mutate({
			id: String(botId),
			event: {
				eventType,
				eventTime: new Date(),
				data: eventData
					? {
							description: eventData.message || eventData.description,
							sub_code: eventData.sub_code,
						}
					: null,
			},
		});

		// Also update status if this is a status-changing event
		if (TrpcService.STATUS_EVENT_CODES.includes(eventType)) {
			// EventCode and Status have the same values for status events
			const status = eventType as unknown as Status;

			await this.updateBotStatus(
				botId,
				status,
				eventData?.recording,
				eventData?.speakerTimeframes,
			);
		}
	}

	/**
	 * Updates bot status in the backend
	 */
	async updateBotStatus(
		botId: number,
		status: Status,
		recording?: string,
		speakerTimeframes?: SpeakerTimeframe[],
	): Promise<void> {
		if (recording) {
			await this.client.bots.updateBotStatus.mutate({
				id: String(botId),
				status,
				recording,
				speakerTimeframes,
			});
		} else {
			await this.client.bots.updateBotStatus.mutate({
				id: String(botId),
				status,
			});
		}
	}

	/**
	 * Appends a screenshot to the bot record
	 */
	async appendScreenshot(
		botId: number,
		screenshot: Omit<ScreenshotData, "capturedAt"> & { capturedAt: string },
	): Promise<void> {
		await this.client.bots.appendScreenshot.mutate({
			id: String(botId),
			screenshot,
		});
	}

	/**
	 * Gets the next queued message for the bot
	 */
	async getNextQueuedMessage(botId: number): Promise<QueuedMessage | null> {
		return this.client.chat.getNextQueuedMessage.query({
			botId: botId.toString(),
		});
	}
}
