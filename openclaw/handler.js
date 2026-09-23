// OpenClaw hook handler for centricmem-ambient.
//
// Named handler.js because that is what the loader asked for when it was given handler.mjs:
//   "[openclaw] Reason: handler.ts/handler.js/index.ts/index.js missing in ..."
// Written as CommonJS because a pack directory without a package.json has no type field to make it a module.
//
// Same rules as the Claude Code plugin hook: never fail, never guess a credential, never print the wrong
// thing. See HOOK.md beside this file.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("node:https");

const LIBRARIAN = process.env.CENTRICMEM_URL || "https://mem.centricmem.com";
const LIMIT = 8000;

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

function configFiles() {
  return [
    path.join(os.homedir(), ".centricmem", "api.json"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "centricmem", "api.json") : "",
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "centricmem", "api.json"),
  ].filter((p) => p && fs.existsSync(p));
}

function credential() {
  if (process.env.CENTRICMEM_TOKEN) return process.env.CENTRICMEM_TOKEN.trim();
  if (process.env.CENTRICMEM_API_KEY) return process.env.CENTRICMEM_API_KEY.trim();
  for (const f of configFiles()) {
    const t = readJson(f) && readJson(f).token;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "";
}

function shelf() {
  if (process.env.CENTRICMEM_SHELF) return process.env.CENTRICMEM_SHELF.trim();
  for (const f of configFiles()) {
    const lib = readJson(f) && readJson(f).library;
    if (typeof lib === "string" && lib.trim()) return lib.trim();
  }
  return "";
}

function ambient(tok, lib) {
  return new Promise((resolve) => {
    const url = LIBRARIAN.replace(/\/$/, "") + "/ambient" + (lib ? "?library=" + encodeURIComponent(lib) : "");
    const req = https.get(url, { headers: { authorization: "Bearer " + tok, "user-agent": "centricmem-openclaw-hook" }, timeout: 6000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => resolve(r.statusCode === 200 ? d : ""));
    });
    req.on("timeout", () => { req.destroy(); resolve(""); });
    req.on("error", () => resolve(""));
  });
}

function textOf(body) {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.text === "string") return parsed.text;
    if (typeof parsed.ambient === "string") return parsed.ambient;
  } catch { /* some paths answer markdown directly */ }
  return body;
}

// Export a function under both shapes a loader might want. It returns the context to inject, and an empty
// string whenever there is nothing trustworthy to say.
async function centricmemAmbient() {
  try {
    const tok = credential();
    if (!tok) return { additionalContext: "" };
    const body = await ambient(tok, shelf());
    if (!body) return { additionalContext: "" };
    const t = textOf(body).trim();
    return { additionalContext: t ? t.slice(0, LIMIT) : "" };
  } catch {
    return { additionalContext: "" };
  }
}

module.exports = centricmemAmbient;
module.exports.default = centricmemAmbient;
module.exports.centricmemAmbient = centricmemAmbient;
