import { jest } from "@jest/globals";

console.log("Mocking trpc.ts");

/**
 * Default mock bot data returned by getPoolSlot.
 * Tests can override this by modifying mockBotData before running.
 */
export const mockBotData = {
	id: 123,
	platform: "mock-platform",
	heartbeatInterval: 200,
	recordingEnabled: true,
	chatEnabled: false,
	meetingInfo: {
		platform: "mock-platform",
	},
};

export const trpc = {
	transformer: jest.fn(() => {}),
	links: [
		{
			url: jest.fn(() => {
				return "http://localhost:3000/api/trpc";
			}),
		},
	],
	bots: {
		getPoolSlot: {
			query: jest.fn(() => {
				console.log("Mock getPoolSlot query called");

				return Promise.resolve(mockBotData);
			}),
		},
		heartbeat: {
			mutate: jest.fn(() => {
				console.log("Mock heartbeat mutate called");

				return new Promise((resolve) => {
					resolve({});
				});
			}),
		},
		reportEvent: {
			mutate: jest.fn(() => {
				console.log("Mock reportEvent mutate called");

				return new Promise((resolve) => {
					resolve({});
				});
			}),
		},
		updateBotStatus: {
			mutate: jest.fn(() => {
				console.log("Mock reportEvent mutate called");

				return new Promise((resolve) => {
					resolve({});
				});
			}),
		},
	},
	chat: {
		getNextQueuedMessage: {
			query: jest.fn(() => {
				console.log("Mock getNextQueuedMessage query called");

				return Promise.resolve(null);
			}),
		},
	},
};
