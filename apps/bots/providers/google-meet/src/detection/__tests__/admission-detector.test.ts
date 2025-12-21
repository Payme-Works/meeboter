import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { Page } from "playwright";
import * as elementExistsModule from "../../../../../src/helpers/element-exists";
import type { BotLogger } from "../../../../../src/logger";
import { GoogleMeetAdmissionDetector } from "../admission-detector";

/**
 * Test scenarios for Google Meet Admission Detection
 *
 * The admission detector requires definitive indicators (side panel buttons)
 * for admission confirmation. These buttons ONLY exist when truly in-call,
 * eliminating false positives from elements that appear in both states.
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
			elementExistsSpy.mockImplementation((_page: Page, selector: string) => {
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
			elementExistsSpy.mockImplementation((_page: Page, selector: string) => {
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
			elementExistsSpy.mockImplementation((_page: Page, selector: string) => {
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

	describe("Scenario 4: Leave button exists but no side panel buttons", () => {
		/**
		 * SCENARIO: Bot in ambiguous state - Leave button visible but no definitive indicators
		 *
		 * This is the FALSE POSITIVE case we're fixing. Previously, structural_check
		 * would incorrectly detect admission here. Now we require definitive indicators.
		 *
		 * UI State:
		 * - Leave button: EXISTS
		 * - Side panel buttons: DO NOT exist
		 * - Cancel button: DOES NOT exist
		 *
		 * Expected: admitted = false (require definitive indicators)
		 */
		it("should NOT detect admission with only Leave button (no side panel)", async () => {
			elementExistsSpy.mockImplementation((_page: Page, selector: string) => {
				// Side panel buttons - don't exist
				if (selector.includes("Chat with everyone"))
					return Promise.resolve(false);

				if (selector.includes("Meeting details")) return Promise.resolve(false);

				if (selector.includes("Host controls")) return Promise.resolve(false);

				if (selector.includes("Meeting tools")) return Promise.resolve(false);

				// Leave button exists but that's not enough
				if (selector.includes("Leave call")) return Promise.resolve(true);

				return Promise.resolve(false);
			});

			const result = await detector.check();

			expect(result.admitted).toBe(false);
			expect(result.stable).toBe(true);
		});
	});

	describe("Scenario 6: Meeting details button as definitive indicator", () => {
		/**
		 * SCENARIO: Different definitive indicator found
		 *
		 * Expected: Any definitive indicator should work
		 */
		it("should detect admission via Meeting details button", async () => {
			elementExistsSpy.mockImplementation((_page: Page, selector: string) => {
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

});
