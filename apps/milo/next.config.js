import path from "node:path";

/** @type {import("next").NextConfig} */
const config = {
	output: "standalone",

	outputFileTracingRoot: path.join(process.cwd(), "../../"),

	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**",
			},
		],
	},
};

export default config;
