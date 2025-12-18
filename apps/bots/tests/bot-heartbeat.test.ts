import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

// Use the Mocked TRPC
jest.mock("../src/trpc");

// Excplicit mock build-in module required for jest to work with process
jest.mock("process");

import { startHeartbeat } from "../src/monitoring";
import { uploadRecordingToS3 } from "../src/s3";
import { trpc } from "../src/trpc";

//
// Bot Exiit Tests as described in Section 2.1.2.6
// Of our System Verification and Validation Document.
//

// Keep reference
const mockBot = {
	run: jest.fn(() => {
		console.log("Mock bot run called");

		return new Promise((resolve) => {
			resolve({});
		});
	}),
	getSpeakerTimeframes: jest.fn(() => {
		console.log("Mock bot getSpeakerTimeframes called");

		return [];
	}),
	endLife: jest.fn(() => {
		console.log("Mock bot endLife called");

		return new Promise((resolve) => {
			resolve({});
		});
	}),
	screenshot: jest.fn(() => {
		console.log("Mock bot screenshot called");

		return new Promise((resolve) => {
			resolve({});
		});
	}),
};

// One time mocks
jest.mock("../src/bot", () => ({
	createBot: jest.fn(() => {
		console.log("Mock createBot called, passing back mock object");

		return mockBot;
	}),
}));

jest.mock("../src/s3", () => ({
	createS3Client: jest.fn(() => {
		console.log("Mock createS3Client called");

		return {};
	}),
	uploadRecordingToS3: jest.fn((_s3, _bot) => {
		console.log("Mock uploadRecordingToS3 called");

		return new Promise((resolve) => {
			resolve({});
		});
	}),
}));

describe("Heartbeat Tests", () => {
	let controller: AbortController;
	const botId = -1;

	beforeEach(() => {
		controller = new AbortController();
	});

	afterEach(() => {
		jest.clearAllMocks(); // Clear mocks after each test (incl. counters)
	});

	it("Start and Stop Heartbeat 1000ms", async () => {
		// 1 second
		const testInterval = 1000;

		// Start the heartbeat
		startHeartbeat(botId, controller.signal, testInterval);

		// Wait 5 seconds
		await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds

		// Stop the heartbeat
		controller.abort();

		expect(controller.signal.aborted).toBe(true); // Check if the signal is aborted
		expect(trpc.bots.heartbeat.mutate).toHaveBeenCalledTimes(5); // Check if trpc was called    }, 10000); // 10 seconds to allow for the heartbeat to run
	}, 10000); // 10 seconds to allow for the heartbeat to run

	it("Start and Stop Heartbeat 5000ms", async () => {
		// 1 second
		const testInterval = 5000;

		// Start the heartbeat
		startHeartbeat(botId, controller.signal, testInterval);

		// Wait 5 seconds
		await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds

		// Stop the heartbeat
		controller.abort();

		expect(controller.signal.aborted).toBe(true); // Check if the signal is aborted
		expect(trpc.bots.heartbeat.mutate).toHaveBeenCalledTimes(1); // Check if trpc was called
	}, 10000); // 10 seconds to allow for the heartbeat to run
});

describe("Main function tests", () => {
	let exitCode: string | number | null | undefined;

	beforeEach(() => {
		// Mock environment variables for the new POOL_SLOT_UUID pattern
		// Bot config is fetched from API using POOL_SLOT_UUID, not passed via BOT_DATA
		process.env.POOL_SLOT_UUID = "test-pool-slot-uuid";

		// Use Object.defineProperty to work around TypeScript's read-only constraint on NODE_ENV
		Object.defineProperty(process.env, "NODE_ENV", {
			value: "test",
			writable: true,
			configurable: true,
		});

		process.env.MILO_URL = "http://localhost:3000";
		process.env.MILO_AUTH_TOKEN = "mock-auth-token";

		// S3 configuration
		process.env.S3_BUCKET_NAME = "mock-bucket";
		process.env.S3_REGION = "mock-region";
		process.env.S3_ACCESS_KEY = "mock-access-key";
		process.env.S3_SECRET_KEY = "mock-secret-key";
		process.env.S3_ENDPOINT = "http://localhost:9000";

		exitCode = undefined;
	});

	afterEach(() => {
		// Restore the original process.exit implementation
		jest.clearAllMocks();
		exitCode = undefined;
	});

	it("Test Main Function Heartbeat Starts and Stops", async () => {
		const mockExit = jest.spyOn(process, "exit").mockImplementation((code) => {
			console.log("Setting exitCode", code);
			exitCode = code;
			console.log(`Mock process.exit called with code "${code}"`);

			return undefined as never; // You need as never so the test can complete -- otherwise jest short circuts.
		});

		// Test Main
		const { main } = await import("../src/index");
		await main();

		expect(mockExit).toHaveBeenCalledWith(0);
		expect(exitCode).toBe(0); // Check if exit code is 0
		expect(trpc.bots.heartbeat.mutate).toHaveBeenCalled(); // Check if trpc was called
		expect(trpc.bots.reportEvent.mutate).toHaveBeenCalled(); // Check if trpc was called

		expect(mockBot.run).toHaveBeenCalled();
		expect(uploadRecordingToS3).toHaveBeenCalled(); // Check if uploadRecordingToS3 was called
	}, 10000); // 10 seconds to allow for the heartbeat to run
});
