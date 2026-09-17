"use strict";
const js = require("@eslint/js");
const globals = require("globals");

// Two different worlds live under the same .js extension in this repo:
// scripts/dashboard/public/js/** is browser ESM (see its own <script type="module">),
// everything else (scripts/**, src/**, scripts/hooks/**) is Node CJS.
// Getting sourceType wrong here breaks `npm run lint` on the very first run
// (RULES.md §5 lint-check.js has no per-file extension filter — see
// PACKAGING.md-style adversarial review of T002).
module.exports = [
  {
    ignores: ["node_modules/**", "dist/**", "*.blob", "*.exe"],
  },
  {
    files: ["**/*.js"],
    ...js.configs.recommended,
  },
  {
    // Default: everything is Node CJS (repo root configs, scripts/, src/,
    // scripts/hooks/). The dashboard's browser ESM is the one exception,
    // overridden below — see PACKAGING.md-style review notes on T002.
    files: ["**/*.js"],
    ignores: ["scripts/dashboard/public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["scripts/dashboard/public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
];
