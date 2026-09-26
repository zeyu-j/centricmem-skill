// Hermes shell hook: hand the shelf's context to the model, and file the session when it ends.
//
// Hermes pipes a JSON payload to stdin and reads stdout back. `pre_llm_call` is the one event whose output is
// injected into the next turn, so this is the ambient; `on_session_end` is an observer, so the close just runs
// and says nothing. Both behaviours are the same ones the other hosts get, in Hermes's own shape.
//
// The reply is JSON, not prose. Hermes parses stdout through `_parse_context` (agent/shell_hooks.py): it reads a
// single `context` string and discards every non-object payload, so a bare string is dropped with
// "parsed: <none>" and the ambient never reaches the model. Hence {"context": ...} below.
//
// Two rules carried over from the other wrappers: never fail (a hook that exits non-zero can disturb somebody's
// session), and say nothing when there is nothing to say (no credential means no context, not a guess).
//
// A TTL cache sits in front of the fetch because this hook is on the hot path - it fires for every turn - and
// the shelf does not change fast enough to justify a request per turn.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";
import { credential as sharedCredential, dontLog, hooksDisabled } from "../tools/ambient.mjs";

const DEFAULT_LIBRARIAN = "https://mem.centricmem.com";
const DEFAULT_TTL_MS = 60000;
const TIMEOUT_MS = 6000;

// The credential and its sources live in ../tools/ambient.mjs: one definition, so an env name or a config
// location added for one host is not silently missing from another. This host wanted the bare token, so the
// call sites keep that shape. Two things widen as a result - CENTRICMEM_AGENT_KEY, and the Bearer a host
// already recorded in its own MCP config - which is the point: the same machine answers the same way on
// every host. Precedence is the shared one (TOKEN, AGENT_KEY, API_KEY, host config, api.json).
const credential = () => sharedCredential().token;

const cacheFile = path.join(os.tmpdir(), "centricmem-hermes-ambient.json");

const cached = () => {
  try {
    const { at, text } = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    if (typeof text === "string" && Date.now() - at < DEFAULT_TTL_MS) return text;
  } catch { /* no cache */ }
  return "";
};

const get = (url, token) => new Promise((resolve) => {
  const lib = url.startsWith("https:") ? https : http;
  const req = lib.get(url + "/ambient", { headers: { authorization: "Bearer " + token, accept: "application/json" }, timeout: TIMEOUT_MS }, (r) => {
    if (r.statusCode !== 200) { r.resume(); return resolve(""); }
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => {
      try {
        const j = JSON.parse(d);
        resolve(typeof j.text === "string" ? j.text : typeof j.ambient === "string" ? j.ambient : "");
      } catch { resolve(""); }
    });
  });
  req.on("error", () => resolve(""));
  req.on("timeout", () => { req.destroy(); resolve(""); });
});

const readStdin = () => new Promise((resolve) => {
  let d = "";
  if (process.stdin.isTTY) return resolve("");
  process.stdin.on("data", (c) => { d += c; if (d.length > 200000) process.stdin.destroy(); });
  process.stdin.on("end", () => resolve(d));
  process.stdin.on("error", () => resolve(""));
  setTimeout(() => resolve(d), 1500);
});

const main = async () => {
  let payload = {};
  try { payload = JSON.parse(await readStdin() || "{}"); } catch { payload = {}; }
  const event = payload.hook_event_name || process.argv[2] || "";

  // the close side: same command the other hosts use, silent where it cannot write, and honouring the same
  // switches the shared close hook does - a user who sets one expects the same answer on every host.
  if (event === "on_session_end") {
    if (!hooksDisabled() && !dontLog() && credential()) {
      const { spawn } = await import("node:child_process");
      const exe = process.platform === "win32" ? "centricmem.cmd" : "centricmem";
      try {
        const child = spawn(exe, ["log-session", "--auto"], { stdio: "ignore", windowsHide: true });
        await new Promise((res) => { const t = setTimeout(() => { try { child.kill(); } catch { /* gone */ } res(); }, 20000); child.on("exit", () => { clearTimeout(t); res(); }); child.on("error", () => { clearTimeout(t); res(); }); });
      } catch { /* never fail */ }
    }
    return;
  }

  // the ambient side
  const token = credential();
  if (!token) { process.exit(0); }
  let text = cached();
  if (!text) {
    const librarian = (process.env.CENTRICMEM_URL || DEFAULT_LIBRARIAN).replace(/\/+$/, "");
    text = await get(librarian, token);
    if (text) { try { fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), text }), "utf8"); } catch { /* cache is optional */ } }
  }
  if (text) process.stdout.write(JSON.stringify({ context: text }));
};

try { await main(); } catch { /* a hook never fails loudly */ }
process.exit(0);
