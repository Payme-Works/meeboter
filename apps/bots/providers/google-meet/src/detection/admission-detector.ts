import type { Page } from "playwright";
import { DETECTION_TIMEOUTS } from "../../../../src/constants";
import type {
	AdmissionDetector,
	AdmissionResult,
} from "../../../../src/detection";
import { elementExists } from "../../../../src/helpers/element-exists";
import type { BotLogger } from "../../../../src/logger";
import { SELECTORS } from "../selectors";

/**
 * Google Meet admission detector.
 *
 * Uses a three-phase approach prioritizing reliability over speed:
 * 1. Definitive check: Side panel buttons (ONLY exist when truly in-call)
 * 2. Structural check: Leave button + no Cancel/Ask to join buttons
 * 3. Text fallback: Admission confirmation texts
 */
export class GoogleMeetAdmissionDetector implements AdmissionDetector {
	constructor(
		private readonly page: Page,
		private readonly logger: BotLogger,
	) {}

	async check(): Promise<AdmissionResult> {
		// Phase 1: Check for definitive in-call indicators (side panel buttons)
		// These NEVER exist in waiting room - if any is found, we're definitely in-call
		for (const selector of SELECTORS.admissionIndicators) {
			if (
				await elementExists(
					this.page,
					selector,
					DETECTION_TIMEOUTS.ELEMENT_CHECK,
				)
			) {
				this.logger.trace("[AdmissionDetector] Found definitive indicator", {
					selector,
				});

				return { admitted: true, method: "definitive_indicator", stable: true };
			}
		}

		// Phase 2: Check Leave button + absence of waiting room structural elements
		// Leave button appears quickly after admission but also exists in waiting room
		const hasLeaveButton = await elementExists(
			this.page,
			SELECTORS.leaveButton,
			DETECTION_TIMEOUTS.ELEMENT_CHECK,
		);

		if (hasLeaveButton) {
			const inWaitingRoom = await this.isInWaitingRoom();

			if (!inWaitingRoom) {
				this.logger.trace(
					"[AdmissionDetector] Leave button found, no waiting room elements - admitted",
				);

				return { admitted: true, method: "structural_check", stable: false };
			}

			this.logger.trace(
				"[AdmissionDetector] Leave button found but still in waiting room",
			);
		}

		return { admitted: false, stable: true };
	}

	async isInWaitingRoom(): Promise<boolean> {
		// Check Cancel button first - most reliable waiting room indicator
		// It ONLY exists after clicking "Ask to join" and before being admitted
		const cancelSelectors = [
			'button[aria-label="Cancel"]',
			'//button[.//span[text()="Cancel"]]',
			'//button[contains(., "Cancel")]',
		];

		for (const selector of cancelSelectors) {
			if (
				await elementExists(
					this.page,
					selector,
					DETECTION_TIMEOUTS.ELEMENT_CHECK_FAST,
				)
			) {
				this.logger.trace("[AdmissionDetector] Found Cancel button", {
					selector,
				});

				return true;
			}
		}

		// Check if Ask to join button is still visible (shouldn't be after admission)
		if (
			await elementExists(
				this.page,
				SELECTORS.askToJoinButton,
				DETECTION_TIMEOUTS.ELEMENT_CHECK_FAST,
			)
		) {
			this.logger.trace("[AdmissionDetector] Ask to join button still visible");

			return true;
		}

		// Check for waiting room text patterns as fallback (less reliable)
		for (const selector of SELECTORS.waitingRoomIndicators) {
			// Skip button selectors (already checked above)
			if (selector.includes("Cancel") || selector.includes("Ask to join")) {
				continue;
			}

			if (
				await elementExists(
					this.page,
					selector,
					DETECTION_TIMEOUTS.ELEMENT_CHECK_FAST - 50,
				)
			) {
				this.logger.trace("[AdmissionDetector] Found waiting room text", {
					selector,
				});

				return true;
			}
		}

		return false;
	}
}
