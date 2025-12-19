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
import { MicrosoftTeamsBot } from "../providers/teams/src/bot";
import { ZoomBot } from "../providers/zoom/src/bot";
import type { BotConfig } from "../src/types";

//
// Bot Exiit Tests as described in Section 2.1.2.3
// Of our System Verification and Validation Document.
//

// Load the .env.test file (overrides variables from .env if they overlap)
dotenv.config({ path: ".env.test" });

// Create Mock Configs
const mockMeetConfig = {
	id: 0,
	meetingInfo: JSON.parse(process.env.MEET_TEST_MEETING_INFO || "{}"),
	automaticLeave: {
		// automaticLeave: null, //Not included to see what happens on a bad config
	},
} as BotConfig;

const mockZoomConfig = {
	id: 0,
	meetingInfo: JSON.parse(process.env.ZOOM_TEST_MEETING_INFO || "{}"),
	automaticLeave: {
		// automaticLeave: null, //Not included to see what happens on a bad config
	},
} as BotConfig;

const mockTeamsConfig = {
	id: 0,
	meetingInfo: JSON.parse(process.env.TEAMS_TEST_MEETING_INFO || "{}"),
	automaticLeave: {
		// automaticLeave: null, //Not included to see what happens on a bad config
	},
} as BotConfig;

describe("Meet Bot Exit Tests", () => {
	let bot: GoogleMeetBot;

	// Create the bot for each
	beforeEach(() => {
		// Create Bot
		bot = new GoogleMeetBot(
			mockMeetConfig,
			async (_eventType: string, _data: unknown) => {},
		);

		// Override Page functionality (ignore navigation)
		bot.page = {
			waitForSelector: jest.fn(async () => {
				return 0;
			}), // Simulate successful navigation
			click: jest.fn(async () => {
				return 0;
			}), // Simulate successful navigation
			exposeFunction: jest.fn(async () => {
				return 0;
			}), // Simulate successful function loading
			evaluate: jest.fn(async () => {
				return 0;
			}), // Simulate successful evaluation
		} as unknown as typeof bot.page; // Mock the page object

		// Mock Bot Recording -- never actually record
		jest.spyOn(bot, "startRecording").mockImplementation(async () => {
			console.log("Mock startRecording called");
		});

		jest.spyOn(bot, "stopRecording").mockImplementation(async () => {
			console.log("Mock stopRecording called");

			return 0;
		});

		// Ensure bot would have ended it's life
		jest.spyOn(bot, "endLife").mockImplementation(async () => {
			console.log("Mock endLife called");
		});
	});

	// Cleanup
	afterEach(() => {
		jest.clearAllMocks();
	});

	/**
	 * Create a meet and join a predefined meeting (set in MEET_MEETING_INFO, above. When testing, you need to make sure this a valid meeting link).
	 * This lets you check if the bot can join a meeting and if it can handle the waiting room -- good to know if the UI changed
	 */
	it("Detect Empty Participation and Exit the meeting", async () => {
		// replace the bot.checkKicked function with a mock implementation
		// Here: We did not got kicked
		jest.spyOn(bot, "checkKicked").mockImplementation(async () => {
			return false;
		});

		// Run Meeting info without setting up the browser

		// Break private value setter and set the timeAloneStarted to a value that is a long time ago
		(bot as unknown as { timeAloneStarted: number }).timeAloneStarted =
			Date.now() - 1000000;

		(bot as { participants: unknown[] }).participants = [
			{ id: "123", name: "Test User" },
		]; //simulate it being only me in the meeting

		await bot.meetingActions();

		expect(bot.endLife).toHaveBeenCalled(); //includes stopRecording()
	}, 60000); // Set max timeout to 60 seconds

	it("Ensure on Bot Kicked proper events", async () => {
		// replace the bot.checkKicked function with a mock implementation
		// i.e Ensure bot is always kicked right away
		jest.spyOn(bot, "checkKicked").mockImplementation(async () => {
			return true;
		});

		// Run Meeting info without setting up the browser

		// Break private value setter and set the timeAloneStarted to a value that is a long time ago
		(bot as unknown as { timeAloneStarted: number }).timeAloneStarted =
			Date.now() - 1000000;

		(bot as { participants: unknown[] }).participants = [
			{ id: "123", name: "Test User" },
			{ id: "456", name: "Another User" },
			{ id: "789", name: "Third User" },
			{ id: "101", name: "Fourth User" },
			{ id: "102", name: "Fifth User" },
		]; //simulate there being a lot of people in the meeting

		await bot.meetingActions();

		// Ensure endLife would have been called
		expect(bot.endLife).toHaveBeenCalled(); //includes stopRecording()
	}, 60000); // Set max timeout to 60 seconds

	it("Ensure can leave meeting if UI does not allow for it", async () => {
		// Kick Self
		jest.spyOn(bot, "checkKicked").mockImplementation(async () => {
			return true;
		});

		// Error on Leave Meeting (cannot click the button somehow)
		jest.spyOn(bot, "leaveMeeting").mockImplementation(async () => {
			console.log("Mock leaveMeeting called");

			throw new Error("Unable to leave meeting"); // Simulate an error when trying to leave the meeting
		});

		//Test Function
		await bot.meetingActions();

		// Ensure end meeting calls endLife (closes browser) even if an irregular leaveMeeting event.
		expect(bot.endLife).toHaveBeenCalled(); //includes stopRecording()
	}, 6000);
});

