const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  // Global variables and environment configuration
  globals: {
    React: true,
    JSX: true,
  },
  env: {
    node: true,
  },

  // Base configurations and plugin extensions
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ],

  // Plugin declarations
  plugins: [
    "@typescript-eslint/eslint-plugin",
    "import-helpers",
    "unused-imports",
    "prettier",
  ],

  // ESLint rule configurations
  rules: {
    // Code style and formatting
    'prettier/prettier': 'error',
    'curly': ['error', 'all'],
    'no-underscore-dangle': 'off',

    // Unused variables and imports handling
    "no-unused-vars": ["error", { 
      "vars": "all", 
      "args": "none",
      "varsIgnorePattern": "^_|^[A-Z][A-Z_]+$|^[A-Z][a-zA-Z]*$"
    }],
    "unused-imports/no-unused-imports": "error",
    "unused-imports/no-unused-vars": [
      "warn",
      { 
        "vars": "all",
        "varsIgnorePattern": "^_",
        "args": "after-used",
        "argsIgnorePattern": "^_"
      }
    ],

    // Import organization
    'import-helpers/order-imports': [
      'warn',
      {
        newlinesBetween: 'always',
        groups: [
          'module',

          '/^@live-boost/',
          '/^@live-boost/core/',
          '/^@live-boost/database/',
          '/^@live-boost/graphql/',
          '/^@live-boost/image-generator/',
          '/^@live-boost/tasks/',
          '/^@live-boost/transactional/',

          '/^@live-boost/modules-mining-cards-core/',
          '/^@live-boost/modules-mining-cards-database/',
          '/^@live-boost/modules-mining-cards-mesh-extension-module/',

          '/^@/config/',
          '/^@/application/',
          '/^@/domain/',
          '/^@/infra/',
          
          ['parent', 'sibling'],
          'index',
        ],
        alphabetize: { order: 'asc', ignoreCase: true },
      },
    ],

    // TypeScript-specific rules
    '@typescript-eslint/no-unused-vars': [
      'error',
      { 
        "vars": "all", 
        "args": "none", 
        "ignoreRestSiblings": true,
        "varsIgnorePattern": "^_",
        "argsIgnorePattern": "^_"
      },
    ],

    // Code structure and readability
    '@typescript-eslint/padding-line-between-statements': [
      'error',
      {
        blankLine: 'always',
        prev: '*',
        next: [
          'if',
          'return',
          'function',
          'interface',
          'type',
          'multiline-const',
          'multiline-let',
          'multiline-var',
          'class',
          'export',
          'try',
          'throw',
          'break',
          'continue',
          'multiline-expression',
        ],
      },
      {
        blankLine: 'always',
        prev: [
          'if',
          'class',
          'function',
          'interface',
          'type',
          'export',
          'try',
          'multiline-const',
          'multiline-let',
          'multiline-var',
          'multiline-expression',
        ],
        next: '*',
      },
      {
        blankLine: 'always',
        prev: 'multiline-expression',
        next: 'multiline-expression',
      },
      {
        blankLine: 'any',
        prev: 'export',
        next: 'export',
      },
    ],
    "@typescript-eslint/no-empty-function": ["error", { "allow": ["arrowFunctions"] }]
  },
  
  // TypeScript configuration
  settings: {
    "import/resolver": {
      typescript: {
        project,
      },
    },
  },

  // Files to ignore
  ignorePatterns: [
    "node_modules",
    "dist",
  ],

  // File-specific configurations
  overrides: [{ files: ["*.js?(x)", "*.ts?(x)"] }],
}; 