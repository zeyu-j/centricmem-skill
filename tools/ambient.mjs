// The one implementation of "fetch this shelf's ambient context", shared by every host we support.
//
// Before this file there were three near-copies: a PowerShell script for goose, an ESM hook for Claude Code
// and a CommonJS handler for OpenClaw. Identical logic written three times is three places for it to drift,
// and only one of them ran outside Windows. Hosts differ in how they want to receive the text; they do not
// differ in where a credential lives or what the endpoint answers.
//
// Rules, from the two implementations this replaces:
//   - Never throw. Callers get a result object; a failure is an empty text, never an exception.
//   - Never guess a credential. Env first, then the CLI's own config file, in the three locations the CLI
//     itself uses on Windows, macOS and Linux.
//   - Never print the wrong thing. /ambient answers {ok, state, text, ...}; the text is what goes out.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import https from "node:https";
import http from "node:http";

export const DEFAULT_LIBRARIAN = "https://mem.centricmem.com";
export const TEXT_LIMIT = 8000;

/** The places the CLI keeps its state, in the order it looks: home, Windows, XDG. */
export function configFiles() {
  const home = os.homedir();
  const out = [
    path.join(home, ".centricmem", "api.json"),
  ];
  if (process.env.APPDATA) out.push(path.join(process.env.APPDATA, "centricmem", "api.json"));
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  out.push(path.join(xdg, "centricmem", "api.json"));
  return out.filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** Where the credential comes from, and what that source is called - the goose refresher reports it. */
export /**
 * The Bearer an agent host recorded for this server, from its own MCP config.
 *
 * On a guest machine this is where the credential actually is. The CLI reads it this way round -
 * env, then the claimed host config, then api.json - and api.json sits last on purpose, because it is
 * often a stale hub key. These hooks only ever read api.json, which is why they stayed silent on a
 * machine that had a perfectly good key in ~/.cursor/mcp.json all along. Same order here now.
 */
function claimedBearer() {
  const home = os.homedir();
  const candidates = [
    [path.join(home, ".cursor", "mcp.json"), "json"],
    [path.join(home, ".claude.json"), "json"],
    [path.join(process.env.APPDATA || "", "Cursor", "User", "mcp.json"), "json"],
    [path.join(home, ".codex", "config.toml"), "toml"],
  ];
  for (const [file, kind] of candidates) {
    if (!file || !file.trim()) continue;
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    try {
      if (kind === "json") {
        const parsed = JSON.parse(text);
        const servers = { ...(parsed.mcpServers || {}), ...(parsed.mcp?.servers || {}) };
        const headers = servers.centricmem?.headers || {};
        const raw = headers.Authorization || headers.authorization || "";
        const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
        if (m) return { token: m[1].trim(), source: file };
      } else {
        const block = /\[mcp_servers\.centricmem[\s\S]*?(?=\n\[|$)/.exec(text);
        const m = block && /Authorization\s*=\s*["\']Bearer\s+([^"\']+)["\']/i.exec(block[0]);
        if (m) return { token: m[1].trim(), source: file };
      }
    } catch {
      /* unreadable config is not an error here */
    }
  }
  return { token: "", source: "" };
}

export function credential() {
  if (process.env.CENTRICMEM_TOKEN) return { token: process.env.CENTRICMEM_TOKEN.trim(), source: "env:CENTRICMEM_TOKEN" };
  if (process.env.CENTRICMEM_AGENT_KEY) return { token: process.env.CENTRICMEM_AGENT_KEY.trim(), source: "env:CENTRICMEM_AGENT_KEY" };
  if (process.env.CENTRICMEM_API_KEY) return { token: process.env.CENTRICMEM_API_KEY.trim(), source: "env:CENTRICMEM_API_KEY" };
  const claimed = claimedBearer();
  if (claimed.token) return claimed;
  for (const f of configFiles()) {
    const t = readJson(f)?.token;
    if (typeof t === "string" && t.trim()) return { token: t.trim(), source: f };
  }
  return { token: "", source: "" };
}

/** The shelf to ask about: explicitly named, else whatever the CLI last used. */
export function shelf() {
  if (process.env.CENTRICMEM_SHELF) return process.env.CENTRICMEM_SHELF.trim();
  for (const f of configFiles()) {
    const lib = readJson(f)?.library;
    if (typeof lib === "string" && lib.trim()) return lib.trim();
  }
  return "";
}

export function librarian() {
  return (process.env.CENTRICMEM_URL || DEFAULT_LIBRARIAN).replace(/\/$/, "");
}

/** Pull the text out of whatever shape the endpoint answered in. */
export function textOf(body) {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.text === "string") return parsed.text;
    if (typeof parsed?.ambient === "string") return parsed.ambient;
  } catch { /* some paths answer markdown directly */ }
  return typeof body === "string" ? body : "";
}

/**
 * Ask the librarian for the ambient text.
 * Never rejects: the result says what happened, so callers can decide whether to stay quiet.
 */
export function fetchAmbient({ timeoutMs = 6000, limit = TEXT_LIMIT } = {}) {
  const { token, source } = credential();
  if (!token) return Promise.resolve({ state: "no-key", token: "", source: "", text: "", status: 0 });
  const lib = shelf();
  const url = librarian() + "/ambient" + (lib ? "?library=" + encodeURIComponent(lib) : "");
  const mod = url.startsWith("https:") ? https : http;

  return new Promise((resolve) => {
    const done = (r) => resolve(r);
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; done(r); } };
    const req = mod.get(url, { headers: { authorization: "Bearer " + token, "user-agent": "centricmem-host-hook" }, timeout: timeoutMs }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        if (r.statusCode !== 200) return finish({ state: "refused", token, source, text: "", status: r.statusCode });
        const t = textOf(d).trim();
        return finish({ state: t ? "ok" : "empty", token, source, text: t ? t.slice(0, limit) : "", status: r.statusCode });
      });
    });
    req.on("timeout", () => { req.destroy(); finish({ state: "no-answer", token, source, text: "", status: 0 }); });
    req.on("error", () => finish({ state: "no-answer", token, source, text: "", status: 0 }));
  });
}

