/**
 * CSS selectors for Microsoft Teams UI elements
 */
export const SELECTORS = {
	// Pre-join form
	displayNameInput: '[data-tid="prejoin-display-name-input"]',
	toggleMute: '[data-tid="toggle-mute"]',
	joinButton: '[data-tid="prejoin-join-button"]',

	// In-call controls
	leaveButton:
		'button[aria-label="Leave (Ctrl+Shift+H)"], button[aria-label="Leave (⌘+Shift+H)"]',
	peopleButton: '[aria-label="People"]',

	// Participants
	participantsTree: '[role="tree"]',
	participantInCall: '[data-tid^="participantsInCall-"]',
} as const;
