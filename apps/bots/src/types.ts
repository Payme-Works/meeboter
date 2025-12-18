/**
 * Meeting information containing platform-specific identifiers and connection details
 * @typedef {Object} MeetingInfo
 * @property {string} [meetingId] - Unique identifier for the meeting
 * @property {string} [meetingPassword] - Password required to join the meeting
 * @property {string} [meetingUrl] - Direct URL to join the meeting
 * @property {string} [organizerId] - Identifier of the meeting organizer
 * @property {string} [tenantId] - Tenant or organization identifier
 * @property {string} [messageId] - Associated message identifier
 * @property {string} [threadId] - Associated thread identifier
 * @property {"zoom" | "teams" | "google"} [platform] - Meeting platform type
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
 * @typedef {Object} AutomaticLeave
 * @property {number} waitingRoomTimeout - Timeout in milliseconds when bot is in waiting room
 * @property {number} noOneJoinedTimeout - Timeout in milliseconds when no participants join
 * @property {number} everyoneLeftTimeout - Timeout in milliseconds after all participants leave
 * @property {number} inactivityTimeout - Timeout in milliseconds during meeting inactivity
 */
export type AutomaticLeave = {
	waitingRoomTimeout: number;
	noOneJoinedTimeout: number;
	everyoneLeftTimeout: number;
	inactivityTimeout: number;
};

/**
 * Complete configuration settings for a bot instance in a meeting
 * @typedef {Object} BotConfig
 * @property {number} id - Unique bot identifier
 * @property {string} userId - Associated user identifier
 * @property {MeetingInfo} meetingInfo - Meeting connection and platform details
 * @property {string} meetingTitle - Display title of the meeting
 * @property {Date} startTime - Scheduled start time of the meeting
 * @property {Date} endTime - Scheduled end time of the meeting
 * @property {string} botDisplayName - Name displayed for the bot in the meeting
 * @property {string} [botImage] - Optional avatar image URL for the bot
 * @property {boolean} recordingEnabled - Whether recording functionality is enabled
 * @property {number} heartbeatInterval - Interval in milliseconds for bot status updates
 * @property {AutomaticLeave} automaticLeave - Timeout configuration for automatic leaving
 * @property {string} [callbackUrl] - Optional webhook URL for bot events
 * @property {boolean} chatEnabled - Whether chat messaging functionality is enabled
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
	miloUrl: string;
};

/**
 * Enumeration of possible bot status states throughout the meeting lifecycle
 * @enum {string}
 */
export enum Status {
	/** Bot is configured and ready to be deployed */
	READY_TO_DEPLOY = "READY_TO_DEPLOY",
	/** Bot deployment is in progress */
	DEPLOYING = "DEPLOYING",
	/** Bot is attempting to join the meeting call */
	JOINING_CALL = "JOINING_CALL",
	/** Bot is waiting in the meeting's waiting room */
	IN_WAITING_ROOM = "IN_WAITING_ROOM",
	/** Bot has successfully joined and is active in the call */
	IN_CALL = "IN_CALL",
	/** Meeting has ended but bot cleanup may still be in progress */
	CALL_ENDED = "CALL_ENDED",
	/** Bot has completed all tasks and is fully terminated */
	DONE = "DONE",
	/** Bot encountered a fatal error and cannot continue */
	FATAL = "FATAL",
}

/**
 * Enumeration of event codes for bot lifecycle and meeting events
 * @enum {string}
 */
export enum EventCode {
	/** Bot is ready for deployment */
	READY_TO_DEPLOY = "READY_TO_DEPLOY",
	/** Bot deployment is in progress */
	DEPLOYING = "DEPLOYING",
	/** Bot is joining the meeting call */
	JOINING_CALL = "JOINING_CALL",
	/** Bot is in the meeting's waiting room */
	IN_WAITING_ROOM = "IN_WAITING_ROOM",
	/** Bot is active in the call */
	IN_CALL = "IN_CALL",
	/** Meeting call has ended */
	CALL_ENDED = "CALL_ENDED",
	/** Bot operations are complete */
	DONE = "DONE",
	/** Fatal error occurred */
	FATAL = "FATAL",
	/** A participant joined the meeting */
	PARTICIPANT_JOIN = "PARTICIPANT_JOIN",
	/** A participant left the meeting */
	PARTICIPANT_LEAVE = "PARTICIPANT_LEAVE",
	/** General log event */
	LOG = "LOG",
}

/**
 * Custom error implementation thrown when bot times out while waiting in a meeting's waiting room
 * @extends Error
 */
export class WaitingRoomTimeoutError extends Error {
	/**
	 * Creates a new waiting room timeout error
	 * @param {string} message - Error message describing the timeout
	 */
	constructor(
		message: string = "The bot timed out while waiting in the waiting room",
	) {
		super(message);
		this.name = "WaitingRoomTimeoutError";
	}
}

/**
 * Custom error implementation thrown when bot fails to join a meeting
 * @extends Error
 */
export class MeetingJoinError extends Error {
	/**
	 * Creates a new meeting join error
	 * @param {string} message - Error message describing the join failure
	 */
	constructor(message: string = "Simulated Meeting Join Error") {
		super(message);
		this.name = "MeetingJoinError";
	}
}

/**
 * Time-based segment defining when a specific speaker was active during a meeting
 * @typedef {Object} SpeakerTimeframe
 * @property {number} start - Start timestamp in milliseconds
 * @property {number} end - End timestamp in milliseconds
 * @property {string} speakerName - Name or identifier of the speaker
 */
export type SpeakerTimeframe = {
	start: number;
	end: number;
	speakerName: string;
};
