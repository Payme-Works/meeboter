// eslint.config.js

import stylisticPlugin from "@stylistic/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

export default defineConfig([
	{
		files: ["**/src/**/*.{ts,tsx,js,jsx}"],
		ignores: ["node_modules", ".next"],

		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				ecmaFeatures: { jsx: true },
			},
		},

		plugins: {
			stylistic: stylisticPlugin,
		},

		rules: {
			"stylistic/padding-line-between-statements": [
				"error",
				{
					blankLine: "always",
					prev: "*",
					next: [
						"if",
						"return",
						"function",
						"interface",
						"type",
						"multiline-const",
						"multiline-let",
						"multiline-var",
						"class",
						"export",
						"try",
						"throw",
						"break",
						"continue",
						"multiline-expression",
					],
				},
				{
					blankLine: "always",
					prev: [
						"if",
						"class",
						"function",
						"interface",
						"type",
						"export",
						"try",
						"multiline-const",
						"multiline-let",
						"multiline-var",
						"multiline-expression",
					],
					next: "*",
				},
				{
					blankLine: "always",
					prev: "multiline-expression",
					next: "multiline-expression",
				},
				{
					blankLine: "any",
					prev: "export",
					next: "export",
				},
			],
		},
	},
]);
