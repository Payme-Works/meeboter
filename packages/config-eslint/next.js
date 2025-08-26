/** @type {import("eslint").Linter.Config} */
module.exports = {
  // Next.js environment configuration
  env: {
    browser: true,
    es6: true,
    node: true
  },

  // Configuration extensions
  extends: [
    require.resolve("./base"),
    require.resolve("@vercel/style-guide/eslint/next"),
    "plugin:react-hooks/recommended",
  ],

  // Next.js specific ignore patterns
  ignorePatterns: [
    '.next'
  ],
};
