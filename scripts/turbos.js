#!/usr/bin/env node

const { spawn } = require("node:child_process");

// Get command line arguments (skip first two - node and script path)
const args = process.argv.slice(2);

if (args.length === 0) {
	console.error("Please provide at least one filter");
	process.exit(1);
}

// Split first argument by '/' to get filters
const filters = args[0].split("/");

// Build new array of arguments with filters
const newArgs = ["run"];

// Add filter arguments
filters.forEach((filter) => {
	newArgs.push(`--filter=*${filter}`);
});

// Add remaining arguments
newArgs.push(...args.slice(1));

// Log the command in blue
console.log("\x1b[34m%s\x1b[0m", `Executing: pnpm turbo ${newArgs.join(" ")}`);
console.log();
console.log();

// Execute the command
const child = spawn("pnpm", ["turbo", ...newArgs], {
	stdio: "inherit",
	shell: true,
});

// Handle process exit
child.on("exit", (code) => {
	process.exit(code);
});
