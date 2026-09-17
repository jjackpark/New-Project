#!/usr/bin/env node
"use strict";

// PostToolUse (Bash) hook: if backlog.json changed vs the last commit,
// auto-commit it (plus synced tasks/*.md docs). If any task's status
// transitioned to "done" in this change, also write a fuller summary
// commit and push.

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" });
}

function shSafe(cmd) {
  try {
    return { ok: true, out: sh(cmd) };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || ""), err: e };
  }
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function output(obj) {
  console.log(JSON.stringify(obj));
}

function taskMap(jsonText) {
  const data = JSON.parse(jsonText);
  const map = new Map();
  for (const t of data.tasks) map.set(t.id, t);
  return map;
}

function workNotesExcerpt(id) {
  const p = path.join(ROOT, "tasks", `${id}.md`);
  if (!fs.existsSync(p)) return "";
  const content = fs.readFileSync(p, "utf8");
  const idx = content.indexOf("## 작업 노트");
  if (idx === -1) return "";
  return content
    .slice(idx)
    .split("\n")
    .slice(2)
    .join("\n")
    .trim();
}

async function main() {
  await readStdin(); // we don't need the hook payload itself

  const inRepo = shSafe("git rev-parse --is-inside-work-tree");
  if (!inRepo.ok) {
    process.exit(0);
  }

  const diffCheck = shSafe("git diff --name-only HEAD -- backlog.json");
  if (!diffCheck.ok || !diffCheck.out.trim()) {
    process.exit(0); // nothing changed
  }

  const oldTextRes = shSafe("git show HEAD:backlog.json");
  const oldText = oldTextRes.ok ? oldTextRes.out : "{\"tasks\":[]}";
  const newText = fs.readFileSync(path.join(ROOT, "backlog.json"), "utf8");

  let oldMap, newMap;
  try {
    oldMap = taskMap(oldText);
    newMap = taskMap(newText);
  } catch (e) {
    output({ systemMessage: "backlog-commit 훅: JSON 파싱 실패, 커밋을 건너뜁니다 (" + e.message + ")" });
    process.exit(0);
  }

  const changed = [];
  const newlyDone = [];
  for (const [id, t] of newMap) {
    const before = oldMap.get(id);
    if (!before) {
      changed.push({ id, from: null, to: t.status });
      if (t.status === "done") newlyDone.push(t);
    } else if (before.status !== t.status) {
      changed.push({ id, from: before.status, to: t.status });
      if (before.status !== "done" && t.status === "done") newlyDone.push(t);
    }
  }

  if (changed.length === 0) {
    // backlog.json changed but not via status (title/desc/deps edit etc.)
    shSafe("git add backlog.json tasks");
    const staged = shSafe("git diff --cached --name-only");
    if (staged.ok && staged.out.trim()) {
      const commitMsg = "chore(backlog): update task fields via CLI";
      const res = shSafe(`git commit -m "${commitMsg}"`);
      output({
        systemMessage: res.ok
          ? "backlog.json 변경 감지 → 커밋 완료: " + commitMsg
          : "backlog.json 변경 감지했지만 커밋 실패: " + res.out.slice(0, 300),
      });
    }
    process.exit(0);
  }

  shSafe("git add backlog.json tasks");

  if (newlyDone.length === 0) {
    const summary = changed.map((c) => `${c.id} (${c.from ?? "new"} -> ${c.to})`).join(", ");
    const commitMsg = `chore(backlog): status update - ${summary}`;
    const res = shSafe(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
    output({
      systemMessage: res.ok
        ? "backlog.json 상태 변경 → 커밋 완료: " + summary
        : "backlog.json 상태 변경 감지했지만 커밋 실패: " + res.out.slice(0, 300),
    });
    process.exit(0);
  }

  // one or more tasks moved to "done" -> full summary commit + push
  const lines = [];
  lines.push(`feat(task): ${newlyDone.map((t) => t.id).join(", ")} 완료 처리`);
  lines.push("");
  lines.push("완료된 작업:");
  for (const t of newlyDone) {
    lines.push(`- ${t.id} [${t.phase}] ${t.title}`);
    lines.push(`  ${t.description}`);
    const notes = workNotesExcerpt(t.id);
    if (notes) {
      lines.push("  작업 노트:");
      for (const l of notes.split("\n")) lines.push("  " + l);
    }
  }
  const otherChanged = changed.filter((c) => !newlyDone.some((t) => t.id === c.id));
  if (otherChanged.length) {
    lines.push("");
    lines.push("그 외 상태 변경:");
    for (const c of otherChanged) lines.push(`- ${c.id}: ${c.from ?? "new"} -> ${c.to}`);
  }

  const commitFile = path.join(ROOT, ".git", "BACKLOG_COMMIT_MSG.txt");
  fs.writeFileSync(commitFile, lines.join("\n"), "utf8");
  const commitRes = shSafe(`git commit -F "${commitFile}"`);
  fs.unlinkSync(commitFile);

  if (!commitRes.ok) {
    output({ systemMessage: "완료 처리 커밋 실패: " + commitRes.out.slice(0, 300) });
    process.exit(0);
  }

  let pushRes = shSafe("git push");
  if (!pushRes.ok) {
    const branch = shSafe("git branch --show-current");
    const branchName = branch.ok ? branch.out.trim() : "HEAD";
    pushRes = shSafe(`git push -u origin ${branchName}`);
  }

  output({
    systemMessage: pushRes.ok
      ? `작업 완료(done) 커밋 및 push 완료: ${newlyDone.map((t) => t.id).join(", ")}`
      : `커밋은 완료했지만 push 실패 (원격 미설정 또는 네트워크 문제): ${pushRes.out.slice(0, 300)}`,
  });
  process.exit(0);
}

main();
