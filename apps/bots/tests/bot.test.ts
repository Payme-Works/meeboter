import { describe, expect, it } from "@jest/globals";
import { GoogleMeetBot } from "../providers/google-meet/src/bot";
import { MicrosoftTeamsBot } from "../providers/microsoft-teams/src/bot";
import { ZoomBot } from "../providers/zoom/src/bot";
import type { Bot } from "../src/bot";
import { createBot } from "../src/bot-factory";
import type { BotConfig } from "../src/types";

//
// Bot Creation Tests as described in Section 2.1.2.1
// Of our System Verification and Validation Document.
//

describe("Bot Creation from given data", () => {
	/**
	 * Create a meets bot
	 */
	it("Create Meets Bot", () => {
		const mockBotData = {
			id: 0,
			meetingInfo: {
				platform: "google",
			},
		} as BotConfig;

		createBot(mockBotData).then((bot: Bot) => {
			expect(bot).toBeInstanceOf(GoogleMeetBot);
		});
	});

	/**
	 * Creates a Zoom Bot
	 */
	it("Create Zoom Bot", () => {
		const mockBotData = {
			id: 0,
			meetingInfo: {
				platform: "zoom",
			},
		} as BotConfig;

		createBot(mockBotData).then((bot: Bot) => {
			expect(bot).toBeInstanceOf(ZoomBot);
		});
	});

	/**
	 * Creates a Microsoft Teams bot
	 */
	it("Create Microsoft Teams Bot", () => {
		const mockBotData = {
			id: 0,
			meetingInfo: {
				platform: "microsoft-teams",
			},
		} as BotConfig;

		createBot(mockBotData).then((bot: Bot) => {
			expect(bot).toBeInstanceOf(MicrosoftTeamsBot);
		});
	});
});

describe("Bot fails creation from invalid data", () => {
	/**
	 * Create a bot with invalid data
	 */
	it("Create Bot with invalid data (empty meetingInfo)", async () => {
		const mockBotData = {
			id: 0,
			meetingInfo: {},
		} as BotConfig;

		await expect(async () => {
			await createBot(mockBotData);
		}).rejects.toThrow();
	});

	it("Create Bot with invalid data (missing meetingInfo)", async () => {
		const mockBotData = {
			id: 0,
		} as BotConfig;

		await expect(async () => {
			await createBot(mockBotData);
		}).rejects.toThrow();
	});

	/**
	 * Create a bot with invalid data
	 */
	it("Create Bot with invalid data (no platform, but some other data)", async () => {
		const mockBotData = {
			id: 0,
			meetingInfo: {
				meetingUrl: "https://example.com",
			},
		} as BotConfig;

		await expect(async () => {
			await createBot(mockBotData);
		}).rejects.toThrow();
	});
});
