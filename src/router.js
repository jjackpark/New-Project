"use strict";
const assets = require("./assets.js");

// Minimal middleware chain so T004 (auth/session/CSRF, ARCHITECTURE §6) and
// T005 (real routes) can slot in without router.js growing past the 300-line
// limit (RULES.md §5) in one place.
const middlewares = [];
function use(fn) {
  middlewares.push(fn);
}

function runMiddlewares(req, res, done) {
  let i = 0;
  function next() {
    if (i >= middlewares.length) return done();
    const mw = middlewares[i++];
    mw(req, res, next);
  }
  next();
}

function handle(req, res) {
  runMiddlewares(req, res, () => {
    if (req.url === "/logo.png") {
      const buf = assets.binaryAsset("logo.png");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": buf.length,
      });
      res.end(buf);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(assets.textAsset("index.html"));
  });
}

module.exports = { use, handle };
