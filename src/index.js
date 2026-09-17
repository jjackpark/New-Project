"use strict";
const http = require("node:http");
const { openDb } = require("./db.js");
const { ensureDataDirs, DB_PATH } = require("./paths.js");
const router = require("./router.js");
const assets = require("./assets.js");

// Fail fast at startup, not on first request — catches a forgotten/misnamed
// asset (T002 review I1) before a user ever sees a 404.
const REQUIRED_ASSETS = ["index.html", "logo.png"];
const missing = REQUIRED_ASSETS.filter((k) => !assets.assetKeys().includes(k));
if (missing.length) {
  console.error(
    `필수 자산 누락: ${missing.join(", ")} (sea-config 생성 로직 확인)`,
  );
  process.exit(1);
}

ensureDataDirs();
const db = openDb(DB_PATH);
void db; // wired up for T003+ to use; scaffolding just proves it opens cleanly

const PORT = Number(process.env.SM_PORT) || 47800;
const server = http.createServer(router.handle);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    // ARCHITECTURE.md §9: single-instance guard — don't let a second launch
    // fight the first one over the same SQLite file.
    console.error(
      `Setup Manager가 이미 포트 ${PORT}에서 실행 중입니다. 기존 창을 사용하세요.`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SERVER_READY pid=${process.pid} port=${PORT}`);
});
