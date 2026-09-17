"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sea = require("node:sea");

// Dual-mode: inside a packaged SEA exe, assets are embedded and read via
// node:sea. In `npm start` (unpackaged dev run), fall back to reading the
// web/ folder directly so UI work (T005+) doesn't require a full exe
// rebuild for every change. See PACKAGING.md / RULES.md §7.
const WEB_DIR = path.join(__dirname, "..", "web");
const isSea = sea.isSea();

function textAsset(key) {
  return isSea
    ? sea.getAsset(key, "utf8")
    : fs.readFileSync(path.join(WEB_DIR, key), "utf8");
}

function binaryAsset(key) {
  return isSea
    ? Buffer.from(sea.getRawAsset(key))
    : fs.readFileSync(path.join(WEB_DIR, key));
}

function assetKeys() {
  return isSea
    ? sea.getAssetKeys()
    : fs
        .readdirSync(WEB_DIR)
        .filter((f) => fs.statSync(path.join(WEB_DIR, f)).isFile());
}

module.exports = { isSea, textAsset, binaryAsset, assetKeys };
