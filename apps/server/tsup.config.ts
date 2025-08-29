import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	outDir: "dist",
	format: ["esm"],
	dts: {
		only: true,
	},
	clean: true,
	minify: false,
	sourcemap: false,
});