/** A short, non-secret way to refer to a credential in diagnostics: the last four characters. */
export function tokenTail(token) {
  return token ? "…" + token.slice(-4) : "(none)";
}

/**
 * Whether this machine holds anything worth using as a credential. `credential()` already reads the env
 * names and the api.json files, so this is the one definition - a source added for one host is not
 * silently missing from another.
 */
export function hasCredential() {
  return credential().token !== "";
}

/**
 * The switches mimocode documents. The shared hooks are where every other host honours them, so a user
 * who set one does not get a different answer on the next host along.
 */
export const hooksDisabled = () => process.env.CENTRICMEM_HOOK_DISABLE === "1";
export const hooksDryRun = () => process.env.CENTRICMEM_HOOK_DRY_RUN === "1";
export const dontLog = () => process.env.CENTRICMEM_DONT_LOG === "1";

/** Where goose's Top Of Mind extension reads the context it injects into every turn. */
export function moimPath() {
  return process.env.GOOSE_MOIM_MESSAGE_FILE || path.join(os.homedir(), ".goose", "centricmem-ambient.md");
}

const moimHeader = (status, extra = "") =>
  `<!-- CentricMem ambient refresh: ${status} | ${new Date().toISOString()} | librarian=${librarian()}${extra} -->`;

// Each failure says which failure it is. Conflating them is how a stale leftover hub once read as healthy.
const MOIM_EXPLAIN = {
  "no-key": [
    "CentricMem: no key on this machine, so the shelf could not be read.",
    "",
    "If this agent is connected by OAuth, that is normal: OAuth covers the MCP tools, and no copyable key",
    "exists. Use the cm_* tools and ignore this file. If you expected a key here, mint one with",
    "`centricmem connect --device` (or /connect?device=) rather than creating a hub.",
  ],
  refused: (r) => [
    `CentricMem: the librarian refused this machine's key (HTTP ${r.status}).`,
    `  key: ${tokenTail(r.token)} from ${r.source || "(unknown source)"}`,
    "",
    "That is a credential problem, not a connection problem: rotate the key in Manager, then refresh this file.",
    "Nothing below is trustworthy.",
  ],
  "no-answer": [
    "CentricMem: the librarian did not answer, so there is no fresh context.",
    "",
    "This is the transport case. Check the service first with `centricmem doctor` or a plain GET /status - the",
    "CLI makes its own request, so it still works when this agent's MCP session is dead. If the service is",
    "fine, the MCP session is the problem: cycling the extension (disable, then enable) re-handshakes it.",
    "Nothing below is trustworthy.",
  ],
  empty: [
    "CentricMem: the librarian answered with no context for this shelf.",
    "",
    "Usually that means no shelf was named and the CLI has not been pointed at one. Name it with shelf= on a",
    "tool call, or pass CENTRICMEM_SHELF when refreshing this file.",
  ],
};

/**
 * The MOIM file's contents. Composed here so the refresher and the goose SessionStart hook cannot drift
 * apart on what an honest file says: a stale file that claims success is worse than one that says why it
 * is empty. The text is read by the model as-is.
 */
export function moimText(r) {
  if (r.state === "ok") {
    return [moimHeader("status=OK", ` | source=http | token=${tokenTail(r.token)}`), "", r.text, ""].join("\n");
  }
  const explain = typeof MOIM_EXPLAIN[r.state] === "function" ? MOIM_EXPLAIN[r.state](r) : MOIM_EXPLAIN[r.state] || MOIM_EXPLAIN["no-answer"];
  return [
    moimHeader("status=" + r.state.toUpperCase(), ` | token=${tokenTail(r.token)}`),
    "",
    ...explain,
    "",
    "Nothing below is trustworthy.",
    "",
  ].join("\n");
}

/** Write the MOIM file, returning what was written so the caller can report it. */
export function writeMoim(r, out = moimPath()) {
  const body = moimText(r);
  try {
    fs.mkdirSync(path.dirname(out), { recursive: true });
  } catch {
    /* exists */
  }
  fs.writeFileSync(out, body, "utf8");
  return { out, body };
}
