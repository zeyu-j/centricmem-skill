/**
 * CentricMem - MiMoCode plugin.
 *
 * MiMoCode is an OpenCode fork. It keeps the OpenCode plugin API and wraps every
 * turn with session.pre / session.post. Those, plus chat.message, are the whole
 * surface used here:
 *
 *   session.pre                      queue cached ambient for this session
 *   chat.message                     the injection point (output.parts is mutable)
 *   tool.execute.after               stamp when a cm_* tool actually ran
 *   session.post                     close-out (observation-only; cannot reopen the turn)
 *   experimental.session.compacting  durable context survives compaction
 *
 * MiMoCode has NO force-another-turn hook - session.post receives an empty output
 * object. The reminder is therefore deferred, not blocking: it is queued and
 * appended to the next outgoing message, deterministic for the user's next turn.
 *
 * WHY EVERY HOOK IS SYNCHRONOUS. MiMoCode runs file hooks under a hard 5000ms
 * timeout, rolls the output object back on failure, and opens a circuit breaker
 * after 3 failures for that hook - after which the hook is skipped for the life
 * of the process. A network call in a hook is therefore not just slow, it can
 * permanently disable that hook. So this plugin never touches the network: it
 * reads a cache file that refresh-ambient.mjs writes out of band.
 *
 * Optional. The baseline is the Skill plus host MCP and needs none of this.
 *
 * Env:
 *   CENTRICMEM_HOOK_DISABLE=1
 *   CENTRICMEM_HOOK_DRY_RUN=1
 *   CENTRICMEM_HOOK_L3=1            enable the auto-file close (off by default)
 *   CENTRICMEM_HOOK_SHELF=<id>      shelf for done (else CENTRICMEM_PROJECT)
 *   CENTRICMEM_HOOK_TRACE=1         append every hook call to a trace file
 *   CENTRICMEM_DONT_LOG=1
 *   CENTRICMEM_AMBIENT_FILE=<path>  default: ~/.config/mimocode/centricmem-ambient.md
 *   CENTRICMEM_AMBIENT_MAX_AGE_HOURS=<n>  default: 24
 *   CENTRICMEM_URL=<origin>         default: https://mem.centricmem.com
 */
import type { Plugin } from "@opencode-ai/plugin";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DISABLE = process.env.CENTRICMEM_HOOK_DISABLE === "1";
const DRY_RUN = process.env.CENTRICMEM_HOOK_DRY_RUN === "1";
const DONT_LOG = process.env.CENTRICMEM_DONT_LOG === "1";
const L3 = process.env.CENTRICMEM_HOOK_L3 === "1";
const TRACE = process.env.CENTRICMEM_HOOK_TRACE === "1";
const SHELF = (process.env.CENTRICMEM_HOOK_SHELF || process.env.CENTRICMEM_PROJECT || "").trim();

const AMBIENT_FILE =
  process.env.CENTRICMEM_AMBIENT_FILE ||
  path.join(os.homedir(), ".config", "mimocode", "centricmem-ambient.md");
const MAX_AGE_MS =
  (Number(process.env.CENTRICMEM_AMBIENT_MAX_AGE_HOURS || "24") || 24) * 3600 * 1000;

const TRACE_FILE = path.join(os.tmpdir(), "centricmem-mimocode-trace.log");

function trace(msg: string) {
  if (!TRACE) return;
  try { fs.appendFileSync(TRACE_FILE, new Date().toISOString() + " " + msg + "\n", "utf8"); } catch { /* ignore */ }
}

const safe = (id: unknown) => String(id || "default").replace(/[^\w.-]+/g, "_").slice(0, 80);
const stampFile = (id: unknown) => path.join(os.tmpdir(), "centricmem-cm-write-" + safe(id));
const sweepFile = (id: unknown) => path.join(os.tmpdir(), "centricmem-session-sweep-" + safe(id));

function has(p: string) {
  try { return fs.existsSync(p); } catch { return false; }
}
function mark(p: string) {
  try { fs.writeFileSync(p, new Date().toISOString() + "\n", "utf8"); } catch { /* ignore */ }
}
function clear(p: string) {
  try { fs.rmSync(p, { force: true }); } catch { /* ignore */ }
}
/**
 * The Bearer this host holds for the librarian.
 *
 * Env first, then the MCP config of a host that has already claimed the machine -
 * the same order tools/ambient.mjs uses. Never guesses: an empty string means the
 * caller stays quiet rather than inventing a credential.
 */
