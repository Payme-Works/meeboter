const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  // React environment configuration
  env: {
    browser: true,
    es6: true,
    node: true
  },

  // Base configuration extension
  extends: [
    require.resolve("./base"),
  ],
};
