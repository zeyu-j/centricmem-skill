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
export function credential() {
  if (process.env.CENTRICMEM_TOKEN) return { token: process.env.CENTRICMEM_TOKEN.trim(), source: "env:CENTRICMEM_TOKEN" };
  if (process.env.CENTRICMEM_AGENT_KEY) return { token: process.env.CENTRICMEM_AGENT_KEY.trim(), source: "env:CENTRICMEM_AGENT_KEY" };
  if (process.env.CENTRICMEM_API_KEY) return { token: process.env.CENTRICMEM_API_KEY.trim(), source: "env:CENTRICMEM_API_KEY" };
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
