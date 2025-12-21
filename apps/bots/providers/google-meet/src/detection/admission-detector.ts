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
 * Requires definitive indicators (side panel buttons) for admission confirmation.
 * These buttons ONLY exist when truly in-call, eliminating false positives from
 * UI elements that appear in both waiting room and call states (like Leave button).
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

		// Check for definitive admission indicators (side panel buttons)
		// These ONLY exist when truly in-call, not in waiting room
		const admissionIndicator = await anyElementExists(
			this.page,
			SELECTORS.admissionIndicators,
			DETECTION_TIMEOUTS.ELEMENT_CHECK,
		);

		if (admissionIndicator) {
			this.logger.trace("[AdmissionDetector] Found definitive indicator", {
				selector: admissionIndicator,
				durationMs: Date.now() - startTime,
			});

			return { admitted: true, method: "definitive_indicator", stable: true };
		}

		// Log periodically when still waiting
		if (this.checkCount % 10 === 0) {
			this.logger.trace(
				"[AdmissionDetector] No admission indicators found, waiting...",
				{ checkCount: this.checkCount, durationMs: Date.now() - startTime },
			);
		}

		return { admitted: false, stable: true };
	}
}
