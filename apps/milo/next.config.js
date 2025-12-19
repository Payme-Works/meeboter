import path from "node:path";

/** @type {import("next").NextConfig} */
const config = {
	output: "standalone",

	outputFileTracingRoot: path.join(process.cwd(), "../../"),
};

export default config;
