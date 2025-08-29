import { jest } from "@jest/globals";

const readFileSync = jest.fn((path: string) => {
	console.log("Mocking reading in a file:", path);

	return Buffer.from("some-file-content");
});

const promises = {
	unlink: jest.fn(async (path: string) => {
		console.log("Mocking unlinking a file:", path);

		return Promise.resolve();
	}),
};

export { readFileSync, promises };
