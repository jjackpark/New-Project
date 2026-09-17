#!/usr/bin/env node
"use strict";

// Full SEA packaging (manual — NOT wired to `npm run build`, see PACKAGING.md
// C3/C4: this produces a 90MB+ binary and must not run on every Stop hook).
// Usage: node scripts/package-exe.js
// Output path can be overridden with SM_BUILD_OUT (default dist/SetupManager.exe).

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const postject = require("postject");

const ROOT = path.resolve(__dirname, "..");
const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function assertNodeVersion() {
  const expected = fs.readFileSync(path.join(ROOT, ".nvmrc"), "utf8").trim();
  const actual = process.versions.node;
  if (actual !== expected) {
    console.error(
      `Node 버전 불일치: 빌드는 ${expected}, 현재는 ${actual}. ` +
        "ARCHITECTURE.md §1: 빌드 Node와 배포 Node는 반드시 같아야 합니다.",
    );
    process.exit(1);
  }
}

// Walks a directory and returns a flat { "relative/path": "absolute/path" }
// map so nobody has to hand-maintain sea-config.json's assets list (T002
// review I1: a forgotten manual entry builds green but 404s at runtime).
function collectAssets(dir, baseDir, exclude = []) {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory())
      Object.assign(out, collectAssets(abs, baseDir, exclude));
    else if (entry.isFile() && !exclude.includes(entry.name))
      out[path.relative(baseDir, abs).replace(/\\/g, "/")] = abs;
  }
  return out;
}

function warnIfSynced(p) {
  if (p.toLowerCase().includes("onedrive")) {
    console.error(
      `경고: 출력 경로가 OneDrive로 보입니다 (${p}). PACKAGING.md C4 참고 — SM_BUILD_OUT으로 다른 경로를 지정하세요.`,
    );
  }
}

async function main() {
  assertNodeVersion();

  execFileSync(process.execPath, [path.join(ROOT, "scripts", "bundle.js")], {
    stdio: "inherit",
  });

  // Keys are relative to each source dir (bare "index.html", not
  // "web/index.html") — assets.js/router.js look assets up by bare name.
  const webDir = path.join(ROOT, "web");
  const migrationsDir = path.join(ROOT, "migrations");
  const assets = {
    ...collectAssets(webDir, webDir),
    ...collectAssets(migrationsDir, migrationsDir, ["README.md"]),
  };
  const seaConfigPath = path.join(ROOT, "dist", "sea-config.generated.json");
  const blobPath = path.join(ROOT, "dist", "sea-prep.blob");
  fs.writeFileSync(
    seaConfigPath,
    JSON.stringify(
      {
        main: path.join(ROOT, "dist", "bundle.js"),
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        assets,
      },
      null,
      2,
    ),
  );

  execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
    stdio: "inherit",
  });

  const outPath =
    process.env.SM_BUILD_OUT || path.join(ROOT, "dist", "SetupManager.exe");
  warnIfSynced(outPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(process.execPath, outPath);

  await postject.inject(outPath, "NODE_SEA_BLOB", fs.readFileSync(blobPath), {
    sentinelFuse: SENTINEL_FUSE,
    overwrite: true,
  });

  const size = fs.statSync(outPath).size;
  console.log(
    `패키징 완료: ${outPath} (${(size / 1024 / 1024).toFixed(1)} MiB)`,
  );
}

main().catch((err) => {
  console.error(String((err && err.message) || err).slice(0, 2000));
  process.exit(1);
});
