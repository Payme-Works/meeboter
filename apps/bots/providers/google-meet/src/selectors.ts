/**
 * CSS and XPath selectors for Google Meet UI elements
 */
export const SELECTORS = {
	// Join flow (multiple selectors for resilience)
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

	// Admission indicators, used to detect when bot has been admitted to the call
	// IMPORTANT: Leave button and meeting title exist in waiting room, so excluded
	// Only side panel buttons reliably indicate true admission
	admissionIndicators: [
		// Side panel buttons (only visible when truly in-call)
		'button[aria-label="Chat with everyone"]',
		'button[aria-label="Meeting details"]',
		'button[aria-label="Host controls"]',
		'button[aria-label="Meeting tools"]',
	],

	// Waiting room indicators (if these exist, bot is NOT yet admitted)
	// PRIORITY ORDER: Structural elements first (buttons), then text patterns
	//
	// NOTE: The hasWaitingRoomStructuralIndicators() method in bot.ts checks
	// Cancel and Ask to join buttons first (most reliable), then uses these
	// text patterns as fallback.
	waitingRoomIndicators: [
		// Structural elements (most reliable, checked first in code)
		'button[aria-label="Cancel"]',
		'//button[.//span[text()="Cancel"]]',
		'//button[contains(., "Cancel")]',
		'//button[.//span[text()="Ask to join"]]',

		// Text patterns (less reliable, used as fallback)
		// Using broader patterns to catch variations in Google Meet's text
		'//*[contains(text(), "Waiting for")]',
		'//*[contains(text(), "waiting for")]',
		'//*[contains(text(), "let you in")]',
		'//*[contains(text(), "Asking to be")]',
		'//*[contains(text(), "asking to be")]',
		'//*[contains(text(), "will let you in")]',
		'//*[contains(text(), "to join")]',

		// New waiting room text pattern (observed in production)
		// Example: "Please wait until a meeting host brings you into the call"
		'//*[contains(text(), "Please wait until")]',
		'//*[contains(text(), "brings you into the call")]',
		'//*[contains(text(), "meeting host")]',

		// Waiting room image alt text
		'img[alt*="Please wait until"]',
		'img[alt*="brings you into the call"]',

		// Waiting room specific UI elements
		'[data-call-state="waiting"]',
		'[aria-label*="waiting"]',
	],

	// Removal indicators, used to detect if bot was kicked/removed from call
	// Stricter set that avoids false positives during page transitions
	// Uses side panel buttons which are more stable than control bar elements
	removalIndicators: [
		'button[aria-label="Chat with everyone"]',
		'button[aria-label="Meeting details"]',
		'button[aria-label="Host controls"]',
		'button[aria-label="Meeting tools"]',
		// Also check Leave button as backup
		'button[aria-label="Leave call"]',
	],

	// Legacy alias for backwards compatibility
	definitiveInCallIndicators: [
		'button[aria-label="Chat with everyone"]',
		'button[aria-label="Meeting details"]',
		'button[aria-label="Host controls"]',
		'button[aria-label="Meeting tools"]',
		'button[aria-label="Leave call"]',
	],

	// Less reliable indicators that may exist outside of call (e.g., waiting room)
	// Used only as secondary confirmation, never alone
	secondaryInCallIndicators: ['button[aria-label="More options"]'],

	// Kick detection
	kickDialog: '//button[.//span[text()="Return to home screen"]]',

	// Connection lost indicators (network reconnection in progress)
	// When these are visible, bot should wait for reconnection instead of exiting
	// Includes English, Portuguese, and Spanish translations
	connectionLostIndicators: [
		// English - exact text from Google Meet
		'//*[contains(text(), "You lost your network connection")]',
		'//*[contains(text(), "lost your network connection")]',
		'//*[contains(text(), "Trying to reconnect")]',
		'//*[contains(text(), "Lost connection")]',
		'//*[contains(text(), "Reconnecting")]',
		'//*[contains(text(), "reconnecting")]',
		'//*[contains(text(), "Connection problem")]',
		'//*[contains(text(), "connection problem")]',
		// Portuguese
		'//*[contains(text(), "Você perdeu a conexão")]',
		'//*[contains(text(), "perdeu a conexão")]',
		'//*[contains(text(), "Tentando reconectar")]',
		'//*[contains(text(), "Reconectando")]',
		'//*[contains(text(), "reconectando")]',
		'//*[contains(text(), "Conexão perdida")]',
		'//*[contains(text(), "conexão perdida")]',
		'//*[contains(text(), "Problema de conexão")]',
		// Spanish
		'//*[contains(text(), "Perdiste la conexión")]',
		'//*[contains(text(), "perdió la conexión")]',
		'//*[contains(text(), "Intentando reconectar")]',
		'//*[contains(text(), "Conexión perdida")]',
	],

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
