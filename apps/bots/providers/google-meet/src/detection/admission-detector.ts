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
 * Check if any of the given selectors exist on the page (parallel check).
 * Returns the first matching selector or null if none match.
 */
async function anyElementExists(
	page: Page,
	selectors: readonly string[],
	timeout: number,
): Promise<string | null> {
	const results = await Promise.all(
		selectors.map(async (selector) => {
			const exists = await elementExists(page, selector, timeout);

			return { selector, exists };
		}),
	);

	const found = results.find((r) => r.exists);

	return found ? found.selector : null;
}

/**
 * Google Meet admission detector.
 *
 * Uses a three-phase approach prioritizing reliability over speed:
 * 1. Definitive check: Side panel buttons (ONLY exist when truly in-call)
 * 2. Structural check: Leave button + no Cancel/Ask to join buttons
 * 3. Text fallback: Admission confirmation texts
 */
export class GoogleMeetAdmissionDetector implements AdmissionDetector {
	private checkCount = 0;

	constructor(
		private readonly page: Page,
		private readonly logger: BotLogger,
	) {}

	async check(): Promise<AdmissionResult> {
		this.checkCount++;
		const startTime = Date.now();

		// Log periodically to show detector is running (every 30 checks)
		if (this.checkCount % 30 === 0) {
			this.logger.trace("[AdmissionDetector] Still checking for admission", {
				checkCount: this.checkCount,
			});
		}

		// Phase 1: Check admission indicators AND Leave button in PARALLEL
		// This reduces worst-case from 2.5s to 0.5s per check
		const [admissionIndicator, hasLeaveButton] = await Promise.all([
			anyElementExists(
				this.page,
				SELECTORS.admissionIndicators,
				DETECTION_TIMEOUTS.ELEMENT_CHECK,
			),
			elementExists(
				this.page,
				SELECTORS.leaveButton,
				DETECTION_TIMEOUTS.ELEMENT_CHECK,
			),
		]);

		// If any definitive indicator found, we're definitely in-call
		if (admissionIndicator) {
			this.logger.trace("[AdmissionDetector] Found definitive indicator", {
				selector: admissionIndicator,
				durationMs: Date.now() - startTime,
			});

			return { admitted: true, method: "definitive_indicator", stable: true };
		}

		if (!hasLeaveButton) {
			// Log when Leave button is missing (helps debug UI state issues)
			if (this.checkCount % 10 === 0) {
				this.logger.trace(
					"[AdmissionDetector] Leave button not found, waiting...",
					{ checkCount: this.checkCount, durationMs: Date.now() - startTime },
				);
			}

			return { admitted: false, stable: true };
		}

		// Phase 2: Check if still in waiting room (parallel check)
		const inWaitingRoom = await this.isInWaitingRoom();

		if (!inWaitingRoom) {
			this.logger.trace(
				"[AdmissionDetector] Leave button found, no waiting room elements - admitted",
				{ durationMs: Date.now() - startTime },
			);

			return { admitted: true, method: "structural_check", stable: false };
		}

		this.logger.trace(
			"[AdmissionDetector] Leave button found but still in waiting room",
			{ durationMs: Date.now() - startTime },
		);

		return { admitted: false, stable: true };
	}

	async isInWaitingRoom(): Promise<boolean> {
		// Check all waiting room indicators in PARALLEL for speed
		// This reduces worst-case from 3s+ to ~200ms per check

		const cancelSelectors = [
			'button[aria-label="Cancel"]',
			'//button[.//span[text()="Cancel"]]',
			'//button[contains(., "Cancel")]',
		] as const;

		// Filter text patterns (exclude button selectors already in cancelSelectors)
		const textPatterns = SELECTORS.waitingRoomIndicators.filter(
			(s) => !s.includes("Cancel") && !s.includes("Ask to join"),
		);

		// Check Cancel buttons, Ask to join, and text patterns in parallel
		const [cancelButton, askToJoinButton, textPattern] = await Promise.all([
			anyElementExists(
				this.page,
				cancelSelectors,
				DETECTION_TIMEOUTS.ELEMENT_CHECK_FAST,
			),
			elementExists(
				this.page,
				SELECTORS.askToJoinButton,
				DETECTION_TIMEOUTS.ELEMENT_CHECK_FAST,
			),
			anyElementExists(
				this.page,
				textPatterns,
				DETECTION_TIMEOUTS.ELEMENT_CHECK_FAST,
			),
		]);

		if (cancelButton) {
			this.logger.trace("[AdmissionDetector] Found Cancel button", {
				selector: cancelButton,
			});

			return true;
		}

		if (askToJoinButton) {
			this.logger.trace("[AdmissionDetector] Ask to join button still visible");

			return true;
		}

		if (textPattern) {
			this.logger.trace("[AdmissionDetector] Found waiting room text", {
				selector: textPattern,
			});

			return true;
		}

		return false;
	}
}
