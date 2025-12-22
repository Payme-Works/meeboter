import { describe, expect, it } from "bun:test";
import { GOOGLE_MEET_CONFIG } from "../constants";

/**
 * Test scenarios for Name Fill Resilience
 *
 * The name fill operation uses:
 * - Adaptive stabilization delay (200ms → 400ms → 800ms → 1000ms capped)
 * - Retry with specific error classification
 * - Fresh element re-location on each attempt
 *
 * These tests verify the configuration and delay calculation logic.
 */

describe("Name Fill Resilience Configuration", () => {
	describe("Adaptive stabilization delay calculation", () => {
		/**
		 * The stabilization delay formula:
		 * delay = min(BASE * 2^retryCount, MAX)
		 *
		 * Expected progression:
		 * - Retry 0: 200ms
		 * - Retry 1: 400ms
		 * - Retry 2: 800ms
		 * - Retry 3+: 1000ms (capped)
		 */
		it("should calculate correct delay for retry 0", () => {
			const retryCount = 0;

			const stabilizationMs = Math.min(
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS * 2 ** retryCount,
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_MAX_MS,
			);

			expect(stabilizationMs).toBe(200);
		});

		it("should calculate correct delay for retry 1", () => {
			const retryCount = 1;

			const stabilizationMs = Math.min(
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS * 2 ** retryCount,
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_MAX_MS,
			);

			expect(stabilizationMs).toBe(400);
		});

		it("should calculate correct delay for retry 2", () => {
			const retryCount = 2;

			const stabilizationMs = Math.min(
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS * 2 ** retryCount,
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_MAX_MS,
			);

			expect(stabilizationMs).toBe(800);
		});

		it("should cap delay at max for retry 3+", () => {
			const retryCount = 3;

			const stabilizationMs = Math.min(
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS * 2 ** retryCount,
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_MAX_MS,
			);

			// 200 * 2^3 = 1600, but capped at 1000
			expect(stabilizationMs).toBe(1000);
		});

		it("should remain capped for high retry counts", () => {
			const retryCount = 7;

			const stabilizationMs = Math.min(
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS * 2 ** retryCount,
				GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_MAX_MS,
			);

			// Should remain at max regardless of high retry count
			expect(stabilizationMs).toBe(1000);
		});
	});

	describe("Configuration values", () => {
		it("should have correct timeout for name fill attempts", () => {
			expect(GOOGLE_MEET_CONFIG.NAME_FILL_TIMEOUT_MS).toBe(5000);
		});

		it("should have correct max retries", () => {
			expect(GOOGLE_MEET_CONFIG.NAME_FILL_MAX_RETRIES).toBe(8);
		});

		it("should have correct base stabilization delay", () => {
			expect(GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_BASE_MS).toBe(200);
		});

		it("should have correct max stabilization delay", () => {
			expect(GOOGLE_MEET_CONFIG.NAME_FILL_STABILIZATION_MAX_MS).toBe(1000);
		});
	});
});

describe("Fill Retryable Errors Classification", () => {
	/**
	 * These error patterns are used to determine if a fill operation
	 * should be retried vs. failing immediately.
	 */
	const FILL_RETRYABLE_ERRORS = [
		"Timeout",
		"timeout",
		"Target page, context or browser has been closed",
		"Element is not visible",
		"Element is not attached",
		"Element is outside of the viewport",
	];

	const isRetryable = (errorMessage: string): boolean =>
		FILL_RETRYABLE_ERRORS.some((err) => errorMessage.includes(err));

	describe("Retryable errors", () => {
		it("should classify Timeout as retryable", () => {
			expect(isRetryable("Timeout 5000ms exceeded")).toBe(true);
		});

		it("should classify Element is not attached as retryable", () => {
			expect(isRetryable("Element is not attached to the DOM")).toBe(true);
		});

		it("should classify Element is not visible as retryable", () => {
			expect(isRetryable("Element is not visible")).toBe(true);
		});

		it("should classify browser closed as retryable", () => {
			expect(
				isRetryable("Target page, context or browser has been closed"),
			).toBe(true);
		});

		it("should classify Element is outside of the viewport as retryable", () => {
			expect(isRetryable("Element is outside of the viewport")).toBe(true);
		});
	});

	describe("Non-retryable errors", () => {
		it("should NOT classify random errors as retryable", () => {
			expect(isRetryable("Some random error")).toBe(false);
		});

		it("should NOT classify network errors as retryable (handled separately)", () => {
			expect(isRetryable("ERR_CONNECTION_REFUSED")).toBe(false);
		});
	});
});
