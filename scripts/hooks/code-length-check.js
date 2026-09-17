#!/usr/bin/env node
"use strict";

// PostToolUse (Write|Edit) hook: warns at 85% of the project's per-file
// line limit, and blocks (asks Claude to redo the work) past 100%.

const fs = require("fs");
const path = require("path");

const MAX_LINES = 300;
const WARN_RATIO = 0.85;

const CODE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".go", ".java", ".kt", ".cs", ".rb", ".php",
  ".c", ".h", ".cpp", ".hpp", ".rs", ".swift",
  ".vue", ".svelte", ".css", ".scss", ".sql", ".sh", ".ps1",
]);

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }

  const filePath = (input.tool_input || {}).file_path;
  if (!filePath) process.exit(0);

  const ext = path.extname(filePath).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext)) process.exit(0);

  // backlog docs/tooling aren't "project code" in scope for this check
  const norm = filePath.replace(/\\/g, "/");
  if (/(^|\/)tasks\/T\d+\.md$/i.test(norm)) process.exit(0);

  if (!fs.existsSync(filePath)) process.exit(0);
  const content = fs.readFileSync(filePath, "utf8");
  const lineCount = content.split("\n").length;

  const warnAt = Math.floor(MAX_LINES * WARN_RATIO);
  const pct = Math.round((lineCount / MAX_LINES) * 100);

  if (lineCount > MAX_LINES) {
    console.log(
      JSON.stringify({
        decision: "block",
        reason:
          `${path.basename(filePath)} 파일이 ${lineCount}줄로 프로젝트 상한(${MAX_LINES}줄, ${pct}%)을 초과했습니다. ` +
          `책임을 분리해서 더 작은 단위로 리팩터링한 뒤 다시 작성하세요.`,
        systemMessage: `초과: ${filePath} (${lineCount}/${MAX_LINES}줄, ${pct}%) — 리팩터링 필요`,
      })
    );
  } else if (lineCount >= warnAt) {
    console.log(
      JSON.stringify({
        systemMessage: `경고: ${filePath} 가 ${lineCount}/${MAX_LINES}줄(${pct}%)입니다. 상한에 근접했으니 분리를 고려하세요.`,
      })
    );
  }

  process.exit(0);
}

main();
