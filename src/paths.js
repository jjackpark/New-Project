"use strict";
const path = require("node:path");
const fs = require("node:fs");

// ARCHITECTURE.md §5: data/photos live under a per-user, non-synced local
// path, never a repo-relative one (this repo itself sits under OneDrive).
const DATA_DIR =
  process.env.SM_DATA_DIR ||
  path.join(process.env.LOCALAPPDATA || ".", "SetupManager");
const DB_PATH = path.join(DATA_DIR, "app.db");
const PHOTOS_DIR = path.join(DATA_DIR, "photos");

const SYNCED_FOLDER_MARKERS = ["onedrive", "dropbox", "google drive", "icloud"];

function warnIfSyncedFolder(dir) {
  const lower = dir.toLowerCase();
  const hit = SYNCED_FOLDER_MARKERS.find((m) => lower.includes(m));
  if (hit) {
    console.error(
      `WARNING: data dir "${dir}" looks like it is inside a synced folder (${hit}). ` +
        "This can corrupt the SQLite WAL files. Set SM_DATA_DIR to a local, non-synced path.",
    );
  }
}

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  warnIfSyncedFolder(DATA_DIR);
}

module.exports = { DATA_DIR, DB_PATH, PHOTOS_DIR, ensureDataDirs };
