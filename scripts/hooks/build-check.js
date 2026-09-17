#!/usr/bin/env node
"use strict";

// Stop hook: runs the project's `build` npm script, if one exists, and
// blocks the turn from ending (forcing Claude to keep working) on failure.
// No-ops until package.json + a "build" script exist (stack not chosen yet).

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
  if (!pkg.scripts || !pkg.scripts.build) process.exit(0);

  try {
    execSync("npm run build", { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    console.log(JSON.stringify({ systemMessage: "build 통과" }));
    process.exit(0);
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).split("\n").slice(0, 80).join("\n");
    console.log(
      JSON.stringify({
        continue: false,
        stopReason: "build 실패. 아래 오류를 고치기 전에는 작업을 끝낼 수 없습니다:\n" + out,
        systemMessage: "build 실패 — 작업 계속 필요",
      })
    );
    process.exit(0);
  }
}

main();
