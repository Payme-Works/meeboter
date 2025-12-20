import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import * as dotenv from "dotenv";
import { GoogleMeetBot } from "../providers/google-meet/src/bot";
import { MicrosoftTeamsBot } from "../providers/microsoft-teams/src/bot";
import { ZoomBot } from "../providers/zoom/src/bot";
import type { BotConfig } from "../src/types";

//
// Bot Exiit Tests as described in Section 2.1.2.5
// Of our System Verification and Validation Document.
//

// Create Mock Configs
dotenv.config({ path: ".env.test" });

describe("Meet Event Tests", () => {
	let bot: GoogleMeetBot;
	let addParticipant: () => Promise<void>;
	let removeParticipant: () => Promise<void>;

	// Create the bot for each
	beforeEach(async () => {
		// Create Mock Configs
		const mockMeetConfig = {
			id: 0,
			meetingInfo: JSON.parse(process.env.MEET_TEST_MEETING_INFO || "{}"),
			automaticLeave: {
				// automaticLeave: null, //Not included to see what happens on a bad config
			},
		} as BotConfig;

		// Create Bot
		bot = new GoogleMeetBot(
			mockMeetConfig,
			async (_eventType: string, _data: unknown) => {},
		);

		// Mock Bot Recording -- never actually record
		jest.spyOn(bot, "startRecording").mockImplementation(async () => {
			console.log("Mock startRecording called");
		});

		jest.spyOn(bot, "stopRecording").mockImplementation(async () => {
			console.log("Mock stopRecording called");

			return 0;
		});

		jest.spyOn(bot, "leaveCall").mockImplementation(async () => {
			console.log("Mock leaveCall called");

			return 0; // don't actually leave any meeting
		});

		// Keep track
		jest.spyOn(bot, "cleanup");

		// Kicked right away.
		jest.spyOn(bot, "hasBeenRemovedFromCall").mockImplementation(async () => {
			console.log("Mock hasBeenRemovedFromCall called");

			return true;
		});

		// Launch a browser, don't go to any page
		await bot.initializeBrowser(true); // Headless mode

		if (!bot.page) {
			throw new Error("Page not initialized");
		}

		// Replace implementation of page functions (we don't care about navigation)
		jest
			.spyOn(bot.page, "waitForSelector")
			.mockImplementation(async (selector: string) => {
				console.log(`Mock waitForSelector called with selector: ${selector}`);

				return Promise.resolve(null); // Mock the resolved value
			});

		jest.spyOn(bot.page, "click").mockImplementation(async () => {
			return Promise.resolve(void 0); // Mock the resolved value
		});

		// Set a DOM so bot can detect a person joining
		await bot.page.setContent(`<div aria-label="Participants">
            <!-- Initial participants -->
        </div>`);

		// Functions
		addParticipant = async () => {
			// Simulate a participant joining
			if (!bot.page) {
				throw new Error("Page not initialized");
			}

			await bot.page.evaluate(() => {
				const peopleList = document.querySelector(
					'[aria-label="Participants"]',
				);

				const participant = document.createElement("div");

				participant.setAttribute(
					"data-participant-id",
					`participant-${peopleList?.childNodes.length ?? 0}`,
				);

				participant.setAttribute(
					"aria-label",
					`name-${peopleList?.childNodes.length ?? 0}`,
				);

				peopleList?.appendChild(participant);
			});

			if (!bot.page) {
				throw new Error("Page not initialized");
			}

			await bot.page.waitForTimeout(30);
		};

		removeParticipant = async () => {
			// Simulate a participant leaving
			if (!bot.page) {
				throw new Error("Page not initialized");
			}

			await bot.page.evaluate(() => {
				const peopleList = document.querySelector(
					'[aria-label="Participants"]',
				);

				const participant = peopleList?.querySelector(
					`[data-participant-id="participant-${(peopleList?.childNodes.length ?? 1) - 1}"]`,
				);

				participant?.remove();
			});

			await bot.page.waitForTimeout(30);
		};
	});

	// Cleanup
	afterEach(async () => {
		// ensure the bot is closed after each test
		await bot.cleanup();

		// Remove mocks
		jest.clearAllMocks();
	});

	/**
	 * Check if a bot can detect a person joining
	 */
	it("Detect a Person Joining", async () => {
		// Setup Functions. Bot will get kicked rightaway.
		await bot.monitorCall();

		await addParticipant(); // Add first participant

		// Verify participant count after participants join
		expect(bot.participants.length).toBe(1);

		await addParticipant(); // Add next
		expect(bot.participants.length).toBe(2);

		await addParticipant(); // Add next
		await addParticipant(); // Add next
		await addParticipant(); // Add next
		expect(bot.participants.length).toBe(5);
	}, 60000);

	/**
	 * Check if a bot can detect a person leaving
	 */
	it("Detect a Person Leaving", async () => {
		// Setup Functions. Bot will get kicked rightaway.
		await bot.monitorCall();

		await addParticipant(); // Add first participant
		await addParticipant();
		await addParticipant();

		// Verify participant count after participants join
		expect(bot.participants.length).toBe(3);

		// See if can detect removing
		await removeParticipant();
		expect(bot.participants.length).toBe(2);

		await removeParticipant();
		expect(bot.participants.length).toBe(1);
	}, 60000);

	it.skip("Detect a Participant Media Share Start", () => {
		// No functionality yet.
	});

	it.skip("Detect a Participant Media Share Stop", () => {
		// No functionality yet.
	});
});

