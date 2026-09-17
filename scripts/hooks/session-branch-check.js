#!/usr/bin/env node
"use strict";

// SessionStart hook: announces the current git branch, and if it's main,
// tells Claude (and the user) to switch to dev first.

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function main() {
  let branch;
  try {
    branch = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    console.log(JSON.stringify({ systemMessage: "git 저장소가 아닙니다 (브랜치 확인 불가)" }));
    process.exit(0);
  }

  if (!branch) {
    console.log(JSON.stringify({ systemMessage: "현재 detached HEAD 상태입니다." }));
    process.exit(0);
  }

  if (branch === "main") {
    const msg = `현재 브랜치: main — 작업 전 dev 브랜치로 전환하세요 (git checkout dev)`;
    console.log(
      JSON.stringify({
        systemMessage: "⚠️ " + msg,
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext:
            "현재 git 브랜치가 'main'입니다. 세션 시작 시 사용자에게 dev 브랜치로 전환할 것을 안내하세요 (git checkout dev).",
        },
      })
    );
  } else {
    console.log(JSON.stringify({ systemMessage: `현재 브랜치: ${branch}` }));
  }

  process.exit(0);
}

main();
