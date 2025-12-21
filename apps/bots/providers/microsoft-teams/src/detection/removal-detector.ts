import type { Page } from "puppeteer";
import type { RemovalDetector, RemovalResult } from "../../../../src/detection";
import type { BotLogger } from "../../../../src/logger";
import { MICROSOFT_TEAMS_CONFIG } from "../constants";
import { SELECTORS } from "../selectors";

/**
 * Microsoft Teams removal detector.
 *
 * Uses immediate detection for all removal conditions:
 * - Domain change: Navigated away from teams.microsoft.com
 * - Leave button missing: Call ended or kicked
 * - Page null: Browser context lost
 *
 * Unlike Google Meet, Teams doesn't need debounce logic since
 * the UI state is more stable and predictable.
 */
export class MicrosoftTeamsRemovalDetector implements RemovalDetector {
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

		// Check 1: Verify we're still on Teams domain
		const urlCheck = this.checkUrl();

		if (urlCheck.removed) {
			return urlCheck;
		}

		// Check 2: Leave button gone (call ended or kicked)
		return this.checkLeaveButton();
	}

	resetAbsenceTimer(): void {
		// No-op: Teams doesn't use debounced detection
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
				expectedHostname: MICROSOFT_TEAMS_CONFIG.DOMAIN,
				fullUrl: currentUrl,
			});

			if (url.hostname !== MICROSOFT_TEAMS_CONFIG.DOMAIN) {
				this.logger.info(
					"[RemovalDetector] REMOVED: Domain mismatch detected",
					{
						currentDomain: url.hostname,
						expectedDomain: MICROSOFT_TEAMS_CONFIG.DOMAIN,
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

	private async checkLeaveButton(): Promise<RemovalResult> {
		if (!this.page) {
			return { removed: true, reason: "page_null", immediate: true };
		}

		try {
			const leaveButton = await this.page.$(SELECTORS.leaveButton);

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
				"[RemovalDetector] Error checking leave button, assuming still in call",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			);

			return { removed: false, immediate: false };
		}
	}
}
