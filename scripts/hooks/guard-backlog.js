#!/usr/bin/env node
"use strict";

// PreToolUse guard: blocks direct read/edit/write/grep access to backlog.json
// and direct shell dumps of it, and redirects to scripts/backlog-cli.js.

const GUIDANCE =
  "backlog.json은 CLI로만 조회/수정하세요. " +
  "조회: node scripts/backlog-cli.js list|show <id>|stats|validate  " +
  "수정: node scripts/backlog-cli.js update <id> ...|status <id> <상태>  " +
  "추가: node scripts/backlog-cli.js add --title \"...\"  " +
  "(전체 사용법: node scripts/backlog-cli.js help)";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function isBacklogPath(p) {
  if (!p || typeof p !== "string") return false;
  const norm = p.replace(/\\/g, "/");
  return /(^|\/)backlog\.json$/i.test(norm);
}

// Bash commands that legitimately need to touch backlog.json text
// (git plumbing, or our own CLI/doc-gen tooling) are allowed through.
const ALLOWED_BASH_PATTERNS = [
  /^\s*git\s/i,
  /backlog-cli\.js/i,
  /gen-task-docs\.ps1/i,
  /\bguard-backlog\.js\b/i,
  /\bbacklog-commit\.js\b/i,
];

function deny(reason) {
  console.log(
    JSON.stringify({
      systemMessage: "차단됨: " + reason,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })
  );
  process.exit(0);
}

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }

  const tool = input.tool_name;
  const ti = input.tool_input || {};

  if (tool === "Read" || tool === "Edit" || tool === "Write") {
    if (isBacklogPath(ti.file_path)) {
      deny(GUIDANCE);
    }
  } else if (tool === "Grep") {
    if (isBacklogPath(ti.path)) {
      deny(GUIDANCE);
    }
  } else if (tool === "Bash") {
    const cmd = String(ti.command || "");
    if (/backlog\.json/i.test(cmd)) {
      const allowed = ALLOWED_BASH_PATTERNS.some((re) => re.test(cmd));
      if (!allowed) {
        deny(GUIDANCE);
      }
    }
  }

  process.exit(0);
}

main();
