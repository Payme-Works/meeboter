const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  // Extend base configuration
  extends: [require.resolve("./base")],

  // Test environment configuration
  env: {
    jest: true,
  },
  
  // Library-specific ignore patterns
  ignorePatterns: [
    "dist/",
  ],
};
