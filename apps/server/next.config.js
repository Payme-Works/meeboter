/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

import path from "node:path";

/** @type {import("next").NextConfig} */
const config = {
	output: "standalone",

	outputFileTracingRoot: path.join(process.cwd(), "../../"),

	// Exclude swagger-ui-react from server-side bundle to avoid next/document import errors
	webpack: (config, { isServer }) => {
		if (isServer) {
			config.externals = config.externals || [];
			config.externals.push("swagger-ui-react");
		}

		return config;
	},
};

export default config;
