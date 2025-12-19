/**
 * CSS selectors for Zoom UI elements
 */
export const SELECTORS = {
	// Pre-join form (using IDs to avoid language mismatch)
	muteButton: "#preview-audio-control-button",
	stopVideoButton: "#preview-video-control-button",
	joinButton: "button.zm-btn.preview-join-button",
	nameInput: "#input-for-name",

	// In-call controls
	leaveButton: 'button[aria-label="Leave"]',

	// Modals
	acceptCookiesButton: "#onetrust-accept-btn-handler",
	acceptTermsButton: "#wc_agree1",

	// Meeting end detection
	meetingEndedOkButton:
		'div[aria-label="Meeting is end now"] button.zm-btn.zm-btn-legacy.zm-btn--primary.zm-btn__outline--blue',

	// IFrame
	webClientIframe: ".pwa-webclient__iframe",
} as const;
