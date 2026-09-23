import { credential } from "../tools/ambient.mjs";
// SessionEnd / close hook: file the unit that just finished, the way Cursor's installed hooks do.
//
// Cursor has had this pair all along (sessionStart -> `centricmem ambient --write`, sessionEnd ->
// `centricmem log-session --auto`). This is the same second half for the clients whose lifecycle events
// include SessionEnd: Claude Code and Codex both do, and Codex's own documentation puts it as "when the main
// thread ends, doesn't run for subagents" - once per session, not once per turn.
//
// Rules, same as the ambient hooks: never fail, and say nothing when there is nothing to say. A close hook
// that exits non-zero can break somebody's session end, and one that runs on every turn would file a card
// per turn, which is why Stop is deliberately not used here.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TIMEOUT_MS = 20000;

const hasCredential = () => {
  // The same sources the ambient half uses: env names (CENTRICMEM_TOKEN, CENTRICMEM_AGENT_KEY,
  // CENTRICMEM_API_KEY) and the api.json files. One definition, so a name added for one host is not
  // silently missing from the other - which is exactly how this check lagged behind.
  if (credential().token) return true;
  const candidates = [
    path.join(os.homedir(), ".centricmem", "api.json"),
    process.env.APPDATA ? path.join(process.env.APPDATA, "centricmem", "api.json") : "",
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "centricmem", "api.json"),
  ];
  return candidates.some((p) => {
    try {
      if (!p || !fs.existsSync(p)) return false;
      const t = JSON.parse(fs.readFileSync(p, "utf8")).token;
      return typeof t === "string" && t.trim() !== "";
    } catch { return false; }
  });
};

const run = (args) => new Promise((resolve) => {
  let child;
  try {
    // On Windows the CLI arrives as a .cmd shim, and a .cmd spawned with shell:false throws EINVAL -
    // which the catch below swallows, so the hook looked silent and healthy while doing nothing (seen
    // on dsh and on Claude Code). shell on Windows only, with a fixed argument list.
    const exe = process.platform === "win32" ? "centricmem.cmd" : "centricmem";
    child = spawn(exe, args, { stdio: "ignore", shell: process.platform === "win32", windowsHide: true });
  } catch { return resolve(false); }
  const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve(false); }, TIMEOUT_MS);
  child.on("error", () => { clearTimeout(timer); resolve(false); });
  child.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
});

try {
  // No key means no session to file, and looking for one in a hook would be guessing.
  if (hasCredential()) await run(["log-session", "--auto"]);
} catch {
  // never fail somebody else's session
}
process.exit(0);
