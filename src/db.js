"use strict";
const { DatabaseSync } = require("node:sqlite");

// ARCHITECTURE.md §4 — PRAGMAs fixed here, verified end-to-end (including
// forced-kill recovery) in T007's spike (PACKAGING.md).
function openDb(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA busy_timeout=5000");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("PRAGMA synchronous=NORMAL");
  return db;
}

module.exports = { openDb };
