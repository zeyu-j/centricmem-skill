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
 * Product home: CENTRICMEM_HOME (or CENTRICMEM_WORKSPACE alias) + CENTRICMEM_PROJECT.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { findWorkspaceRoot, resolvePaths } from "./core.js";
import { getCurrentProjectSlug } from "./workspace.js";
import { initProject, logDecision, updateContext, readContext, logLesson, logSession } from "./memory.js";
import { buildIndex, getDb, search, searchScoped, searchScopedAsync, parseAddressQuery, resolveSearchSlugs, classifyIntent, closeAllCached } from "./indexer.js";
import { cliVersion } from "./skill.js";
import { isLibrarianGuest, guestHubWriteMessage } from "./guest.js";
function getWorkspace() {
    if (isLibrarianGuest()) {
        throw new Error(guestHubWriteMessage("centricmem-mcp"));
    }
    const env = process.env.CENTRICMEM_HOME || process.env.CENTRICMEM_WORKSPACE || process.env.CENTRICMEM_ROOT;
    if (env) {
        initProject(path.resolve(env));
        return path.resolve(env);
    }
    const found = findWorkspaceRoot();
    if (found)
        return found;
    throw new Error("No CentricMem product home found. Set CENTRICMEM_HOME or run `centricmem init`.");
}
function getProjectSlug(ws) {
    return process.env.CENTRICMEM_PROJECT || getCurrentProjectSlug(ws);
}
const server = new McpServer({ name: "centricmem", version: cliVersion() });
// ---------------------------------------------------------------------------
// centricmem_search
// ---------------------------------------------------------------------------
server.registerTool("centricmem_search", {
    title: "Search project memory",
    description: "Search project memory. Keywords use FTS. tags / tag: / --tag require the token in the Tags field OR the body (AND); tagged rows rank higher. Prefixes: type: status: id: #NNNN project: agent:.",
    inputSchema: {
        query: z.string().optional().describe("Keywords and prefixes (type:, tag:, id:, #NNNN, project:). Optional if tags or type is set."),
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
        meta: z.record(z.string(), z.string()).optional().describe("Metadata filters, e.g. { civilization: 'chinese', type: 'recipe' }"),
        tags: z.array(z.string()).optional().describe("Require each token in Tags or body (AND); tagged rows rank higher"),
        explain: z.boolean().optional().describe("Include score breakdown per result"),
        semantic: z.boolean().optional().describe("Hybrid BM25 + embedding search"),
    },
}, async ({ query, limit, type, status, agent, meta, tags, explain, semantic }) => {
    try {
        const ws = getWorkspace();
        const slug = getProjectSlug(ws);
        const paths = resolvePaths(ws, slug);
        const db = getDb(paths);
        const q = (query ?? "").trim();
        const parsed = parseAddressQuery(q);
        if (!q && !tags?.length && !type && !status && !agent) {
            return { isError: true, content: [{ type: "text", text: "Provide query, tags, or type:/--type" }] };
        }
        const filters = { type, status, agent, meta, tags };
        const scope = parsed.projectScopes.length ? undefined : { project: slug };
        const slugs = resolveSearchSlugs(ws, parsed, scope);
        const results = slugs.length === 1 && slugs[0] === slug && !semantic
            ? search(paths, q, limit, filters, db, { explain, semantic })
            : semantic
                ? await searchScopedAsync(ws, q, limit, filters, { explain, semantic }, scope)
                : searchScoped(ws, q, limit, filters, { explain, semantic }, scope);
        if (!results.length) {
            const hint = q ? `"${q}"` : tags?.length ? `tags ${tags.join(", ")}` : "this filter";
            return { content: [{ type: "text", text: `No memory found for ${hint}. Tokens match Tags or body; tagged rows rank higher. Try type:decision, #0016, project:slug, or broader keywords. Or call centricmem_read_context to see the Memory Map overview.` }] };
        }
        const intent = parsed.ftsQuery ? classifyIntent(parsed.ftsQuery) : "general";
        const header = intent !== "general" ? `(query intent: ${intent})\n\n` : "";
        const text = header +
            results
                .map((r, i) => {
                const statusTag = r.status && r.status !== "active" ? ` [${r.status.toUpperCase()}]` : "";
                const supTag = r.supersededBy ? ` → superseded by #${r.supersededBy.padStart(4, "0")}` : "";
                const tagsLine = r.tags?.length ? `\n   tags: ${r.tags.join(", ")}` : "";
                const attachLine = r.attach ? `\n   attach: ${r.attach}` : "";
                return `${i + 1}. [${r.docType}]${statusTag}${supTag} ${r.heading} (score ${r.score.toFixed(2)})\n   file: .centricmem/${r.file} | at: ${r.loggedAt} | by: ${r.agent}\n   ${r.snippet.replace(/\n/g, " ")}${tagsLine}${attachLine}${r.explain ? `\n   explain: rel=${r.explain.relevance.toFixed(3)} time=${r.explain.timeDecay.toFixed(3)}` : ""}`;
            })
                .join("\n\n");
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return { isError: true, content: [{ type: "text", text: `Search failed: ${err.message}` }] };
    }
});
// ---------------------------------------------------------------------------
// centricmem_read_context
// ---------------------------------------------------------------------------
server.registerTool("centricmem_read_context", {
    title: "Read current project context",
    description: "Read the project's memory entry points. Default level='summary' returns a structure-aware summary: Memory Map (always pinned) + key sections of AGENTS.md + full active_context.md (token-efficient). Use level='full' only when summary is insufficient.",
    inputSchema: {
        level: z
            .enum(["summary", "full"])
            .optional()
            .describe("'summary' (default, Level 0) or 'full' (entire AGENTS.md)"),
    },
}, async ({ level }) => {
    try {
        const ws = getWorkspace();
        const slug = getProjectSlug(ws);
        const ctx = readContext(ws, level ?? "summary", 50, slug);
        const parts = [];
        if (ctx.agents)
            parts.push(`=== AGENTS.md${ctx.truncated ? " (summary)" : ""} ===\n${ctx.agents}`);
        if (ctx.activeContext)
            parts.push(`=== active_context.md ===\n${ctx.activeContext}`);
        const text = parts.length
            ? parts.join("\n\n")
            : "No project memory found. Run `centricmem init` in the project root.";
        return { content: [{ type: "text", text }] };
    }
    catch (err) {
        return { isError: true, content: [{ type: "text", text: `Read context failed: ${err.message}` }] };
    }
});
// ---------------------------------------------------------------------------
// centricmem_log_decision
// ---------------------------------------------------------------------------
server.registerTool("centricmem_log_decision", {
    title: "Log a project decision",
    description: "Record an architecture/technical decision as an append-only Markdown file in .centricmem/projects/<current>/decisions/. The server assigns the sequence number. Call after significant decisions.",
    inputSchema: {
        title: z.string().min(1).describe("Short decision title, e.g. 'Use SQLite FTS5 for search'"),
        context: z.string().min(1).describe("Why this decision was needed (background, constraints)"),
        decision: z.string().min(1).describe("What was decided"),
        consequences: z.string().optional().describe("Trade-offs and follow-up implications"),
        agent: z.string().optional().describe("Calling agent name, e.g. 'cursor' or 'claude-code'"),
        tags: z.array(z.string()).optional().describe("Optional tags, e.g. ['database', 'performance']"),
        supersedes: z.number().int().min(1).optional().describe("Sequence number of the decision this replaces (e.g. 3 for #0003). The old decision is automatically marked Superseded."),
    },
}, async ({ title, context, decision, consequences, agent, tags, supersedes }) => {
    try {
        const ws = getWorkspace();
        const slug = getProjectSlug(ws);
        const result = logDecision(ws, { title, context, decision, consequences, agent, tags, supersedes }, slug);
        buildIndex(resolvePaths(ws, slug));
        const supersedesNote = supersedes ? ` (supersedes #${String(supersedes).padStart(4, "0")})` : "";
        return {
            content: [{ type: "text", text: `Decision #${result.seq} logged to ${result.file}${supersedesNote} and indexed.` }],
        };
    }
    catch (err) {
        return { isError: true, content: [{ type: "text", text: `Log decision failed: ${err.message}` }] };
    }
});
// ---------------------------------------------------------------------------
// centricmem_update_context
// ---------------------------------------------------------------------------
server.registerTool("centricmem_update_context", {
    title: "Update active context",
    description: "Overwrite the current project's active_context.md with the current task focus. Call when the work focus changes or a task completes.",
    inputSchema: {
        content: z.string().min(1).describe("New active context in Markdown (current focus, recent changes, next steps)"),
        agent: z.string().optional().describe("Calling agent name"),
    },
}, async ({ content, agent }) => {
    try {
        const ws = getWorkspace();
        const slug = getProjectSlug(ws);
        const file = updateContext(ws, content, agent, slug);
        buildIndex(resolvePaths(ws, slug));
        return { content: [{ type: "text", text: `Active context updated (${file}) and indexed.` }] };
    }
    catch (err) {
        return { isError: true, content: [{ type: "text", text: `Update context failed: ${err.message}` }] };
    }
});
// ---------------------------------------------------------------------------
// centricmem_log_lesson
// ---------------------------------------------------------------------------
server.registerTool("centricmem_log_lesson", {
    title: "Log durable knowledge",
    description: "Append durable knowledge to lessons.md: mental models, facts, logic, or pitfalls. Call whenever a future session would benefit — do not wait for session end, and do not limit this to mistakes.",
    inputSchema: {
        title: z.string().min(1).describe("Short title"),
        body: z.string().min(1).describe("The knowledge itself"),
        agent: z.string().optional().describe("Calling agent name"),
        tags: z.array(z.string()).optional().describe("Folksonomy tags — reuse ambient Tags or mint"),
    },
}, async ({ title, body, agent, tags }) => {
    try {
        const ws = getWorkspace();
        const slug = getProjectSlug(ws);
        const result = logLesson(ws, { title, body, agent, tags }, slug);
        if (result.status === "skipped") {
            return { content: [{ type: "text", text: `Lesson "${title}" already exists in lessons.md — skipped.` }] };
        }
        buildIndex(resolvePaths(ws, slug));
        return { content: [{ type: "text", text: `Lesson "${title}" appended to .centricmem/lessons.md and indexed.` }] };
    }
    catch (err) {
        return { isError: true, content: [{ type: "text", text: `Log lesson failed: ${err.message}` }] };
    }
});
server.registerTool("centricmem_log_session", {
    title: "Log session summary",
    description: "Log one session unit (unique file per close, tagged with writer). Always pass tags: reuse ambient Tags or mint a specific new one.",
    inputSchema: {
        summary: z.string().min(1).describe("Session summary"),
        title: z.string().optional().describe("Section heading"),
        agent: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Folksonomy tags — reuse existing or mint new"),
    },
}, async ({ summary, title, agent, tags }) => {
    try {
        const ws = getWorkspace();
        const slug = getProjectSlug(ws);
        const result = logSession(ws, { summary, title, agent, tags }, slug);
        buildIndex(resolvePaths(ws, slug));
        return { content: [{ type: "text", text: `Session logged: ${result.file} → ## ${result.heading}` }] };
    }
    catch (err) {
        return { isError: true, content: [{ type: "text", text: `Log session failed: ${err.message}` }] };
    }
});
// Graceful shutdown: close all cached DB connections on process exit.
process.on("exit", () => { try {
    closeAllCached();
}
catch { /* ignore */ } });
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`CentricMem MCP server v${cliVersion()} running (stdio, optional/legacy)`);
