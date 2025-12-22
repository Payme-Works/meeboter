#!/usr/bin/env bun

import { styleText } from "node:util";

// Get command line arguments (skip first two - bun and script path)
const args = process.argv.slice(2);

if (args.length === 0) {
	console.error(styleText("red", "Please provide at least one filter"));
	process.exit(1);
}

// Split first argument by ':' to get filters
const filters = args[0].split(":");

// Build new array of arguments with filters
const newArgs: string[] = ["run"];

// Add filter arguments
for (const filter of filters) {
	newArgs.push(`--filter=*${filter}`);
}

// Add remaining arguments
newArgs.push(...args.slice(1));

// Log the command in blue
console.log(styleText("blue", `Executing: bun turbo ${newArgs.join(" ")}`));
console.log();

// Execute the command
const proc = Bun.spawn(["bun", "turbo", ...newArgs], {
	stdout: "inherit",
	stderr: "inherit",
	stdin: "inherit",
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
	process.exit(exitCode);
}
