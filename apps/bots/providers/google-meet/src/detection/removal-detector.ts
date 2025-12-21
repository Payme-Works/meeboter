import type { Page } from "playwright";
import type { RemovalDetector, RemovalResult } from "../../../../src/detection";
import {
	elementExists,
	elementExistsWithDetails,
} from "../../../../src/helpers/element-exists";
import type { BotLogger } from "../../../../src/logger";
import { GOOGLE_MEET_CONFIG } from "../constants";
import { SELECTORS } from "../selectors";

/**
 * Google Meet removal detector.
 *
 * Uses a hybrid approach for reliable detection:
 * - Immediate exit: Kick dialog, domain change, path change
 * - Delayed exit: 30-second debounce for sustained indicator absence
 * - Connection recovery: 5-minute grace period when reconnection detected
 *
 * This prevents false positives during Google Meet's internal reconnections
 * and network interruptions.
 */
export class GoogleMeetRemovalDetector implements RemovalDetector {
	private indicatorsMissingStartTime: number | null = null;
	private reconnectingDetectedTime: number | null = null;
	private checkCount = 0;

	constructor(
		private readonly page: Page | undefined,
		private readonly logger: BotLogger,
		private readonly originalMeetingPath: string,
	) {}

	async check(): Promise<RemovalResult> {
		this.checkCount++;

		this.logger.trace("[RemovalDetector] Starting removal check", {
			checkId: this.checkCount,
		});

		if (!this.page) {
			this.logger.warn("[RemovalDetector] Page is null, treating as removed");

			return { removed: true, reason: "page_null", immediate: true };
		}

		// Check 1: Verify we're still on Google Meet domain
		const urlCheck = this.checkUrl();

		if (urlCheck.removed) {
			return urlCheck;
		}

		// Check 2: Explicit kick dialog (immediate removal)
		const hasKickDialog = await elementExists(this.page, SELECTORS.kickDialog);

		if (hasKickDialog) {
			this.logger.info("[RemovalDetector] REMOVED: Kick dialog visible");

			return { removed: true, reason: "kick_dialog", immediate: true };
		}

		// Check 3: Removal indicators with 30-second debounce
		return this.checkIndicatorsWithDebounce();
	}