// ===============================================================================================================================================================
// ===============================================================================================================================================================
// ===============================================================================================================================================================
// ===============================================================================================================================================================

describe("Zoom Event Tests", () => {
	let bot: ZoomBot;
	let _addParticipant: () => Promise<void>;
	let _removeParticipant: () => Promise<void>;

	// Create the bot for each
	beforeEach(async () => {
		// Create a Zoom Bot
		bot = new ZoomBot(
			{
				id: 0,
				meetingInfo: JSON.parse(process.env.ZOOM_TEST_MEETING_INFO || "{}"),
				automaticLeave: {
					// automaticLeave: null, //Not included to see what happens on a bad config
				},
			} as BotConfig,
			async (_eventType: string, _data: unknown) => {},
		);

		// Mock

		// Functions
		_addParticipant = async () => {};
		_removeParticipant = async () => {};
	});

	afterEach(async () => {
		// ensure the bot is closed after each test
		await bot.cleanup();

		// Remove mocks
		jest.clearAllMocks();
	});

	it.skip("Detect a Person Joining", async () => {
		// Empty, no functionality yet.
	});

	it.skip("Detect a Person Leaving", async () => {
		// Empty, no functionality yet.
	});

	it.skip("Detect a Participant Media Share Start", () => {
		// No functionality yet.
	});

	it.skip("Detect a Participant Media Share Stop", () => {
		// No functionality yet.
	});
});

// ===============================================================================================================================================================
// ===============================================================================================================================================================
// ===============================================================================================================================================================
// ===============================================================================================================================================================

describe("Teams Event Tests", () => {
	let bot: MicrosoftTeamsBot;
	let _addParticipant: () => Promise<void>;
	let _removeParticipant: () => Promise<void>;

	// Create the bot for each
	beforeEach(async () => {
		// Create a Zoom Bot
		bot = new MicrosoftTeamsBot(
			{
				id: 0,
				meetingInfo: JSON.parse(process.env.TEAMS_TEST_MEETING_INFO || "{}"),
				automaticLeave: {
					// automaticLeave: null, //Not included to see what happens on a bad config
				},
			} as BotConfig,
			async (_eventType: string, _data: unknown) => {},
		);

		// Mock

		// Functions
		_addParticipant = async () => {};
		_removeParticipant = async () => {};
	});

	afterEach(async () => {
		// ensure the bot is closed after each test
		await bot.cleanup();

		// Remove mocks
		jest.clearAllMocks();
	});

	it.skip("Detect a Person Joining", async () => {
		// Empty, no functionality yet.
	});

	it.skip("Detect a Person Leaving", async () => {
		// Empty, no functionality yet.
	});

	it.skip("Detect a Participant Media Share Start", () => {
		// No functionality yet.
	});

	it.skip("Detect a Participant Media Share Stop", () => {
		// No functionality yet.
	});
});
