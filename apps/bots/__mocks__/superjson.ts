import { jest } from "@jest/globals";

const superjson = {
	serialize: jest.fn((data) => ({ json: JSON.stringify(data), meta: null })),
	deserialize: jest.fn((data: { json: string }) => JSON.parse(data.json)),
};

export default superjson;
