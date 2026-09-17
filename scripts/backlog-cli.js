#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BACKLOG_PATH = path.join(ROOT, "backlog.json");

// ---------- io helpers ----------

function loadBacklog() {
  const raw = fs.readFileSync(BACKLOG_PATH, "utf8");
  return JSON.parse(raw);
}

function saveBacklog(data) {
  fs.writeFileSync(BACKLOG_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- arg parsing ----------

// splits argv into { _: [positional], flags: { name: value|true } }
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        out.flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          out.flags[a.slice(2)] = next;
          i++;
        } else {
          out.flags[a.slice(2)] = true;
        }
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function csv(value) {
  if (value === undefined || value === true) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- validation helpers ----------

function findTask(data, id) {
  return data.tasks.find((t) => t.id === id);
}

function requireTask(data, id) {
  const t = findTask(data, id);
  if (!t) {
    fail(`작업 ID를 찾을 수 없습니다: ${id}`);
  }
  return t;
}

function assertValidStatus(data, status) {
  if (!Object.prototype.hasOwnProperty.call(data.status_definitions, status)) {
    const allowed = Object.keys(data.status_definitions).join(", ");
    fail(`유효하지 않은 status "${status}". 허용값: ${allowed}`);
  }
}

function assertValidPhase(data, phase) {
  if (!Object.prototype.hasOwnProperty.call(data.phase_definitions, phase)) {
    const allowed = Object.keys(data.phase_definitions).join(", ");
    fail(`유효하지 않은 phase "${phase}". 허용값: ${allowed}`);
  }
}

function assertDepsExist(data, deps, selfId) {
  for (const d of deps) {
    if (d === selfId) fail(`작업이 자기 자신을 dependency로 가질 수 없습니다: ${d}`);
    if (!findTask(data, d)) fail(`존재하지 않는 dependency ID: ${d}`);
  }
}

function detectCycle(data) {
  const graph = new Map(data.tasks.map((t) => [t.id, t.dependencies || []]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(data.tasks.map((t) => [t.id, WHITE]));
  const stack = [];

  function visit(id) {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of graph.get(id) || []) {
      if (!graph.has(dep)) continue; // reported separately by assertDepsExist/validate
      if (color.get(dep) === GRAY) {
        const cycleStart = stack.indexOf(dep);
        return stack.slice(cycleStart).concat(dep);
      }
      if (color.get(dep) === WHITE) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const id of graph.keys()) {
    if (color.get(id) === WHITE) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

function nextId(data) {
  let max = 0;
  for (const t of data.tasks) {
    const m = /^T(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const n = max + 1;
  return "T" + String(n).padStart(3, "0");
}

function fail(msg) {
  console.error("오류: " + msg);
  process.exit(1);
}

// ---------- doc sync ----------

function docPath(task) {
  return path.join(ROOT, task.doc);
}

function metaBlock(data, task) {
  const deps = (task.dependencies || []).length ? task.dependencies.join(", ") : "없음";
  const tags = (task.tags || []).length ? task.tags.join(", ") : "-";
  return [
    `# ${task.id} - ${task.title}`,
    "",
    `- **phase**: ${task.phase}`,
    `- **priority**: ${task.priority}`,
    `- **status**: ${task.status}`,
    `- **estimated_minutes**: ${task.estimated_minutes}`,
    `- **dependencies**: ${deps}`,
    `- **tags**: ${tags}`,
    "",
    "## 설명",
    "",
    task.description,
    "",
  ].join("\n");
}

function tailBlock(task) {
  return [
    "## 참고",
    "",
    "- 원본 스펙: SPEC.md",
    `- 관련 작업 목록: backlog.json (id: ${task.id})`,
    "",
    "## 작업 노트",
    "",
    "_(진행하면서 결정사항, 이슈, 리뷰 코멘트를 이 아래에 기록)_",
    "",
  ].join("\n");
}

// Regenerates the header/description part of a task doc, preserving
// everything from "## 참고" onward (so manual work notes survive updates).
function syncDoc(data, task) {
  const p = docPath(task);
  let tail = tailBlock(task);
  if (fs.existsSync(p)) {
    const existing = fs.readFileSync(p, "utf8");
    const idx = existing.indexOf("## 참고");
    if (idx !== -1) {
      tail = existing.slice(idx);
    }
  } else {
    fs.mkdirSync(path.dirname(p), { recursive: true });
  }
  fs.writeFileSync(p, metaBlock(data, task) + "\n" + tail, "utf8");
}

// ---------- commands ----------

function cmdList(data, args) {
  let tasks = data.tasks.slice();
  const f = args.flags;
  if (f.status) tasks = tasks.filter((t) => t.status === f.status);
  if (f.phase) tasks = tasks.filter((t) => t.phase === f.phase);
  if (f.priority) tasks = tasks.filter((t) => String(t.priority) === String(f.priority));
  if (f.tag) tasks = tasks.filter((t) => (t.tags || []).includes(f.tag));
  if (f.ready) {
    tasks = tasks.filter(
      (t) => t.status === "todo" && (t.dependencies || []).every((d) => findTask(data, d) && findTask(data, d).status === "done")
    );
  }
  if (f.blocked) {
    tasks = tasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled" &&
        (t.dependencies || []).some((d) => !findTask(data, d) || findTask(data, d).status !== "done")
    );
  }

  if (f.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  if (tasks.length === 0) {
    console.log("(조건에 맞는 작업이 없습니다)");
    return;
  }

  const rows = tasks.map((t) => ({
    id: t.id,
    status: t.status,
    phase: t.phase,
    priority: String(t.priority),
    title: t.title,
  }));
  printTable(rows, ["id", "status", "phase", "priority", "title"]);
  console.log(`\n총 ${tasks.length}건`);
}

// Hangul/CJK/fullwidth characters render ~2 columns wide in a terminal;
// String.length counts them as 1, which breaks table alignment.
function displayWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
      (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals ~ Yi
      (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK compat ideographs
      (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
      (cp >= 0xffe0 && cp <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

function padDisplay(str, width) {
  const pad = Math.max(0, width - displayWidth(str));
  return str + " ".repeat(pad);
}

function printTable(rows, cols) {
  const widths = {};
  for (const c of cols) {
    widths[c] = Math.max(displayWidth(c), ...rows.map((r) => displayWidth(String(r[c]))));
  }
  const header = cols.map((c) => padDisplay(c, widths[c])).join("  ");
  console.log(header);
  console.log(cols.map((c) => "-".repeat(widths[c])).join("  "));
  for (const r of rows) {
    console.log(cols.map((c) => padDisplay(String(r[c]), widths[c])).join("  "));
  }
}

function cmdShow(data, args) {
  const id = args._[0];
  if (!id) fail("사용법: show <id>");
  const t = requireTask(data, id);

  if (args.flags.json) {
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  console.log(`${t.id} - ${t.title}`);
  console.log(`  phase: ${t.phase} | priority: ${t.priority} | status: ${t.status} | 예상소요: ${t.estimated_minutes}분`);
  console.log(`  tags: ${(t.tags || []).join(", ") || "-"}`);
  console.log(`  doc: ${t.doc}`);
  if (t.created_at) console.log(`  created_at: ${t.created_at}`);
  if (t.updated_at) console.log(`  updated_at: ${t.updated_at}`);
  console.log("");
  console.log(t.description);

  const deps = t.dependencies || [];
  console.log("");
  console.log(`의존성 (${deps.length}건):`);
  if (deps.length === 0) console.log("  없음");
  for (const d of deps) {
    const dep = findTask(data, d);
    console.log(`  - ${d} [${dep ? dep.status : "??? 존재하지 않음"}] ${dep ? dep.title : ""}`);
  }

  const blockers = data.tasks.filter((other) => (other.dependencies || []).includes(t.id));
  console.log("");
  console.log(`이 작업에 의존하는 작업 (${blockers.length}건):`);
  if (blockers.length === 0) console.log("  없음");
  for (const b of blockers) {
    console.log(`  - ${b.id} [${b.status}] ${b.title}`);
  }

  const p = docPath(t);
  if (fs.existsSync(p)) {
    console.log("");
    console.log(`--- ${t.doc} ---`);
    console.log(fs.readFileSync(p, "utf8"));
  }
}

function cmdAdd(data, args) {
  const f = args.flags;
  if (!f.title) fail("사용법: add --title \"제목\" [--description ...] [--phase ...] [--priority ...] [--status ...] [--deps T001,T002] [--tags a,b] [--estimated-minutes 30] [--id T099]");

  const id = f.id || nextId(data);
  if (findTask(data, id)) fail(`이미 존재하는 ID입니다: ${id}`);

  const phase = f.phase || "0-foundation";
  assertValidPhase(data, phase);
  const status = f.status || "todo";
  assertValidStatus(data, status);
  const deps = csv(f.deps);
  assertDepsExist(data, deps, id);

  const task = {
    id,
    title: f.title,
    description: f.description || "",
    doc: `tasks/${id}.md`,
    phase,
    priority: f.priority !== undefined ? (isNaN(f.priority) ? f.priority : Number(f.priority)) : null,
    status,
    estimated_minutes: f["estimated-minutes"] !== undefined ? Number(f["estimated-minutes"]) : 30,
    dependencies: deps,
    tags: csv(f.tags),
    created_at: todayISO(),
    updated_at: todayISO(),
  };

  data.tasks.push(task);

  const cyc = detectCycle(data);
  if (cyc) fail(`순환 의존성이 발생합니다: ${cyc.join(" -> ")}`);

  saveBacklog(data);
  syncDoc(data, task);
  console.log(`추가됨: ${task.id} - ${task.title}`);
  console.log(`문서 생성: ${task.doc}`);
}

function cmdUpdate(data, args) {
  const id = args._[0];
  if (!id) fail("사용법: update <id> [--title ...] [--description ...] [--phase ...] [--priority ...] [--status ...] [--estimated-minutes N] [--add-dep ID] [--remove-dep ID] [--set-deps a,b] [--add-tag t] [--remove-tag t] [--set-tags a,b]");
  const t = requireTask(data, id);
  const f = args.flags;
  let changed = false;

  if (f.title !== undefined) { t.title = f.title; changed = true; }
  if (f.description !== undefined) { t.description = f.description; changed = true; }
  if (f.phase !== undefined) { assertValidPhase(data, f.phase); t.phase = f.phase; changed = true; }
  if (f.priority !== undefined) { t.priority = isNaN(f.priority) ? f.priority : Number(f.priority); changed = true; }
  if (f.status !== undefined) { assertValidStatus(data, f.status); t.status = f.status; changed = true; }
  if (f["estimated-minutes"] !== undefined) { t.estimated_minutes = Number(f["estimated-minutes"]); changed = true; }

  if (f["set-deps"] !== undefined) {
    const deps = csv(f["set-deps"]);
    assertDepsExist(data, deps, id);
    t.dependencies = deps;
    changed = true;
  }
  if (f["add-dep"] !== undefined) {
    assertDepsExist(data, [f["add-dep"]], id);
    t.dependencies = t.dependencies || [];
    if (!t.dependencies.includes(f["add-dep"])) t.dependencies.push(f["add-dep"]);
    changed = true;
  }
  if (f["remove-dep"] !== undefined) {
    t.dependencies = (t.dependencies || []).filter((d) => d !== f["remove-dep"]);
    changed = true;
  }

  if (f["set-tags"] !== undefined) { t.tags = csv(f["set-tags"]); changed = true; }
  if (f["add-tag"] !== undefined) {
    t.tags = t.tags || [];
    if (!t.tags.includes(f["add-tag"])) t.tags.push(f["add-tag"]);
    changed = true;
  }
  if (f["remove-tag"] !== undefined) {
    t.tags = (t.tags || []).filter((tag) => tag !== f["remove-tag"]);
    changed = true;
  }

  if (!changed) fail("변경할 필드를 하나 이상 지정하세요 (예: --status, --title, --add-dep ...)");

  const cyc = detectCycle(data);
  if (cyc) fail(`순환 의존성이 발생합니다: ${cyc.join(" -> ")}`);

  t.updated_at = todayISO();
  saveBacklog(data);
  syncDoc(data, t);
  console.log(`수정됨: ${t.id} - ${t.title} (status: ${t.status})`);
}

function cmdStatus(data, args) {
  const [id, status] = args._;
  if (!id || !status) fail("사용법: status <id> <새상태>");
  return cmdUpdate(data, { _: [id], flags: { status } });
}

function cmdStats(data) {
  const byStatus = {};
  const byPhase = {};
  for (const t of data.tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPhase[t.phase] = (byPhase[t.phase] || 0) + 1;
  }
  console.log("상태별:");
  for (const s of Object.keys(data.status_definitions)) {
    console.log(`  ${s.padEnd(18)} ${byStatus[s] || 0}`);
  }
  console.log("\n단계별:");
  for (const p of Object.keys(data.phase_definitions)) {
    console.log(`  ${p.padEnd(18)} ${byPhase[p] || 0}`);
  }
  const totalMinutes = data.tasks
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
  console.log(`\n남은 예상 작업시간: ${totalMinutes}분 (${(totalMinutes / 60).toFixed(1)}시간)`);

  const ready = data.tasks.filter(
    (t) => t.status === "todo" && (t.dependencies || []).every((d) => findTask(data, d) && findTask(data, d).status === "done")
  );
  console.log(`\n바로 시작 가능한 작업 (${ready.length}건): ${ready.map((t) => t.id).join(", ") || "없음"}`);
}

function cmdValidate(data) {
  const problems = [];
  const seenIds = new Set();
  for (const t of data.tasks) {
    if (seenIds.has(t.id)) problems.push(`중복 ID: ${t.id}`);
    seenIds.add(t.id);

    if (!Object.prototype.hasOwnProperty.call(data.status_definitions, t.status)) {
      problems.push(`${t.id}: 잘못된 status "${t.status}"`);
    }
    if (!Object.prototype.hasOwnProperty.call(data.phase_definitions, t.phase)) {
      problems.push(`${t.id}: 잘못된 phase "${t.phase}"`);
    }
    for (const d of t.dependencies || []) {
      if (!findTask(data, d)) problems.push(`${t.id}: 존재하지 않는 dependency "${d}"`);
    }
    if (t.doc !== `tasks/${t.id}.md`) {
      problems.push(`${t.id}: doc 경로 규칙 위반 (${t.doc})`);
    }
    if (!fs.existsSync(path.join(ROOT, t.doc))) {
      problems.push(`${t.id}: 문서 파일 없음 (${t.doc})`);
    }
  }
  const cyc = detectCycle(data);
  if (cyc) problems.push(`순환 의존성: ${cyc.join(" -> ")}`);

  if (problems.length === 0) {
    console.log(`검증 통과 (${data.tasks.length}개 작업, 이상 없음)`);
  } else {
    console.log(`문제 ${problems.length}건 발견:`);
    for (const p of problems) console.log("  - " + p);
    process.exitCode = 1;
  }
}

function cmdHelp() {
  console.log(`backlog-cli — backlog.json 조회/수정/추가 도구

사용법: node scripts/backlog-cli.js <command> [옵션]

조회:
  list                       모든 작업 목록 (표)
    --status <s>             상태로 필터
    --phase <p>              단계로 필터
    --priority <n>           우선순위로 필터
    --tag <t>                태그로 필터
    --ready                  바로 시작 가능한 todo만 (의존성 모두 done)
    --blocked                의존성이 안 끝나 막혀 있는 작업만
    --json                   JSON으로 출력
  show <id>                  작업 상세 + 의존관계 + 문서 내용 출력
    --json
  stats                      상태별/단계별 집계, 잔여 작업시간, 시작 가능 작업
  validate                   ID 중복/미존재 dependency/순환참조/문서 누락 검사

수정:
  update <id> [필드...]      필드 변경 (지정한 것만 반영)
    --title, --description, --phase, --priority, --status, --estimated-minutes
    --add-dep <id> / --remove-dep <id> / --set-deps a,b,c
    --add-tag <t> / --remove-tag <t> / --set-tags a,b
  status <id> <새상태>       update --status의 축약형

추가:
  add --title "..." [옵션]
    --description, --phase, --priority, --status, --estimated-minutes
    --deps a,b  --tags x,y  --id T099(생략 시 자동 채번)

예시:
  node scripts/backlog-cli.js list --status todo --phase 2-core-input
  node scripts/backlog-cli.js show T038
  node scripts/backlog-cli.js status T010 in_progress
  node scripts/backlog-cli.js update T014 --add-dep T099 --add-tag urgent
  node scripts/backlog-cli.js add --title "webhook 재시도 로직" --phase 2-core-input --deps T037
  node scripts/backlog-cli.js stats
  node scripts/backlog-cli.js validate
`);
}

// ---------- main ----------

function main() {
  const [, , command, ...rest] = process.argv;
  const args = parseArgs(rest);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    cmdHelp();
    return;
  }

  const data = loadBacklog();

  switch (command) {
    case "list": return cmdList(data, args);
    case "show": return cmdShow(data, args);
    case "add": return cmdAdd(data, args);
    case "update": return cmdUpdate(data, args);
    case "status": return cmdStatus(data, args);
    case "stats": return cmdStats(data);
    case "validate": return cmdValidate(data);
    default:
      fail(`알 수 없는 명령: ${command} (도움말: node scripts/backlog-cli.js help)`);
  }
}

main();
