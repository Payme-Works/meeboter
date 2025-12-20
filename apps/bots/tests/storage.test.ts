import { describe, expect, it, jest } from "@jest/globals";
import { S3StorageProvider, StorageService } from "../src/services/storage";

//
// Storage Provider Tests as described in Section 2.1.2, and recording upload tests as described in 2.1.2.4,
// of our System Verification and Validation Document.
//

// Explicit mock build-in module required for jest to work with fs
jest.mock("fs");

describe("S3StorageProvider", () => {
	it("creates an S3 provider with credentials", () => {
		const provider = new S3StorageProvider({
			region: "us-east-1",
			accessKeyId: "mockAccessKeyId",
			secretAccessKey: "mockSecretKey",
			bucketName: "mock-bucket",
		});

		expect(provider).toBeInstanceOf(S3StorageProvider);
		expect(provider.getBucketName()).toBe("mock-bucket");
		expect(provider.isConfigured()).toBe(true);
	});

	it("creates an S3 provider without credentials (for IAM roles)", () => {
		const provider = new S3StorageProvider({
			region: "us-east-1",
			bucketName: "mock-bucket",
		});

		expect(provider).toBeInstanceOf(S3StorageProvider);
		expect(provider.isConfigured()).toBe(true);
	});

	it("reports not configured when bucket name is missing", () => {
		const provider = new S3StorageProvider({
			region: "us-east-1",
		});

		expect(provider.isConfigured()).toBe(false);
	});
});

describe("StorageService", () => {
	it("delegates to storage provider", () => {
		const mockProvider = {
			getBucketName: jest.fn(() => "test-bucket"),
			isConfigured: jest.fn(() => true),
			upload: jest.fn(async () => {}),
		};

		const service = new StorageService(mockProvider);

		expect(service.getBucketName()).toBe("test-bucket");
		expect(service.isConfigured()).toBe(true);
		expect(mockProvider.getBucketName).toHaveBeenCalled();
		expect(mockProvider.isConfigured).toHaveBeenCalled();
	});
});
