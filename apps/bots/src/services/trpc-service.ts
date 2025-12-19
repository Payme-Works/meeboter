import type { AppRouter } from "@meeboter/milo";
import {
	createTRPCProxyClient,
	httpBatchLink,
	type TRPCClient,
} from "@trpc/client";
import superjson from "superjson";

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
 * Status event codes that should trigger a status update in addition to event logging
 */
export const STATUS_EVENT_CODES: readonly EventCode[] = [
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
 * Time-based segment defining when a specific speaker was active during a meeting
 */
export type SpeakerTimeframe = {
	start: number;
	end: number;
	speakerName: string;
};

/**
 * Options for creating a TrpcService instance
 */
export interface TrpcServiceOptions {
	url: string;
	authToken: string;
}

/**
 * Service for communicating with the Milo backend via tRPC.
 * Exposes the tRPC client for direct procedure calls.
 */
export class TrpcService {
	readonly client: TRPCClient<AppRouter>;

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
}
