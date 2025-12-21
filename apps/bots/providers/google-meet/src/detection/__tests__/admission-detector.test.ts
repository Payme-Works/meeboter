import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { Page } from "playwright";
import * as elementExistsModule from "../../../../../src/helpers/element-exists";
import type { BotLogger } from "../../../../../src/logger";
import { GoogleMeetAdmissionDetector } from "../admission-detector";

/**
 * Test scenarios for Google Meet Admission Detection
 *
 * The admission detector uses a three-phase approach:
 * 1. Definitive check: Side panel buttons (ONLY exist when truly in-call)
 * 2. Structural check: Leave button + no Cancel/Ask to join buttons
 * 3. Text fallback: Waiting room text patterns
 */

const createMockPage = () => ({}) as unknown as Page;

const createMockLogger = (): BotLogger =>
	({
		trace: mock(() => {}),
		debug: mock(() => {}),
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
		getState: mock(() => "test"),
	}) as unknown as BotLogger;

describe("GoogleMeetAdmissionDetector", () => {
	let mockPage: Page;
	let mockLogger: BotLogger;
	let detector: GoogleMeetAdmissionDetector;
	let elementExistsSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		mockPage = createMockPage();
		mockLogger = createMockLogger();
		detector = new GoogleMeetAdmissionDetector(mockPage, mockLogger);
		elementExistsSpy = spyOn(elementExistsModule, "elementExists");
	});

	describe("Scenario 1: Bot in waiting room with Cancel button visible", () => {
		/**
		 * SCENARIO: Bot clicked "Ask to join" and is waiting for host admission
		 *
		 * UI State:
		 * - Leave button: MAY exist (Google shows it in waiting room)
		 * - Cancel button: EXISTS (can cancel join request)
		 * - Side panel buttons: DO NOT exist
		 *
		 * Expected: admitted = false (should NOT falsely detect admission)
		 */
		it("should NOT detect admission when Cancel button exists", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				// Side panel buttons - don't exist in waiting room
				if (selector.includes("Chat with everyone"))
					return Promise.resolve(false);

				if (selector.includes("Meeting details")) return Promise.resolve(false);

				if (selector.includes("Host controls")) return Promise.resolve(false);

				if (selector.includes("Meeting tools")) return Promise.resolve(false);

				// Leave button - may exist in waiting room
				if (selector.includes("Leave call")) return Promise.resolve(true);

				// Cancel button - exists in waiting room
				if (selector.includes("Cancel")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(false);
			expect(result.stable).toBe(true);
		});
	});

	describe("Scenario 2: Bot in waiting room with Ask to join visible", () => {
		/**
		 * SCENARIO: Bot is on pre-join page, hasn't clicked join yet
		 *
		 * UI State:
		 * - Ask to join button: EXISTS
		 * - Leave button: DOES NOT exist
		 * - Side panel buttons: DO NOT exist
		 *
		 * Expected: admitted = false
		 */
		it("should NOT detect admission when Ask to join button exists", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				// Side panel buttons - don't exist
				if (selector.includes("Chat with everyone"))
					return Promise.resolve(false);

				if (selector.includes("Meeting details")) return Promise.resolve(false);

				if (selector.includes("Host controls")) return Promise.resolve(false);

				if (selector.includes("Meeting tools")) return Promise.resolve(false);

				// Leave button - doesn't exist yet
				if (selector.includes("Leave call")) return Promise.resolve(false);

				// Ask to join - still visible
				if (selector.includes("Ask to join")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(false);
		});
	});

	describe("Scenario 3: Bot fully admitted via definitive indicator", () => {
		/**
		 * SCENARIO: Bot is fully in the call, side panel buttons visible
		 *
		 * UI State:
		 * - Chat button: EXISTS (definitive indicator)
		 * - Leave button: EXISTS
		 * - Cancel button: DOES NOT exist
		 *
		 * Expected: admitted = true, method = "definitive_indicator", stable = true
		 */
		it("should detect admission via Chat button (definitive)", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				// Chat button exists - definitive indicator
				if (selector.includes("Chat with everyone"))
					return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(true);
			expect(result.method).toBe("definitive_indicator");
			expect(result.stable).toBe(true);
		});
	});

	describe("Scenario 4: Bot admitted but UI still loading", () => {
		/**
		 * SCENARIO: Bot just admitted, leave button visible but side panel still loading
		 *
		 * UI State:
		 * - Leave button: EXISTS
		 * - Side panel buttons: DON'T exist yet (loading)
		 * - Cancel button: DOES NOT exist
		 * - Ask to join: DOES NOT exist
		 *
		 * Expected: admitted = true, method = "structural_check", stable = false
		 * Note: stable = false means caller should wait for stabilization
		 */
		it("should detect admission via structural check (leave + no waiting room)", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				// Side panel buttons - not loaded yet
				if (selector.includes("Chat with everyone"))
					return Promise.resolve(false);

				if (selector.includes("Meeting details")) return Promise.resolve(false);

				if (selector.includes("Host controls")) return Promise.resolve(false);

				if (selector.includes("Meeting tools")) return Promise.resolve(false);

				// Leave button - exists
				if (selector.includes("Leave call")) return Promise.resolve(true);

				// Waiting room indicators - don't exist
				if (selector.includes("Cancel")) return Promise.resolve(false);

				if (selector.includes("Ask to join")) return Promise.resolve(false);

				if (selector.includes("Waiting for")) return Promise.resolve(false);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(true);
			expect(result.method).toBe("structural_check");
			expect(result.stable).toBe(false);
		});
	});

	describe("Scenario 5: False positive prevention - Leave button + waiting text", () => {
		/**
		 * SCENARIO: Race condition where Leave button appears but waiting room text still visible
		 *
		 * UI State:
		 * - Leave button: EXISTS
		 * - Waiting room text: EXISTS ("Waiting for host to let you in")
		 * - Side panel buttons: DO NOT exist
		 *
		 * Expected: admitted = false (waiting room text takes precedence)
		 */
		it("should NOT detect admission when waiting room text exists", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				// Side panel buttons - don't exist
				if (selector.includes("Chat with everyone"))
					return Promise.resolve(false);

				if (selector.includes("Meeting details")) return Promise.resolve(false);

				if (selector.includes("Host controls")) return Promise.resolve(false);

				if (selector.includes("Meeting tools")) return Promise.resolve(false);

				// Leave button - exists
				if (selector.includes("Leave call")) return Promise.resolve(true);

				// Cancel button - doesn't exist
				if (selector.includes("Cancel")) return Promise.resolve(false);

				// Ask to join - doesn't exist
				if (selector.includes("Ask to join")) return Promise.resolve(false);

				// But waiting room text exists
				if (selector.includes("Waiting for")) return Promise.resolve(true);

				if (selector.includes("let you in")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(false);
		});
	});

	describe("Scenario 6: Meeting details button as definitive indicator", () => {
		/**
		 * SCENARIO: Different definitive indicator found
		 *
		 * Expected: Any definitive indicator should work
		 */
		it("should detect admission via Meeting details button", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				if (selector.includes("Meeting details")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(true);
			expect(result.method).toBe("definitive_indicator");
		});
	});

	describe("Scenario 7: No indicators at all (page still loading)", () => {
		/**
		 * SCENARIO: Page is loading, no elements found yet
		 *
		 * UI State:
		 * - All elements: DO NOT exist
		 *
		 * Expected: admitted = false, stable = true
		 */
		it("should return not admitted when nothing exists", async () => {
			elementExistsSpy.mockImplementation(() => Promise.resolve(false));

			const result = await detector.check();

			expect(result.admitted).toBe(false);
			expect(result.stable).toBe(true);
		});
	});

	describe("isInWaitingRoom()", () => {
		it("should return true when Cancel button exists", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				if (selector.includes("Cancel")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.isInWaitingRoom();

			expect(result).toBe(true);
		});

		it("should return true when Ask to join button exists", async () => {
			elementExistsSpy.mockImplementation((_page, selector) => {
				if (selector.includes("Cancel")) return Promise.resolve(false);

				if (selector.includes("Ask to join")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.isInWaitingRoom();

			expect(result).toBe(true);
		});

		it("should return false when no waiting room indicators exist", async () => {
			elementExistsSpy.mockImplementation(() => Promise.resolve(false));

			const result = await detector.isInWaitingRoom();

			expect(result).toBe(false);
		});
	});
});
