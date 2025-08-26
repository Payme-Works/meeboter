/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['@meeting-bot/eslint-config/library.js'],

  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: true,
  },
};
