import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, jest } from "@jest/globals";
import { Bot } from "../src/bot";
import { createS3Client, uploadRecordingToS3 } from "../src/s3";
import type { BotConfig, EventCode, SpeakerTimeframe } from "../src/types";

/**
 * Concrete mock implementation of the abstract Bot class for testing.
 */
class MockBot extends Bot {
	async joinCall(): Promise<unknown> {
		return;
	}
	async screenshot(
		_filename?: string,
		_trigger?: string,
	): Promise<string | null> {
		return null;
	}
	async cleanup(): Promise<unknown> {
		return;
	}
	async run(): Promise<void> {
		return;
	}
	getRecordingPath(): string {
		return "mock-path";
	}
	getContentType(): string {
		return "mock-content-type";
	}
	getSpeakerTimeframes(): SpeakerTimeframe[] {
		return [];
	}
	async hasBeenRemovedFromCall(): Promise<boolean> {
		return false;
	}
	async sendChatMessage(_message: string): Promise<boolean> {
		return false;
	}
}

//
// Bot Startup Tests as described in Section 2.1.2, and recording upload tests as described in 2.1.2.4,
// of our System Verification and Validation Document.
//

// Excplicit mock build-in module required for jest to work with fs
jest.mock("fs");

describe("Bot S3 Startup Tests", () => {
	// Test that the S3 client is created with credentials when provided
	// (Local Development Example)
	it("create an S3 client with credentials when provided", () => {
		const mockRegion = "us-east-1";
		const mockAccessKeyId = "mockAccessKeyId";
		const mockSecretKey = "mockSecretKey";

		createS3Client({
			region: mockRegion,
			accessKeyId: mockAccessKeyId,
			secretAccessKey: mockSecretKey,
		});

		expect(S3Client).toHaveBeenCalledWith({
			region: mockRegion,
			credentials: {
				accessKeyId: mockAccessKeyId,
				secretAccessKey: mockSecretKey,
			},
		});
	});

	// Test that the S3 client is created without credentials when not provided
	// (Production Example)
	it("create an S3 client without credentials when not provided", () => {
		const mockRegion = "us-east-1";

		createS3Client({ region: mockRegion });

		expect(S3Client).toHaveBeenCalledWith({
			region: mockRegion,
		});
	});

	it("Bot exits immediately if s3 config passed in is invalid", () => {
		const result = createS3Client({ region: "" });
		expect(result).toBeNull();
	});
});

describe("S3Client Upload Tests", () => {
	it("upload a file to S3", async () => {
		// Fake S3 Client
		const mockBucketName = "mock-bucket-name";
		const mockKey = "mock-key";
		const mockBody = "mock-body";

		const s3Client = new S3Client({});

		const putObjectCommand = new PutObjectCommand({
			Bucket: mockBucketName,
			Key: mockKey,
			Body: mockBody,
		});

		// Create a fake bot
		const mockConfig = {
			meetingInfo: {
				platform: "mock-platform",
			},
		} as unknown as BotConfig;

		const mockOnEvent = async (_eventType: EventCode, _data?: unknown) => {
			/* mock event handler */
		};

		// Create Mock Bot using the concrete MockBot class
		const someBot = new MockBot(mockConfig, mockOnEvent);
		someBot.getRecordingPath = jest.fn(() => "mock-path"); // Mock the getRecordingPath method to return the mock body
		someBot.getContentType = jest.fn(() => "mock-content-type"); // Mock the getContentType method to return the mock content type

		//
		// Test
		await uploadRecordingToS3(s3Client, someBot);
		//

		// Ensure the S3Client and PutObjectCommand were called with the correct parameters
		expect(PutObjectCommand).toHaveBeenCalledWith({
			Bucket: mockBucketName,
			Key: mockKey,
			Body: mockBody,
		});

		expect(s3Client.send).toHaveBeenCalledWith(putObjectCommand);
	});
});
