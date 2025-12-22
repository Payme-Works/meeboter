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
type MeetingInfo = {
	meetingId?: string;
	meetingPassword?: string;
	meetingUrl?: string;
	organizerId?: string;
	tenantId?: string;
	messageId?: string;
	threadId?: string;
	platform?: "zoom" | "microsoft-teams" | "google-meet";
};

/**
 * Configuration for automatic bot leave timeouts in various meeting scenarios
 */
type AutomaticLeave = {
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
	/** Bot is restarting after a recoverable error (not a status change) */
	RESTARTING = "RESTARTING",
}

/**
 * Status event codes that should trigger a status update in addition to event logging
 */
export const STATUS_EVENT_CODES: readonly EventCode[] = [
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
 * Options for creating a tRPC client
 */
interface TrpcClientOptions {
	url: string;
	authToken: string;
}

/**
 * Type alias for the tRPC client
 */
export type TrpcClient = TRPCClient<AppRouter>;

/**
 * Creates a tRPC client configured for the Milo backend
 */
export function createTrpcClient(options: TrpcClientOptions): TrpcClient {
	return createTRPCProxyClient<AppRouter>({
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
