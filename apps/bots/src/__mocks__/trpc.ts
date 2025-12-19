import { jest } from "@jest/globals";

console.log("Mocking trpc.ts");

/**
 * Default mock bot data returned by pool.getSlot.
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
		// Sub-routers
		pool: {
			getSlot: {
				query: jest.fn(() => {
					console.log("Mock pool.getSlot query called");

					return Promise.resolve(mockBotData);
				}),
			},
		},
		events: {
			report: {
				mutate: jest.fn(() => {
					console.log("Mock events.report mutate called");

					return new Promise((resolve) => {
						resolve({});
					});
				}),
			},
		},
		chat: {
			dequeueMessage: {
				query: jest.fn(() => {
					console.log("Mock chat.dequeueMessage query called");

					return Promise.resolve(null);
				}),
			},
		},

		// Flat procedures
		sendHeartbeat: {
			mutate: jest.fn(() => {
				console.log("Mock sendHeartbeat mutate called");

				return new Promise((resolve) => {
					resolve({});
				});
			}),
		},
		updateStatus: {
			mutate: jest.fn(() => {
				console.log("Mock updateStatus mutate called");

				return new Promise((resolve) => {
					resolve({});
				});
			}),
		},
		addScreenshot: {
			mutate: jest.fn(() => {
				console.log("Mock addScreenshot mutate called");

				return new Promise((resolve) => {
					resolve({});
				});
			}),
		},
	},
};
