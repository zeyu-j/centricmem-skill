// SessionStart hook for the CentricMem plugin: put the shelf's context in front of the model before it
// answers anything, using the same /ambient endpoint the CLI and the goose refresher use.
//
// Design rules, all learned the hard way:
//   - Never fail. A hook that exits non-zero can break somebody's session; this one always exits 0.
//   - Never block. A short timeout, and silence when there is nothing useful to say.
//   - Never guess a credential. Try the documented sources in order and give up quietly.
//   - Claude reaches the model with plain stdout for this event, so no JSON envelope is needed, and each
//     string is capped at 10,000 characters - we stay well under it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";

const LIBRARIAN = process.env.CENTRICMEM_URL || "https://mem.centricmem.com";
const LIMIT = 8000;

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function token() {
  if (process.env.CENTRICMEM_TOKEN) return process.env.CENTRICMEM_TOKEN.trim();
  if (process.env.CENTRICMEM_API_KEY) return process.env.CENTRICMEM_API_KEY.trim();
  const candidates = [
    path.join(os.homedir(), ".centricmem", "api.json"),
    path.join(process.env.APPDATA || "", "centricmem", "api.json"),
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "centricmem", "api.json"),
  ].filter((p) => p && fs.existsSync(p));
  for (const c of candidates) {
    const t = readJson(c)?.token;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "";
}

function shelf() {
  if (process.env.CENTRICMEM_SHELF) return process.env.CENTRICMEM_SHELF.trim();
  for (const p of [path.join(os.homedir(), ".centricmem", "api.json"), path.join(process.env.APPDATA || "", "centricmem", "api.json")]) {
    const lib = readJson(p)?.library;
    if (typeof lib === "string" && lib.trim()) return lib.trim();
  }
  return "";
}

function fetchAmbient(tok, lib) {
  return new Promise((resolve) => {
    const url = LIBRARIAN.replace(/\/$/, "") + "/ambient" + (lib ? "?library=" + encodeURIComponent(lib) : "");
    const req = https.get(url, { headers: { authorization: "Bearer " + tok, "user-agent": "centricmem-claude-hook" }, timeout: 6000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => resolve(r.statusCode === 200 ? d : ""));
    });
    req.on("timeout", () => { req.destroy(); resolve(""); });
    req.on("error", () => resolve(""));
  });
}

const main = async () => {
  const tok = token();
  if (!tok) return;                       // no key is normal on an OAuth-connected host
  const body = await fetchAmbient(tok, shelf());
  if (!body) return;                      // unreachable, refused, or empty: say nothing rather than something wrong
  let text = body;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.text === "string") text = parsed.text;          // /ambient answers {ok, state, text, ...}
    else if (typeof parsed?.ambient === "string") text = parsed.ambient;  // older shape
  } catch { /* some paths return markdown directly */ }
  text = text.trim();
  if (!text) return;
  process.stdout.write(text.slice(0, LIMIT) + "\n");
};

main().then(() => process.exit(0)).catch(() => process.exit(0));