// ===========================================================================
// ===========================================================================
// ===========================================================================
// ===========================================================================

describe("Zoom Bot Exit Tests", () => {
	let bot: ZoomBot;

	beforeEach(() => {
		// Mock WebSocket connection for Puppeteer
		jest.mock("puppeteer", () => {
			const originalModule = jest.requireActual("puppeteer");

			return {
				...(originalModule as object),
				wss: jest.fn(async () => ({
					wsEndpoint: jest.fn(() => "ws://mocked-websocket-endpoint"),
					disconnect: jest.fn(),
				})),
			};
		});

		// Create Bot
		bot = new ZoomBot(
			mockZoomConfig,
			async (_eventType: string, _data: unknown) => {},
		);

		// mock items
		bot.page = {
			waitForSelector: jest.fn(async () => {
				return 0;
			}), // Simulate successful navigation
			click: jest.fn(async () => {
				return 0;
			}), // Simulate successful navigation
			exposeFunction: jest.fn(async () => {
				return 0;
			}), // Simulate successful function loading
			evaluate: jest.fn(async () => {
				return 0;
			}), // Simulate successful evaluation
		} as unknown as typeof bot.page; // Mock the page object

		bot.browser = {} as typeof bot.browser;

		// Ensure bot would have ended it's life
		jest.spyOn(bot, "endLife").mockImplementation(async () => {
			console.log("Mock endLife called");
		});

		jest.spyOn(bot, "startRecording").mockImplementation(async () => {
			console.log("Mock startRecording called");
		});

		jest.spyOn(bot, "stopRecording").mockImplementation(async () => {
			console.log("Mock stopRecording called");
		});

		jest.spyOn(bot, "joinMeeting").mockImplementation(async () => {
			console.log("Mock joinMeeting called");
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	/**
	 * Create a meet and join a predefined meeting (set in MEET_MEETING_INFO, above. When testing, you need to make sure this a valid meeting link).
	 * This lets you check if the bot can join a meeting and if it can handle the waiting room -- good to know if the UI changed
	 */

	it.skip("Detect Empty Participation and Exit the meeting", async () => {
		// Empty Test -- no implementation yet
		expect(false).toBe(true);
	});

	it.skip("Ensure on Bot Kicked proper events", async () => {
		// Empty Test -- no implementation yet
		expect(false).toBe(true);
	});

	it.skip("Ensure can leave meeting if UI does not allow for it", async () => {
		// Empty Test -- no implementation yet
		expect(false).toBe(true);
	});
});

// ===========================================================================
// ===========================================================================
// ===========================================================================
// ===========================================================================

describe("Teams Bot Exit Tests", () => {
	let bot: MicrosoftTeamsBot;

	beforeEach(() => {
		// Mock WebSocket connection for Puppeteer
		jest.mock("puppeteer", () => {
			const originalModule = jest.requireActual("puppeteer");

			return {
				...(originalModule as object),
				wss: jest.fn(async () => ({
					wsEndpoint: jest.fn(() => "ws://mocked-websocket-endpoint"),
					disconnect: jest.fn(),
				})),
			};
		});

		// Create Bot
		bot = new MicrosoftTeamsBot(
			mockTeamsConfig,
			async (_eventType: string, _data: unknown) => {},
		);

		// mock items
		bot.page = {
			waitForSelector: jest.fn(async () => {
				return 0;
			}), // Simulate successful navigation
			click: jest.fn(async () => {
				return 0;
			}), // Simulate successful navigation
			exposeFunction: jest.fn(async () => {
				return 0;
			}), // Simulate successful function loading
			evaluate: jest.fn(async () => {
				return 0;
			}), // Simulate successful evaluation
		} as unknown as typeof bot.page; // Mock the page object

		// Override
		bot.browser = {} as typeof bot.browser;

		// Add mock to ensure bot would have ended it's life
		jest.spyOn(bot, "endLife").mockImplementation(async () => {
			console.log("Mock endLife called");
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	/**
	 * Create a meet and join a predefined meeting (set in MEET_MEETING_INFO, above. When testing, you need to make sure this a valid meeting link).
	 * This lets you check if the bot can join a meeting and if it can handle the waiting room -- good to know if the UI changed
	 */

	it.skip("Detect Empty Participation and Exit the meeting", async () => {
		// Ensure bot would have ended it's life
		jest.spyOn(bot, "joinMeeting").mockImplementation(async () => {
			console.log("Mock joinMeeting called");
		});

		// Empty Test -- no implementation yet
		expect(false).toBe(true);
	});

	it.skip("Ensure on Bot Kicked proper events", async () => {
		//
		jest.spyOn(bot, "joinMeeting").mockImplementation(async () => {
			console.log("Mock joinMeeting called");
		});

		// Empty Test -- no implementation yet
		expect(false).toBe(true);
	});

	it.skip("Ensure can leave meeting if UI does not allow for it", async () => {
		jest.spyOn(bot, "joinMeeting").mockImplementation(async () => {
			console.log("Mock joinMeeting called");
		});

		// Empty Test -- no implementation yet
		expect(false).toBe(true);
	}, 6000);
});