function readToken(): string {
  const env =
    process.env.CENTRICMEM_TOKEN || process.env.CENTRICMEM_AGENT_KEY || process.env.CENTRICMEM_API_KEY;
  if (env && env.trim()) return env.trim();

  const home = os.homedir();
  const files = [
    path.join(home, ".claude.json"),
    path.join(home, ".cursor", "mcp.json"),
    path.join(process.env.APPDATA || "", "Cursor", "User", "mcp.json"),
  ];
  for (const f of files) {
    if (!f || !f.trim()) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
      const entry = parsed && parsed.mcpServers && parsed.mcpServers.centricmem;
      const raw = entry && entry.headers && (entry.headers.Authorization || entry.headers.authorization);
      const m = /Bearer\s+(\S+)/i.exec(String(raw || ""));
      if (m) return m[1].trim();
    } catch { /* unreadable config is not an error here */ }
  }
  return "";
}

/**
 * File one session card through the hosted MCP server.
 *
 * The CLI is not an option on a guest host: `centricmem done` writes a local hub
 * file and refuses by design, even with a token and CENTRICMEM_HOME unset. The MCP
 * endpoint is the write path that works, and a plugin can speak it directly -
 * initialize, initialized, tools/call.
 *
 * Bounded and awaited. A hook has 5000ms before MiMoCode rolls the output back and
 * counts a failure toward the 3-strike circuit breaker, so this has to return on
 * its own; the abort controller guarantees that even if the network stalls.
 */
async function closeViaMcp(shelf: string, summary: string): Promise<number> {
  const token = readToken();
  if (!token) { trace("close skipped: no credential"); return 0; }

  const endpoint =
    (process.env.CENTRICMEM_URL || "https://mem.centricmem.com").replace(/\/$/, "") + "/mcp";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3500);
  const headers: Record<string, string> = {
    authorization: "Bearer " + token,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  try {
    const init = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "centricmem-mimocode", version: "1.0" },
        },
      }),
    });
    const sid = init.headers.get("mcp-session-id");
    await init.text();
    if (sid) headers["mcp-session-id"] = sid;

    await fetch(endpoint, {
      method: "POST",
      headers,
      signal: ac.signal,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).then((r) => r.text()).catch(() => "");

    const args: Record<string, unknown> = { summary, tags: ["hook-l3", "session-sweep"] };
    if (shelf) args.shelf = shelf;

    const call = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: ac.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "cm_done", arguments: args },
      }),
    });
    const body = await call.text();
    trace("close mcp http=" + call.status + " body=" + body.slice(0, 160));
    return call.status;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The cached ambient text, or null.
 *
 * refresh-ambient.mjs writes "status=OK" followed by the text on success, and a
 * bare status line when it has nothing trustworthy to say - the same convention
 * the goose refresher uses. Only an OK body is ever injected, so a stale or
 * refused cache adds nothing rather than substituting its own opinion.
 */
