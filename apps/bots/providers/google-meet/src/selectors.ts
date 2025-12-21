/**
 * CSS and XPath selectors for Google Meet UI elements
 */
export const SELECTORS = {
	// Join flow - multiple selectors for resilience
	nameInput: [
		'input[aria-label="Your name"]',
		'input[placeholder="Your name"]',
		'input[autocomplete="name"]',
		"input.qdOxv-fmcmS-wGMbrd",
	],
	joinNowButton: '//button[.//span[text()="Join now"]]',
	askToJoinButton: '//button[.//span[text()="Ask to join"]]',

	// In-call controls
	leaveButton: 'button[aria-label="Leave call"]',
	muteButton: '[aria-label*="Turn off microphone"]',
	cameraOffButton: '[aria-label*="Turn off camera"]',

	// Definitive in-call indicators (ONLY exist when truly in-call, not in waiting room)
	// These are reliable for detecting successful admission
	// NOTE: [data-meeting-title] and Leave button exist in waiting room, so excluded
	definitiveInCallIndicators: [
		// Side panel buttons - only visible when in-call
		'button[aria-label="Chat with everyone"]',
		'button[aria-label="Meeting details"]',
		'button[aria-label="Host controls"]',
		'button[aria-label="Meeting tools"]',
	],

	// Less reliable indicators that may exist outside of call (e.g., waiting room)
	// Used only as secondary confirmation, never alone
	secondaryInCallIndicators: ['button[aria-label="More options"]'],

	// Kick detection
	kickDialog: '//button[.//span[text()="Return to home screen"]]',

	// Chat
	chatButton: '//button[@aria-label="Chat with everyone"]',
	chatToggleButton: '//button[@aria-label="Toggle chat"]',
	chatInput: '//input[@aria-label="Send a message to everyone"]',

	// Blocking screens
	signInButton: '//button[.//span[text()="Sign in"]]',
	captchaFrame: 'iframe[src*="recaptcha"], iframe[title*="reCAPTCHA"]',
	meetingNotFound: '//*[contains(text(), "Check your meeting code")]',
	meetingEnded: '//*[contains(text(), "This meeting has ended")]',

	// Dismissible popups/dialogs
	gotItButton: '//button[.//span[text()="Got it"]]',
	dismissButton: '//button[.//span[text()="Dismiss"]]',
	dialogOkButton: 'button[data-mdc-dialog-action="ok"]',
} as const;

/**
 * Texts that indicate successful admission to the call
 */
export const ADMISSION_CONFIRMATION_TEXTS = [
	"You've been admitted",
	"You're the only one here",
	"You are the only one here",
	"No one else is here",
	"Waiting for others",
	"Waiting for others to join",
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