	resetAbsenceTimer(): void {
		if (this.indicatorsMissingStartTime !== null) {
			this.logger.debug("[RemovalDetector] Resetting absence timer", {
				absenceDurationMs: Date.now() - this.indicatorsMissingStartTime,
			});
		}

		this.indicatorsMissingStartTime = null;
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
				expectedHostname: GOOGLE_MEET_CONFIG.DOMAIN,
				currentPath: url.pathname,
				originalPath: this.originalMeetingPath,
			});

			// Domain changed (immediate removal)
			if (url.hostname !== GOOGLE_MEET_CONFIG.DOMAIN) {
				this.logger.info("[RemovalDetector] REMOVED: Domain mismatch", {
					currentDomain: url.hostname,
					expectedDomain: GOOGLE_MEET_CONFIG.DOMAIN,
				});

				return { removed: true, reason: "domain_changed", immediate: true };
			}

			// Path changed (redirected to different meeting or homepage)
			if (
				this.originalMeetingPath &&
				url.pathname !== this.originalMeetingPath
			) {
				this.logger.info("[RemovalDetector] REMOVED: Meeting path changed", {
					originalPath: this.originalMeetingPath,
					currentPath: url.pathname,
				});

				return { removed: true, reason: "path_changed", immediate: true };
			}

			return { removed: false, immediate: false };
		} catch (error) {
			this.logger.warn("[RemovalDetector] REMOVED: URL check failed", {
				error: error instanceof Error ? error.message : String(error),
			});

			return { removed: true, reason: "domain_changed", immediate: true };
		}
	}

	private async checkIndicatorsWithDebounce(): Promise<RemovalResult> {
		if (!this.page) {
			return { removed: true, reason: "page_null", immediate: true };
		}

		// Priority 1: Check if network reconnection is in progress
		const isReconnecting = await this.checkReconnectionStatus();

		if (isReconnecting) {
			// Start tracking reconnection time if not already
			if (this.reconnectingDetectedTime === null) {
				this.reconnectingDetectedTime = Date.now();

				this.logger.info(
					"[RemovalDetector] Network reconnection detected, starting extended grace period",
				);
			}

			const reconnectionDuration = Date.now() - this.reconnectingDetectedTime;

			// Check if we've exceeded the reconnection grace period (5 minutes)
			if (
				reconnectionDuration >= GOOGLE_MEET_CONFIG.RECONNECTION_GRACE_PERIOD_MS
			) {
				this.logger.info(
					"[RemovalDetector] REMOVED: Reconnection timeout after 5 minutes",
					{ reconnectionDurationMs: reconnectionDuration },
				);

				return {
					removed: true,
					reason: "reconnection_timeout",
					immediate: false,
				};
			}

			this.logger.debug("[RemovalDetector] Waiting for reconnection", {
				reconnectionDurationMs: reconnectionDuration,
				graceRemainingMs:
					GOOGLE_MEET_CONFIG.RECONNECTION_GRACE_PERIOD_MS -
					reconnectionDuration,
			});

			// Still reconnecting, tell caller to wait
			return { removed: false, immediate: false, reconnecting: true };
		}

		// If we were reconnecting but now aren't, reset the timer
		if (this.reconnectingDetectedTime !== null) {
			this.logger.info("[RemovalDetector] Network reconnection completed", {
				reconnectionDurationMs: Date.now() - this.reconnectingDetectedTime,
			});

			this.reconnectingDetectedTime = null;
		}

		// Priority 2: Check removal indicators
		this.logger.trace("[RemovalDetector] Checking removal indicators", {
			indicatorCount: SELECTORS.removalIndicators.length,
		});

		const indicatorResults: Record<
			string,
			{ exists: boolean; timedOut: boolean; durationMs: number }
		> = {};

		let allTimedOut = true;
		let foundIndicator = false;

		for (const selector of SELECTORS.removalIndicators) {
			const result = await elementExistsWithDetails(this.page, selector);
			indicatorResults[selector] = result;

			// If we found an indicator (not timed out), we're still in call
			if (result.exists && !result.timedOut) {
				foundIndicator = true;

				this.logger.trace("[RemovalDetector] In-call indicator found", {
					selector,
				});

				break;
			}

			if (!result.timedOut) {
				allTimedOut = false;
			}
		}

		// Found an indicator, reset timer and return not removed
		if (foundIndicator) {
			this.resetAbsenceTimer();

			return { removed: false, immediate: false };
		}

		// Count timeouts to detect connection issues
		const timedOutCount = Object.values(indicatorResults).filter(
			(r) => r.timedOut,
		).length;
		const totalCount = Object.keys(indicatorResults).length;
		const timeoutRatio = timedOutCount / totalCount;

		// If most checks timed out (>40%), likely connection issue, use extended grace period
		if (timeoutRatio > 0.4) {
			// Treat as reconnection scenario
			if (this.reconnectingDetectedTime === null) {
				this.reconnectingDetectedTime = Date.now();

				this.logger.info(
					"[RemovalDetector] Connection instability detected (indicators timing out), starting extended grace period",
					{
						timedOutCount,
						totalCount,
						timeoutRatio: Math.round(timeoutRatio * 100) + "%",
						indicatorResults,
					},
				);
			}

			const reconnectionDuration = Date.now() - this.reconnectingDetectedTime;

			if (
				reconnectionDuration >= GOOGLE_MEET_CONFIG.RECONNECTION_GRACE_PERIOD_MS
			) {
				this.logger.info(
					"[RemovalDetector] REMOVED: Connection instability timeout after 5 minutes",
					{ reconnectionDurationMs: reconnectionDuration },
				);

				return {
					removed: true,
					reason: "reconnection_timeout",
					immediate: false,
				};
			}

			this.logger.debug("[RemovalDetector] Waiting for connection to stabilize", {
				reconnectionDurationMs: reconnectionDuration,
				graceRemainingMs:
					GOOGLE_MEET_CONFIG.RECONNECTION_GRACE_PERIOD_MS - reconnectionDuration,
			});

			return { removed: false, immediate: false, reconnecting: true };
		}

		// All checks timed out, page is unresponsive (assume still in call)
		if (allTimedOut) {
			this.logger.warn(
				"[RemovalDetector] All indicator checks timed out, page unresponsive",
				{ indicatorResults },
			);

			return { removed: false, immediate: false };
		}

		// No indicators found, start or continue absence timer
		if (this.indicatorsMissingStartTime === null) {
			this.indicatorsMissingStartTime = Date.now();

			this.logger.info(
				"[RemovalDetector] No indicators found, starting grace period",
				{ checkedIndicators: indicatorResults },
			);

			return { removed: false, immediate: false };
		}

		// Check if we've exceeded the sustained absence threshold
		const absenceDuration = Date.now() - this.indicatorsMissingStartTime;

		if (absenceDuration < GOOGLE_MEET_CONFIG.SUSTAINED_ABSENCE_THRESHOLD_MS) {
			this.logger.debug("[RemovalDetector] Within grace period", {
				absenceDurationMs: absenceDuration,
				thresholdMs: GOOGLE_MEET_CONFIG.SUSTAINED_ABSENCE_THRESHOLD_MS,
				remainingMs:
					GOOGLE_MEET_CONFIG.SUSTAINED_ABSENCE_THRESHOLD_MS - absenceDuration,
			});

			return { removed: false, immediate: false };
		}

		// Exceeded threshold (confirmed removal)
		this.logger.info(
			"[RemovalDetector] REMOVED: Indicators missing for 30+ seconds",
			{
				absenceDurationMs: absenceDuration,
				checkedIndicators: indicatorResults,
			},
		);

		return { removed: true, reason: "sustained_absence", immediate: false };
	}

	/**
	 * Check if Google Meet is showing connection lost/reconnecting indicators.
	 * When network is lost, Google Meet shows messages like "You lost your network connection"
	 * or "Trying to reconnect" and the normal in-call indicators may disappear.
	 */
	private async checkReconnectionStatus(): Promise<boolean> {
		if (!this.page) {
			return false;
		}

		this.logger.trace("[RemovalDetector] Checking for connection lost indicators", {
			indicatorCount: SELECTORS.connectionLostIndicators.length,
		});

		for (const selector of SELECTORS.connectionLostIndicators) {
			try {
				const exists = await elementExists(this.page, selector);

				if (exists) {
					this.logger.info("[RemovalDetector] Connection lost indicator found", {
						selector,
					});

					return true;
				}
			} catch (error) {
				// Continue checking other selectors
				this.logger.trace("[RemovalDetector] Error checking selector", {
					selector,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		this.logger.trace("[RemovalDetector] No connection lost indicators found");

		return false;
	}
}
