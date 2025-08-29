import { jest } from "@jest/globals";

const launch = jest.fn(() => {
	console.log("Mocking puppeteer launch");

	return {
		defaultBrowserContext: jest.fn(() => ({
			clearPermissionOverrides: jest.fn(),
			overridePermissions: jest.fn(),
		})),
		newPage: jest.fn(() => ({
			goto: jest.fn(),
			waitForSelector: jest.fn(() => ({
				contentFrame: jest.fn(() => ({
					waitForSelector: jest.fn(),
					click: jest.fn(),
					type: jest.fn(),
				})),
			})),
		})),
		close: jest.fn(),
	};
});

const getStream = jest.fn(() => ({
	pipe: jest.fn(),
	destroy: jest.fn(),
}));

const wss = jest.fn(() =>
	Promise.resolve({
		close: jest.fn(),
	}),
);

export { getStream, launch, wss };
