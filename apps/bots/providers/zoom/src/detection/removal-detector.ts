import type { Page } from "puppeteer";
import type { RemovalDetector, RemovalResult } from "../../../../src/detection";
import type { BotLogger } from "../../../../src/logger";
import { ZOOM_CONFIG } from "../constants";
import { SELECTORS } from "../selectors";

/**
 * Zoom removal detector.
 *
 * Zoom runs the meeting inside an iframe, so detection must handle:
 * - Page-level checks: Domain verification, iframe presence
 * - Frame-level checks: Leave button inside the iframe
 *
 * All removal conditions are immediate (no debounce needed).
 */
export class ZoomRemovalDetector implements RemovalDetector {
	constructor(
		private readonly page: Page | undefined,
		private readonly logger: BotLogger,
	) {}

	async check(): Promise<RemovalResult> {
		this.logger.trace("[RemovalDetector] Starting removal check");

		if (!this.page) {
			this.logger.warn("[RemovalDetector] Page is null, treating as removed");

			return { removed: true, reason: "page_null", immediate: true };
		}

		// Check 1: Verify we're still on Zoom domain
		const urlCheck = this.checkUrl();

		if (urlCheck.removed) {
			return urlCheck;
		}

		// Check 2: Iframe and leave button
		return this.checkIframeAndLeaveButton();
	}

	resetAbsenceTimer(): void {
		// No-op: Zoom doesn't use debounced detection
	}

	private checkUrl(): RemovalResult {
		if (!this.page) {
			return { removed: true, reason: "page_null", immediate: true };
		}

		try {
			const currentUrl = this.page.url();
			const url = new URL(currentUrl);

			this.logger.trace("[RemovalDetector] URL check", {
				currentHostname: url.hostname,
				expectedHostname: ZOOM_CONFIG.DOMAIN,
				fullUrl: currentUrl,
			});

			if (url.hostname !== ZOOM_CONFIG.DOMAIN) {
				this.logger.info(
					"[RemovalDetector] REMOVED: Domain mismatch detected",
					{
						currentDomain: url.hostname,
						expectedDomain: ZOOM_CONFIG.DOMAIN,
						fullUrl: currentUrl,
					},
				);

				return { removed: true, reason: "domain_changed", immediate: true };
			}

			return { removed: false, immediate: false };
		} catch (error) {
			this.logger.warn(
				"[RemovalDetector] Error checking page URL, treating as removed",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);

			return { removed: true, reason: "domain_changed", immediate: true };
		}
	}

	private async checkIframeAndLeaveButton(): Promise<RemovalResult> {
		if (!this.page) {
			return { removed: true, reason: "page_null", immediate: true };
		}

		try {
			const iframe = await this.page.$(SELECTORS.webClientIframe);

			this.logger.trace("[RemovalDetector] Iframe check", {
				iframeFound: !!iframe,
				selector: SELECTORS.webClientIframe,
			});

			if (!iframe) {
				this.logger.info("[RemovalDetector] REMOVED: Meeting iframe not found");

				return { removed: true, reason: "iframe_missing", immediate: true };
			}

			const frame = await iframe.contentFrame();

			this.logger.trace("[RemovalDetector] Frame access check", {
				frameAccessible: !!frame,
			});

			if (!frame) {
				this.logger.info(
					"[RemovalDetector] REMOVED: Cannot access meeting iframe",
				);

				return { removed: true, reason: "iframe_missing", immediate: true };
			}

			const leaveButton = await frame.$(SELECTORS.leaveButton);

			this.logger.trace("[RemovalDetector] Leave button check", {
				leaveButtonFound: !!leaveButton,
				selector: SELECTORS.leaveButton,
			});

			if (!leaveButton) {
				this.logger.info("[RemovalDetector] REMOVED: Leave button not found");

				return {
					removed: true,
					reason: "leave_button_missing",
					immediate: true,
				};
			}

			return { removed: false, immediate: false };
		} catch (error) {
			this.logger.trace(
				"[RemovalDetector] Error checking elements, assuming still in call",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);

			return { removed: false, immediate: false };
		}
	}
}