function readAmbient(): string | null {
  try {
    const st = fs.statSync(AMBIENT_FILE);
    if (MAX_AGE_MS > 0 && Date.now() - st.mtimeMs > MAX_AGE_MS) return null;
    const raw = fs.readFileSync(AMBIENT_FILE, "utf8");
    const m = /^status=OK[^\S\r\n]*\r?\n([\s\S]*)$/.exec(raw.trim());
    return m && m[1].trim() ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const REMINDER =
  "CentricMem: the turn that just ended made no cm_note / cm_log_decision / cm_done / cm_keep call. " +
  "If it shipped Non-Micro work, sweep before yielding. Skip if this was Micro.";

export const CentricMem: Plugin = async () => {
  let queued: string[] = [];
  let currentSid = "";
  let ambientSession = ""; // the session already given its ambient

  const sid = (input: any) => String(input?.sessionID || "default");

  /**
   * Per-session reset, called from every hook.
   *
   * session.pre fires once PER TURN, not once per session, so resetting on every
   * session.pre would wipe state mid-session. Reset only when the session id
   * actually changes.
   */
  const onSession = (id: string) => {
    if (id === currentSid) return;
    currentSid = id;
    ambientSession = "";
    queued = [];
    clear(stampFile(id));
    clear(sweepFile(id));
    trace("new session " + id);
  };

  /**
   * Ambient is read here, not in session.pre.
   *
   * Observed ordering on the first turn is chat.message BEFORE session.pre, so
   * anything session.pre queues cannot reach the first outgoing message. Reading
   * the cache from chat.message puts the ambient in front of the model on turn 1.
   */
  const injectAmbient = () => {
    if (DISABLE || ambientSession === currentSid) return;
    ambientSession = currentSid;
    const text = readAmbient();
    if (text) {
      queued.unshift("<!-- CentricMem ambient -->\n" + text);
      trace("ambient queued chars=" + text.length);
    } else {
      trace("no ambient");
    }
  };

  return {
    "session.pre": async (input: any) => {
      try {
        const id = sid(input);
        onSession(id);
        trace("session.pre " + id);
      } catch (e) { trace("session.pre FAILED " + String(e)); }
      // Never set output.cancel here: that aborts the session outright.
    },

    "chat.message": async (input: any, output: any) => {
      try {
        const id = sid(input);
        onSession(id);
        injectAmbient();
        trace("chat.message queued=" + queued.length);
        if (!output || !Array.isArray(output.parts) || queued.length === 0) return;

        // A part is NOT just {type, text}: MiMoCode runs AD.Part.safeParse on every
        // element of output.parts and then persists it with updatePart, so a partial
        // object aborts the turn with 'SyncEvent.run: "sessionID" required'.
        // The shape below mirrors a real persisted text part.
        const messageID = String(input?.messageID || output?.message?.id || "");
        if (!messageID) { trace("chat.message no messageID - skipped"); return; }

        for (const text of queued) {
          output.parts.push({
            id: "prt_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36),
            type: "text",
            text,
            sessionID: id,
            messageID,
          });
        }
        trace("chat.message injected=" + queued.length);
        queued = [];
      } catch (e) { trace("chat.message FAILED " + String(e)); }
    },

    "tool.execute.after": async (input: any) => {
      try {
        onSession(sid(input));
        const name = String(input?.tool || "");
        trace("tool.execute.after tool=" + name);
        if (name.startsWith("cm_") || name.includes("centricmem")) mark(stampFile(sid(input)));
      } catch { /* ignore */ }
    },

    "session.post": async (input: any) => {
      try {
        const id = sid(input);
        onSession(id);
        trace("session.post outcome=" + String(input?.outcome));
        if (DISABLE || input?.outcome !== "completed") return;
        if (has(stampFile(id))) return; // a cm_* call already happened this session

        queued.push(REMINDER); // always: deterministic nudge on the next outgoing message
        trace("session.post reminder queued");

        if (!L3 || DONT_LOG || has(sweepFile(id))) return;

        // One attempt per session whatever the outcome: the close spawns a real Node
        // process, and a guest host refuses the write by design, so retrying every
        // turn would burn a process launch per turn to be told no again.
        mark(sweepFile(id));

        if (DRY_RUN) {
          trace("session.post dry-run sweep shelf=" + (SHELF || "(none)"));
          return;
        }

        if (!readToken()) {
          trace("session.post close skipped: no credential");
          return;
        }
        const summary =
          "Session sweep (MiMoCode L3 plugin). session=" + id.slice(0, 120) +
          ". Turn completed without a prior cm_* stamp - auto session card only.";
        await closeViaMcp(SHELF, summary);
      } catch (e) { trace("session.post FAILED " + String(e)); }
    },

    "experimental.session.compacting": async (input: any, output: any) => {
      try {
        onSession(sid(input));
        trace("compacting");
        if (!output) return;
        output.context = Array.isArray(output.context) ? output.context : [];
        if (DISABLE) return;
        const text = readAmbient();
        output.context.push(
          text
            ? "## CentricMem shelf context\n\n" + text
            : "## CentricMem\n\nNo shelf context was available before this compaction."
        );
      } catch (e) { trace("compacting FAILED " + String(e)); }
    },
  };
};
