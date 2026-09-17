#!/usr/bin/env node
"use strict";

// PostToolUse (Write|Edit) hook: runs the project's `lint` npm script, if
// one exists, and blocks (feeds the error back to Claude) on failure.
// No-ops until package.json + a "lint" script exist (stack not chosen yet).

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PKG_PATH = path.join(ROOT, "package.json");

function main() {
  if (!fs.existsSync(PKG_PATH)) process.exit(0);

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  } catch {
    process.exit(0);
  }
  if (!pkg.scripts || !pkg.scripts.lint) process.exit(0);

  try {
    execSync("npm run lint", { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    process.exit(0);
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).split("\n").slice(0, 60).join("\n");
    console.log(
      JSON.stringify({
        decision: "block",
        reason: "lint 실패. 아래 오류를 고치고 다시 시도하세요:\n" + out,
        systemMessage: "lint 실패 — 수정 필요",
      })
    );
    process.exit(0);
  }
}

main();
