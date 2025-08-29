import { jest } from "@jest/globals";

class S3Client {
	constructor(params: Record<string, unknown>) {
		console.log("S3Client called with params:", params);
	}

	send = jest.fn((sendParams: unknown) => {
		console.log("S3Client send called with params:", sendParams);
	});

	destroy = jest.fn();
}

const PutObjectCommand = jest.fn((params) => {
	console.log("PutObjectCommand called with params:", params);
});

export { S3Client, PutObjectCommand };
