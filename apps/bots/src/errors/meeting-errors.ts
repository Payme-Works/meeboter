/**
 * Base error class for meeting-related errors.
 * All meeting errors should extend this class.
 */
export class MeetingError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly context?: Record<string, unknown>,
	) {
		super(message);
		this.name = "MeetingError";
	}
}

/**
 * Error thrown when bot fails to join a meeting.
 */
export class MeetingJoinError extends MeetingError {
	constructor(reason: string, meetingUrl?: string) {
		super(`Failed to join meeting: ${reason}`, "MEETING_JOIN_FAILED", {
			meetingUrl,
		});

		this.name = "MeetingJoinError";
	}
}

/**
 * Error thrown when bot times out waiting in the waiting room.
 */
export class WaitingRoomTimeoutError extends MeetingError {
	constructor(message = "The bot timed out while waiting in the waiting room") {
		super(message, "WAITING_ROOM_TIMEOUT");
		this.name = "WaitingRoomTimeoutError";
	}
}

/**
 * Error thrown when meeting has ended.
 */
export class MeetingEndedError extends MeetingError {
	constructor() {
		super("Meeting has ended", "MEETING_ENDED");
		this.name = "MeetingEndedError";
	}
}

/**
 * Error thrown when bot is kicked from the meeting.
 */
export class BotKickedError extends MeetingError {
	constructor() {
		super("Bot was kicked from the meeting", "BOT_KICKED");
		this.name = "BotKickedError";
	}
}

/**
 * Error thrown when sign-in is required to join.
 */
export class SignInRequiredError extends MeetingError {
	constructor() {
		super("Sign-in required to join meeting", "SIGN_IN_REQUIRED");
		this.name = "SignInRequiredError";
	}
}

/**
 * Error thrown when captcha is detected.
 */
export class CaptchaDetectedError extends MeetingError {
	constructor() {
		super("Captcha challenge detected", "CAPTCHA_DETECTED");
		this.name = "CaptchaDetectedError";
	}
}

/**
 * Error thrown when meeting is not found.
 */
export class MeetingNotFoundError extends MeetingError {
	constructor() {
		super("Meeting not found or invalid code", "MEETING_NOT_FOUND");
		this.name = "MeetingNotFoundError";
	}
}

/**
 * Error thrown when permission is denied to join.
 */
export class PermissionDeniedError extends MeetingError {
	constructor() {
		super("Permission denied to join meeting", "PERMISSION_DENIED");
		this.name = "PermissionDeniedError";
	}
}
