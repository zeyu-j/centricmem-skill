/**
 * test-mcp.mjs — end-to-end test of the CentricMem MCP server over stdio.
 * Usage: node scripts/test-mcp.mjs <project_root>
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";
import os from "node:os";

let root = process.argv[2];
if (!root) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cm-mcp-"));
}
if (!fs.existsSync(path.join(root, ".centricmem", "workspace.json"))) {
  const { execFileSync } = await import("node:child_process");
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/cli.js");
  execFileSync("node", [cli, "init", "--no-git-hook"], { cwd: root });
}

const serverPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/mcp-server.js");

const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath],
  env: { ...process.env, CENTRICMEM_WORKSPACE: root, CENTRICMEM_AGENT: "test-client" },
});
const client = new Client({ name: "test-client", version: "0.0.1" });
await client.connect(transport);

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
};

// 1. list tools
const tools = await client.listTools();
const names = tools.tools.map((t) => t.name).sort();
check("tools/list returns 6 tools", names.length === 6, names.join(", "));

// 2. read_context
const ctx = await client.callTool({ name: "centricmem_read_context", arguments: {} });
const ctxText = ctx.content[0].text;
check("read_context returns AGENTS.md", ctxText.includes("Project Memory") || ctxText.includes("AGENTS"));
check("read_context returns active_context", ctxText.includes("active_context"));

// 3. log_decision
const dec = await client.callTool({
  name: "centricmem_log_decision",
  arguments: {
    title: "Adopt Redis for rate-limit caching",
    context: "API gateway needs shared rate-limit counters across workers.",
    decision: "Use Redis with a 60s sliding window; fall back to in-memory when Redis is down.",
    consequences: "Adds an infra dependency; needs health checks.",
    agent: "claude-code",
    tags: ["redis", "performance"],
  },
});
const decText = dec.content[0].text;
check("log_decision creates a file", /Decision #\d+ logged/.test(decText), decText);

// 4. search finds the new decision
const s = await client.callTool({
  name: "centricmem_search",
  arguments: { query: "Redis rate limit", limit: 5 },
});
const sText = s.content[0].text;
check("search finds new decision", sText.includes("Redis"), sText.split("\n")[0]);

// 5. update_context then read back
await client.callTool({
  name: "centricmem_update_context",
  arguments: { content: "## Current Focus\n\nIntegrating Redis rate limiting.", agent: "cursor" },
});
const ctx2 = await client.callTool({ name: "centricmem_read_context", arguments: {} });
check("update_context persists", ctx2.content[0].text.includes("Integrating Redis rate limiting"));
check("update_context stamps agent", ctx2.content[0].text.includes("updated_by=cursor"));

// 6. second decision gets next sequence number
const dec2 = await client.callTool({
  name: "centricmem_log_decision",
  arguments: {
    title: "Use pino for structured logging",
    context: "Console logs are unstructured.",
    decision: "Adopt pino with JSON output.",
  },
});
const m1 = /#(\d+)/.exec(decText);
const m2 = /#(\d+)/.exec(dec2.content[0].text);
check("sequence auto-increments", m1 && m2 && Number(m2[1]) === Number(m1[1]) + 1, `${m1?.[1]} -> ${m2?.[1]}`);

// 7. read_context with level=full
const ctxFull = await client.callTool({ name: "centricmem_read_context", arguments: { level: "full" } });
check("read_context level=full works", ctxFull.content[0].text.includes("Project Memory") || ctxFull.content[0].text.includes("AGENTS"));

// 8. search with type filter
const sFiltered = await client.callTool({
  name: "centricmem_search",
  arguments: { query: "Redis", type: "decision" },
});
check(
  "search type=decision filter",
  sFiltered.content[0].text.includes("[decision]") && !sFiltered.content[0].text.includes("[context]"),
);

// 9. log_lesson and search it
const lesson = await client.callTool({
  name: "centricmem_log_lesson",
  arguments: { title: "Redis connection pool exhaustion", body: "Always set maxRetriesPerRequest=0 to avoid blocking the event loop.", agent: "claude-code" },
});
check("log_lesson creates entry", lesson.content[0].text.includes("appended"), lesson.content[0].text);
// idempotency
const lesson2 = await client.callTool({
  name: "centricmem_log_lesson",
  arguments: { title: "Redis connection pool exhaustion", body: "duplicate" },
});
check("log_lesson is idempotent", lesson2.content[0].text.includes("skipped"), lesson2.content[0].text);

// 10. tag-only search
const tagSearch = await client.callTool({
  name: "centricmem_search",
  arguments: { query: "performance", type: "decision" },
});
check("tag-only search hits tagged decision", tagSearch.content[0].text.includes("Redis"), tagSearch.content[0].text.split("\n")[0]);

const sess = await client.callTool({
  name: "centricmem_log_session",
  arguments: { summary: "Fixed auth bug", title: "Auth session" },
});
check("log_session creates entry", sess.content[0].text.includes("Session logged"), sess.content[0].text);

const explained = await client.callTool({
  name: "centricmem_search",
  arguments: { query: "Redis", explain: true },
});
check("search explain includes score", explained.content[0].text.includes("score"), explained.content[0].text.split("\n")[0]);

await client.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll MCP checks passed");
process.exit(failures ? 1 : 0);
