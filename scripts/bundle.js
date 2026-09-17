#!/usr/bin/env node
"use strict";

// Fast step — this is what `npm run build` calls, so it runs on every Stop
// hook (RULES.md §5). It must stay sub-second and must NOT touch the 92MB+
// SEA exe (that's scripts/package-exe.js, run manually). See PACKAGING.md
// C3/C4 for why the two are kept separate.

const esbuild = require("esbuild");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const [major] = process.versions.node.split(".").map(Number);
if (major < 24) {
  console.error(
    `Node ${process.versions.node} 감지. ARCHITECTURE.md §1은 Node 24.x LTS를 요구합니다.`,
  );
  process.exit(1);
}

esbuild
  .build({
    entryPoints: [path.join(ROOT, "src", "index.js")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["node:sqlite", "node:sea"],
    outfile: path.join(ROOT, "dist", "bundle.js"),
    logLevel: "warning",
  })
  .then(() => {
    console.log("bundle OK -> dist/bundle.js");
  })
  .catch((err) => {
    console.error(
      String(err && err.message ? err.message : err).slice(0, 2000),
    );
    process.exit(1);
  });
