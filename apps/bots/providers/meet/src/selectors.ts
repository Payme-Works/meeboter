/**
 * CSS and XPath selectors for Google Meet UI elements
 */
export const SELECTORS = {
	// Join form
	enterNameField: 'input[type="text"][aria-label="Your name"]',
	askToJoinButton: '//button[.//span[text()="Ask to join"]]',
	joinNowButton: '//button[.//span[text()="Join now"]]',

	// In-call controls
	leaveButton: '//button[@aria-label="Leave call"]',
	peopleButton: '//button[@aria-label="People"]',
	muteButton: '[aria-label*="Turn off microphone"]',
	cameraOffButton: '[aria-label*="Turn off camera"]',

	// Chat
	chatButton: '//button[@aria-label="Chat with everyone"]',
	chatToggleButton: '//button[@aria-label="Toggle chat"]',
	chatInput: '//input[@aria-label="Send a message to everyone"]',
	chatSendButton: '//button[@aria-label="Send message"]',

	// Popups and dialogs
	infoPopupClick: '//button[.//span[text()="Got it"]]',
	gotKickedDetector: '//button[.//span[text()="Return to home screen"]]',

	// Blocking screens - Sign in
	signInButton: '//button[.//span[text()="Sign in"]]',
	signInPrompt: '[data-identifier="signInButton"], [aria-label="Sign in"]',

	// Blocking screens - Captcha
	captchaFrame: 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]',
	captchaChallenge: '[class*="captcha"], #captcha',

	// Blocking screens - Meeting errors
	meetingNotFound: '//*[contains(text(), "Check your meeting code")]',
	meetingInvalid: '//*[contains(text(), "Invalid video call name")]',
	meetingEnded: '//*[contains(text(), "This meeting has ended")]',
	meetingUnavailable: '//*[contains(text(), "not available")]',

	// Blocking screens - Permission
	permissionDenied: '//*[contains(text(), "denied access")]',
	notAllowedToJoin: '//*[contains(text(), "not allowed to join")]',

	// Kick detection
	removedFromMeeting: 'text="You\'ve been removed from the meeting"',
} as const;

/**
 * Texts that indicate bot is still in waiting room
 */
export const WAITING_ROOM_INDICATORS = [
	"Asking to be let in",
	"Someone will let you in",
	"waiting for the host",
	"Wait for the host",
] as const;

/**
 * In-call indicator selectors (any one indicates successful join)
 */
export const IN_CALL_INDICATORS = [
	'button[aria-label="People"]',
	'[aria-label="Participants"]',
	'button[aria-label="Chat with everyone"]',
] as const;

/**
 * Screen dimensions for browser viewport
 */
export const SCREEN_DIMENSIONS = {
	WIDTH: 1920,
	HEIGHT: 1080,
} as const;

/**
 * User agent for browser to avoid detection
 */
export const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
