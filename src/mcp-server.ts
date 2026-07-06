#!/usr/bin/env node
/**
 * mcp-server.ts — CentricMem MCP server (stdio transport).
 *
 * Tools:
 *   centricmem_search         — FTS5 search over project memory (type/status/agent filters)
 *   centricmem_read_context   — progressive disclosure: structure-aware summary or full
 *   centricmem_log_decision   — append-only decision record (auto sequence, tags, supersedes)
 *   centricmem_update_context — overwrite active_context.md
 *   centricmem_log_lesson     — append a lesson learned to lessons.md
 *
 * Optional legacy MCP server. Prefer Skill + CLI for local memory.
 * Workspace: CENTRICMEM_WORKSPACE (or CENTRICMEM_ROOT) + CENTRICMEM_PROJECT.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findWorkspaceRoot, resolvePaths } from "./core.js";
import { getCurrentProjectSlug } from "./workspace.js";
import { initProject, logDecision, updateContext, readContext, logLesson, logSession } from "./memory.js";
import { buildIndex, getDb, search, searchAsync, classifyIntent, closeAllCached } from "./indexer.js";

function getWorkspace(): string {
  const env = process.env.CENTRICMEM_WORKSPACE || process.env.CENTRICMEM_ROOT;
  if (env) {
    initProject(env); // explicit target — idempotent scaffold is intended
    return env;
  }
  const found = findWorkspaceRoot();
  if (found) return found;
  // Never silently scaffold in an arbitrary cwd — require explicit setup.
  throw new Error(
    "No CentricMem workspace found. Set CENTRICMEM_WORKSPACE or run `centricmem init` in the workspace root.",
  );
}

function getProjectSlug(ws: string): string | undefined {
  return process.env.CENTRICMEM_PROJECT || getCurrentProjectSlug(ws);
}

const server = new McpServer({ name: "centricmem", version: "0.10.0" });

// ---------------------------------------------------------------------------
// centricmem_search
// ---------------------------------------------------------------------------

server.registerTool(
  "centricmem_search",
  {
    title: "Search project memory",
    description:
      "Full-text search over the project's memory (.centricmem/): decisions, rules, context, lessons. Supports type, status, and agent filters. Use before making assumptions about project conventions or past decisions.",
    inputSchema: {
      query: z.string().describe("Search query (keywords, class names, topics)"),
      limit: z.number().int().min(1).max(50).optional().describe("Max results (default from config, 5)"),
      type: z
        .enum(["decision", "rule", "lesson", "context", "session", "imported"])
        .optional()
        .describe("Filter by memory type"),
      status: z
        .enum(["active", "superseded", "deprecated", "historical"])
        .optional()
        .describe("Filter by status"),
      agent: z.string().optional().describe("Filter by source agent, e.g. 'cursor', 'claude-code', 'migration'"),
      explain: z.boolean().optional().describe("Include score breakdown per result"),
      semantic: z.boolean().optional().describe("Hybrid BM25 + embedding search"),
    },
  },
  async ({ query, limit, type, status, agent, explain, semantic }) => {
    try {
      const ws = getWorkspace();
      const slug = getProjectSlug(ws);
      const paths = resolvePaths(ws, slug);
      const db = getDb(paths);
      const results = semantic
        ? await searchAsync(paths, query, limit, { type, status, agent }, { explain, semantic })
        : search(paths, query, limit, { type, status, agent }, db, { explain, semantic });
      if (!results.length) {
        return { content: [{ type: "text", text: `No memory found for "${query}". BM25 needs at least one overlapping content word — try broader or alternative keywords (e.g. the technology name instead of a synonym), or call centricmem_read_context to see the Memory Map overview.` }] };
      }
      const intent = classifyIntent(query);
      const header = intent !== "general" ? `(query intent: ${intent})\n\n` : "";
      const text =
        header +
        results
          .map((r, i) => {
            const statusTag = r.status && r.status !== "active" ? ` [${r.status.toUpperCase()}]` : "";
            const supTag = r.supersededBy ? ` → superseded by #${r.supersededBy.padStart(4, "0")}` : "";
            return `${i + 1}. [${r.docType}]${statusTag}${supTag} ${r.heading} (score ${r.score.toFixed(2)})\n   file: .centricmem/${r.file} | at: ${r.loggedAt} | by: ${r.agent}\n   ${r.snippet.replace(/\n/g, " ")}${r.explain ? `\n   explain: rel=${r.explain.relevance.toFixed(3)} time=${r.explain.timeDecay.toFixed(3)}` : ""}`;
          })
          .join("\n\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Search failed: ${(err as Error).message}` }] };
    }
  }
);

// ---------------------------------------------------------------------------
// centricmem_read_context
// ---------------------------------------------------------------------------

server.registerTool(
  "centricmem_read_context",
  {
    title: "Read current project context",
    description:
      "Read the project's memory entry points. Default level='summary' returns a structure-aware summary: Memory Map (always pinned) + key sections of AGENTS.md + full active_context.md (token-efficient). Use level='full' only when summary is insufficient.",
    inputSchema: {
      level: z
        .enum(["summary", "full"])
        .optional()
        .describe("'summary' (default, Level 0) or 'full' (entire AGENTS.md)"),
    },
  },
  async ({ level }) => {
    try {
      const ws = getWorkspace();
      const slug = getProjectSlug(ws);
      const ctx = readContext(ws, level ?? "summary", 50, slug);
      const parts: string[] = [];
      if (ctx.agents) parts.push(`=== AGENTS.md${ctx.truncated ? " (summary)" : ""} ===\n${ctx.agents}`);
      if (ctx.activeContext) parts.push(`=== active_context.md ===\n${ctx.activeContext}`);
      const text = parts.length
        ? parts.join("\n\n")
        : "No project memory found. Run `centricmem init` in the project root.";
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Read context failed: ${(err as Error).message}` }] };
    }
  }
);

// ---------------------------------------------------------------------------
// centricmem_log_decision
// ---------------------------------------------------------------------------

server.registerTool(
  "centricmem_log_decision",
  {
    title: "Log a project decision",
    description:
      "Record an architecture/technical decision as an append-only Markdown file in .centricmem/projects/<current>/decisions/. The server assigns the sequence number. Call after significant decisions.",
    inputSchema: {
      title: z.string().min(1).describe("Short decision title, e.g. 'Use SQLite FTS5 for search'"),
      context: z.string().min(1).describe("Why this decision was needed (background, constraints)"),
      decision: z.string().min(1).describe("What was decided"),
      consequences: z.string().optional().describe("Trade-offs and follow-up implications"),
      agent: z.string().optional().describe("Calling agent name, e.g. 'cursor' or 'claude-code'"),
      tags: z.array(z.string()).optional().describe("Optional tags, e.g. ['database', 'performance']"),
      supersedes: z.number().int().min(1).optional().describe("Sequence number of the decision this replaces (e.g. 3 for #0003). The old decision is automatically marked Superseded."),
    },
  },
  async ({ title, context, decision, consequences, agent, tags, supersedes }) => {
    try {
      const ws = getWorkspace();
      const slug = getProjectSlug(ws);
      const result = logDecision(ws, { title, context, decision, consequences, agent, tags, supersedes }, slug);
      buildIndex(resolvePaths(ws, slug));
      const supersedesNote = supersedes ? ` (supersedes #${String(supersedes).padStart(4, "0")})` : "";
      return {
        content: [{ type: "text", text: `Decision #${result.seq} logged to ${result.file}${supersedesNote} and indexed.` }],
      };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Log decision failed: ${(err as Error).message}` }] };
    }
  }
);

// ---------------------------------------------------------------------------
// centricmem_update_context
// ---------------------------------------------------------------------------

server.registerTool(
  "centricmem_update_context",
  {
    title: "Update active context",
    description:
      "Overwrite the current project's active_context.md with the current task focus. Call when the work focus changes or a task completes.",
    inputSchema: {
      content: z.string().min(1).describe("New active context in Markdown (current focus, recent changes, next steps)"),
      agent: z.string().optional().describe("Calling agent name"),
    },
  },
  async ({ content, agent }) => {
    try {
      const ws = getWorkspace();
      const slug = getProjectSlug(ws);
      const file = updateContext(ws, content, agent, slug);
      buildIndex(resolvePaths(ws, slug));
      return { content: [{ type: "text", text: `Active context updated (${file}) and indexed.` }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Update context failed: ${(err as Error).message}` }] };
    }
  }
);

// ---------------------------------------------------------------------------
// centricmem_log_lesson
// ---------------------------------------------------------------------------

server.registerTool(
  "centricmem_log_lesson",
  {
    title: "Log a lesson learned",
    description:
      "Append a lesson (pitfall, gotcha, hard-won knowledge) to the current project's lessons.md. Call when you discover something that future sessions should know to avoid repeating mistakes.",
    inputSchema: {
      title: z.string().min(1).describe("Short lesson title, e.g. 'N+1 queries in user endpoint'"),
      body: z.string().min(1).describe("What happened, why it matters, and how to avoid it"),
      agent: z.string().optional().describe("Calling agent name"),
    },
  },
  async ({ title, body, agent }) => {
    try {
      const ws = getWorkspace();
      const slug = getProjectSlug(ws);
      const result = logLesson(ws, { title, body, agent }, slug);
      if (result.status === "skipped") {
        return { content: [{ type: "text", text: `Lesson "${title}" already exists in lessons.md — skipped.` }] };
      }
      buildIndex(resolvePaths(ws, slug));
      return { content: [{ type: "text", text: `Lesson "${title}" appended to .centricmem/lessons.md and indexed.` }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Log lesson failed: ${(err as Error).message}` }] };
    }
  }
);

server.registerTool(
  "centricmem_log_session",
  {
    title: "Log session summary",
    description: "Append episodic session entry to sessions/YYYY-MM-DD.md (implicit memory capture).",
    inputSchema: {
      summary: z.string().min(1).describe("Session summary"),
      title: z.string().optional().describe("Section heading"),
      agent: z.string().optional(),
    },
  },
  async ({ summary, title, agent }) => {
    try {
      const ws = getWorkspace();
      const slug = getProjectSlug(ws);
      const result = logSession(ws, { summary, title, agent }, slug);
      buildIndex(resolvePaths(ws, slug));
      return { content: [{ type: "text", text: `Session logged: ${result.file} → ## ${result.heading}` }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Log session failed: ${(err as Error).message}` }] };
    }
  },
);

// Graceful shutdown: close all cached DB connections on process exit.
process.on("exit", () => { try { closeAllCached(); } catch { /* ignore */ } });

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("CentricMem MCP server v0.10.0 running (stdio, optional/legacy)");
