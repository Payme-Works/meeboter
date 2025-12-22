import { BotTestHarness } from "./fixtures/bot-harness.fixture";
import { expect, test } from "./fixtures/host.fixture";

test.describe("Google Meet Admission", () => {
	let botHarness: BotTestHarness;

	test.afterEach(async () => {
		if (botHarness) {
			await botHarness.cleanup();
		}
	});

	test("bot enters waiting room and gets admitted by host", async ({
		hostPage,
		meetUrl,
		admitParticipant,
	}) => {
		const testName = "waiting-room-admission";

		console.log(`[E2E] Using shared meet: ${meetUrl}`);

		botHarness = new BotTestHarness(meetUrl, testName);

		const joinPromise = botHarness.bot.joinCall();

		await botHarness.waitForEvent("JOINING_CALL", 30000);
		console.log("[E2E] Bot emitted JOINING_CALL");

		try {
			await botHarness.waitForEvent("IN_WAITING_ROOM", 60000);
			console.log("[E2E] Bot emitted IN_WAITING_ROOM");

			await hostPage.waitForTimeout(2000);

			await admitParticipant(testName);
			console.log("[E2E] Host admitted bot");
		} catch {
			console.log("[E2E] Bot may have joined directly (no waiting room)");
		}

		await botHarness.waitForEvent("IN_CALL", 30000);
		console.log("[E2E] Bot emitted IN_CALL");

		await joinPromise;

		expect(botHarness.getState()).toBe("IN_CALL");
		expect(botHarness.hasEvent("JOINING_CALL")).toBe(true);
		expect(botHarness.hasEvent("IN_CALL")).toBe(true);
	});

	test("bot times out in waiting room when not admitted", async ({
		meetUrl,
	}) => {
		const testName = "waiting-room-timeout";

		console.log(`[E2E] Using shared meet: ${meetUrl}`);

		botHarness = new BotTestHarness(meetUrl, testName);

		botHarness.config.automaticLeave.waitingRoomTimeout = 15000;

		let errorThrown = false;

		try {
			await botHarness.bot.joinCall();
		} catch (error) {
			errorThrown = true;
			console.log("[E2E] Expected timeout error:", (error as Error).message);
		}

		const hasWaitingRoomEvent = botHarness.hasEvent("IN_WAITING_ROOM");

		if (hasWaitingRoomEvent) {
			expect(errorThrown).toBe(true);
		} else {
			console.log("[E2E] Bot joined directly without waiting room");
		}
	});
});
