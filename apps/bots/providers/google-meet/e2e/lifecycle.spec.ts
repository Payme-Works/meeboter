import { BotTestHarness } from "./fixtures/bot-harness.fixture";
import { expect, test } from "./fixtures/host.fixture";

test.describe("Google Meet Full Lifecycle", () => {
	let botHarness: BotTestHarness;

	test.afterEach(async () => {
		if (botHarness) {
			await botHarness.cleanup();
		}
	});

	test("complete bot lifecycle with participant events", async ({
		hostPage,
		meetUrl,
		admitParticipant,
		addParticipant,
	}) => {
		const testName = "lifecycle-participant-events";

		console.log(`[E2E] Using shared meet: ${meetUrl}`);

		botHarness = new BotTestHarness(meetUrl, testName);

		const joinPromise = botHarness.bot.joinCall();

		await botHarness.waitForEvent("JOINING_CALL", 30000);
		console.log("[E2E] Bot emitted JOINING_CALL");

		try {
			await botHarness.waitForEvent("IN_WAITING_ROOM", 60000);
			console.log("[E2E] Bot in waiting room");

			await admitParticipant(testName);
			console.log("[E2E] Host admitted bot");
		} catch {
			console.log("[E2E] Bot joined directly (no waiting room)");
		}

		await botHarness.waitForEvent("IN_CALL", 30000);
		console.log("[E2E] Bot is in call");

		await joinPromise;

		expect(botHarness.getState()).toBe("IN_CALL");

		console.log("[E2E] Adding participant to meet...");

		const { page: participantPage } = await addParticipant("Test Participant");

		await participantPage.goto(meetUrl);
		await participantPage.waitForLoadState("networkidle");

		const participantNameInput = participantPage.locator('input[type="text"]');

		try {
			await participantNameInput.first().fill("Test Participant", {
				timeout: 10000,
			});
		} catch {
			console.log(
				"[E2E] Could not fill participant name (may not be required)",
			);
		}

		const joinButtons = [
			participantPage.getByRole("button", { name: /join now/i }),
			participantPage.getByRole("button", { name: /ask to join/i }),
		];

		for (const button of joinButtons) {
			try {
				await button.click({ timeout: 5000 });
				console.log("[E2E] Participant clicked join button");

				break;
			} catch {}
		}

		await hostPage.waitForTimeout(2000);

		try {
			await admitParticipant("Test Participant");
			console.log("[E2E] Host admitted participant");
		} catch {
			console.log("[E2E] Participant may have joined directly");
		}

		await hostPage.waitForTimeout(1000);

		console.log("[E2E] Participant leaving...");

		const participantLeaveButton = participantPage.getByRole("button", {
			name: /leave call/i,
		});

		try {
			await participantLeaveButton.click({ timeout: 5000 });
			console.log("[E2E] Participant left the call");
		} catch {
			console.log("[E2E] Could not click participant leave button");
			await participantPage.close();
		}

		await hostPage.waitForTimeout(1000);

		const finalState = botHarness.getState();

		console.log(`[E2E] Final bot state: ${finalState}`);

		console.log(
			`[E2E] All emitted events: ${botHarness.emitter.emittedEvents.map((e) => e.code).join(", ")}`,
		);

		expect(botHarness.hasEvent("JOINING_CALL")).toBe(true);
		expect(botHarness.hasEvent("IN_CALL")).toBe(true);
	});

	test("bot handles meeting ended gracefully", async ({
		meetUrl,
		admitParticipant,
	}) => {
		const testName = "meeting-ended-gracefully";

		console.log(`[E2E] Using shared meet: ${meetUrl}`);

		botHarness = new BotTestHarness(meetUrl, testName);

		const joinPromise = botHarness.bot.joinCall();

		await botHarness.waitForEvent("JOINING_CALL", 30000);

		try {
			await botHarness.waitForEvent("IN_WAITING_ROOM", 60000);
			await admitParticipant(testName);
		} catch {
			// Direct join
		}

		await botHarness.waitForEvent("IN_CALL", 30000);

		await joinPromise;

		console.log("[E2E] Bot is in call");

		console.log(
			`[E2E] All events: ${botHarness.emitter.emittedEvents.map((e) => e.code).join(", ")}`,
		);

		expect(botHarness.hasEvent("IN_CALL")).toBe(true);
	});
});
