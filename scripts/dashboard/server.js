#!/usr/bin/env node
"use strict";

// Read-only live dashboard for backlog.json (no npm deps, Node builtins only).
// The browser polls GET /api/backlog; this server re-reads backlog.json and
// tasks/*.md from disk on every request so the view always matches the CLI's
// latest state. It never writes anything — mutations still go through
// scripts/backlog-cli.js so cycle/status validation stays in one place.

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const BACKLOG_PATH = path.join(ROOT, "backlog.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 4600;

const STATUS_LABELS = {
  todo: "할 일",
  in_progress: "진행중",
  review: "검토",
  blocked_decision: "결정대기",
  on_hold: "보류",
  done: "완료",
  cancelled: "취소",
};

const PHASE_LABELS = {
  "0-foundation": "기반",
  "1-core-data": "핵심 데이터",
  "2-core-input": "핵심 입력",
  "3-visualization": "시각화",
  "4-extension": "확장",
  "5-advanced": "고급",
  "6-qa": "QA",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function loadBacklog() {
  const raw = fs.readFileSync(BACKLOG_PATH, "utf8");
  return JSON.parse(raw);
}

function docContent(task) {
  const p = path.join(ROOT, task.doc);
  if (!fs.existsSync(p)) return "";
  // gen-task-docs.ps1 (Windows PowerShell 5.1) writes UTF-8 with a BOM.
  return fs.readFileSync(p, "utf8").replace(/^﻿/, "");
}

function buildPayload() {
  const data = loadBacklog();
  const byId = new Map(data.tasks.map((t) => [t.id, t]));

  const tasks = data.tasks.map((t) => {
    const deps = t.dependencies || [];
    const unmetDeps = deps.filter((d) => !byId.has(d) || byId.get(d).status !== "done");
    const dependents = data.tasks
      .filter((o) => (o.dependencies || []).includes(t.id))
      .map((o) => o.id);
    return {
      ...t,
      statusLabel: STATUS_LABELS[t.status] || t.status,
      phaseLabel: PHASE_LABELS[t.phase] || t.phase,
      readyToStart: t.status === "todo" && unmetDeps.length === 0,
      unmetDeps,
      dependents,
      docContent: docContent(t),
    };
  });

  const byStatus = {};
  const byPhase = {};
  for (const t of data.tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPhase[t.phase] = (byPhase[t.phase] || 0) + 1;
  }
  const remainingMinutes = data.tasks
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    statusOrder: Object.keys(data.status_definitions),
    phaseOrder: Object.keys(data.phase_definitions),
    statusLabels: STATUS_LABELS,
    phaseLabels: PHASE_LABELS,
    stats: {
      total: data.tasks.length,
      byStatus,
      byPhase,
      remainingMinutes,
      readyIds: tasks.filter((t) => t.readyToStart).map((t) => t.id),
    },
    tasks,
  };
}

function serveStatic(res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (pathname === "/api/backlog") {
    try {
      const payload = buildPayload();
      res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
      res.end(JSON.stringify(payload));
    } catch (e) {
      res.writeHead(500, { "Content-Type": MIME[".json"] });
      res.end(JSON.stringify({ error: String((e && e.message) || e) }));
    }
    return;
  }

  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`백로그 대시보드: http://localhost:${PORT}`);
});
