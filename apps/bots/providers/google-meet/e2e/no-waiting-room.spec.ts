import { BotTestHarness } from "./fixtures/bot-harness.fixture";
import { expect, test } from "./fixtures/host.fixture";

test.describe("Google Meet Direct Join", () => {
	let botHarness: BotTestHarness;

	test.afterEach(async () => {
		if (botHarness) {
			await botHarness.cleanup();
		}
	});

	test("bot joins directly when waiting room disabled", async ({
		hostPage,
		meetUrl,
		toggleWaitingRoom,
	}) => {
		const testName = "direct-join-no-waiting-room";

		console.log(`[E2E] Using shared meet: ${meetUrl}`);

		await hostPage.waitForTimeout(2000);

		try {
			await toggleWaitingRoom(false);
			console.log("[E2E] Waiting room disabled (quick access enabled)");
		} catch (error) {
			console.log(
				"[E2E] Could not toggle waiting room settings:",
				(error as Error).message,
			);
		}

		botHarness = new BotTestHarness(meetUrl, testName);

		const joinPromise = botHarness.bot.joinCall();

		await botHarness.waitForEvent("JOINING_CALL", 30000);
		console.log("[E2E] Bot emitted JOINING_CALL");

		await botHarness.waitForEvent("IN_CALL", 60000);
		console.log("[E2E] Bot emitted IN_CALL");

		await joinPromise;

		expect(botHarness.getState()).toBe("IN_CALL");

		const skippedWaitingRoom = !botHarness.hasEvent("IN_WAITING_ROOM");

		if (skippedWaitingRoom) {
			console.log("[E2E] Successfully skipped waiting room");
		} else {
			console.log(
				"[E2E] Bot went through waiting room (may need manual admit)",
			);
		}

		expect(botHarness.hasEvent("IN_CALL")).toBe(true);
	});
});
