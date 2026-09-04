#!/usr/bin/env node
/**
 * host-connector.ts — stdio MCP that proxies to the librarian HTTP API.
 * Not a second memory store. Prefer CENTRICMEM_URL; otherwise loopback.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { cliVersion } from "./skill.js";
import { librarianRequest, resolveGuestManifest } from "./host-discover.js";
import { UNCLASSIFIED } from "./workspace.js";

function downMessage(): string {
  return "Librarian unreachable. Do not create a hub.";
}

async function call(pathname: string, init: RequestInit = {}, library?: string): Promise<string> {
  const manifest = resolveGuestManifest({ library });
  if (!manifest) throw new Error(downMessage());
  const res = await librarianRequest(pathname, { ...init, manifest, library });
  const text = await res.text();
  if (res.status === 401) {
    throw new Error("Librarian token failed. Rotate it in Manager settings. Do not retry without a token.");
  }
  if (!res.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      throw new Error(parsed.error?.message || text || downMessage());
    } catch (error) {
      if (error instanceof Error && error.message !== text) throw error;
      throw new Error(text || downMessage());
    }
  }
  return text;
}

function toolResult(text: string, isError = false): { content: { type: "text"; text: string }[]; isError?: boolean } {
  return { content: [{ type: "text", text }], ...(isError ? { isError: true } : {}) };
}

async function wrap(fn: () => Promise<string>) {
  try {
    return toolResult(await fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toolResult(message, true);
  }
}

const server = new McpServer({ name: "centricmem-host", version: cliVersion() });

server.registerTool(
  "cm_health",
  { title: "Librarian health", description: "Check that the CentricMem librarian HTTP API is reachable.", inputSchema: {} },
  async () => wrap(() => call("/health")),
);

server.registerTool(
  "cm_ambient",
  {
    title: "Ambient preflight",
    description: "Session-start memory block. Pass project or cwd so writes route correctly.",
    inputSchema: {
      project: z.string().optional(),
      library: z.string().optional(),
      cwd: z.string().optional(),
    },
  },
  async ({ project, library, cwd }) => {
    const q = new URLSearchParams();
    const lib = library || project;
    if (lib) q.set("library", lib);
    if (cwd) q.set("cwd", cwd);
    const suffix = q.toString() ? `?${q}` : "";
    return wrap(() => call(`/ambient${suffix}`, {}, lib));
  },
);

server.registerTool(
  "cm_doctor",
  {
    title: "Doctor",
    description: "Distinguish missing CLI, sandbox, librarian down, and token failure.",
    inputSchema: { cwd: z.string().optional() },
  },
  async ({ cwd }) => {
    const suffix = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    return wrap(() => call(`/doctor${suffix}`));
  },
);

server.registerTool(
  "cm_search",
  {
    title: "Search memory",
    description: "FTS search. tags / type / library / -p alias. One pairing key selects one library; all does not leak others.",
    inputSchema: {
      q: z.string().optional(),
      project: z.string().optional(),
      library: z.string().optional(),
      all: z.boolean().optional(),
      tags: z.string().optional(),
      type: z.string().optional(),
      limit: z.number().int().optional(),
    },
  },
  async ({ q, project, library, all, tags, type, limit }) => {
    const lib = library || project;
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (lib) query.set("library", lib);
    if (all) query.set("all", "1");
    if (tags) query.set("tags", tags);
    if (type) query.set("type", type);
    if (limit) query.set("limit", String(limit));
    return wrap(() => call(`/search?${query}`, {}, lib));
  },
);

server.registerTool(
  "cm_show",
  {
    title: "Show a memory unit",
    description: "Print the Markdown card. Do not request original=; originals are human downloads, not agent context.",
    inputSchema: {
      file: z.string(),
      project: z.string().optional(),
      library: z.string().optional(),
      heading: z.string().optional(),
    },
  },
  async ({ file, project, library, heading }) => {
    const lib = library || project;
    const query = new URLSearchParams({ file });
    if (lib) query.set("library", lib);
    if (heading) query.set("heading", heading);
    return wrap(() => call(`/show?${query}`, {}, lib));
  },
);

server.registerTool(
  "cm_note",
  {
    title: "Write durable knowledge",
    description: "Write durable knowledge to the librarian (HTTP /note). Hold until session-end sweep.",
    inputSchema: {
      title: z.string(),
      body: z.string(),
      tags: z.string().optional(),
      project: z.string().optional(),
      library: z.string().optional(),
      cwd: z.string().optional(),
    },
  },
  async (input) => wrap(() => call("/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, input.library || input.project)),
);

server.registerTool(
  "cm_log_decision",
  {
    title: "Log a decision",
    description: "Same as centricmem log-decision.",
    inputSchema: {
      title: z.string(),
      decision: z.string().optional(),
      context: z.string().optional(),
      tags: z.string().optional(),
      project: z.string().optional(),
      library: z.string().optional(),
    },
  },
  async (input) => wrap(() => call("/log-decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, input.library || input.project)),
);

server.registerTool(
  "cm_done",
  {
    title: "Close a session",
    description: "Close a session unit on the librarian (HTTP /done). Skip if the user said not to remember.",
    inputSchema: {
      summary: z.string(),
      tags: z.string().optional(),
      title: z.string().optional(),
      project: z.string().optional(),
      library: z.string().optional(),
      cwd: z.string().optional(),
    },
  },
  async (input) => wrap(() => call("/done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, input.library || input.project)),
);

server.registerTool(
  "cm_keep",
  {
    title: "Keep an original",
    description: "Store an original. Prefers presigned PUT to R2 when the librarian has it; otherwise POST filename+content. Never path=.",
    inputSchema: {
      filename: z.string(),
      content: z.string(),
      title: z.string().optional(),
      tags: z.string().optional(),
      project: z.string().optional(),
      library: z.string().optional(),
    },
  },
  async (input) => wrap(async () => {
    const lib = input.library || input.project;
    const signRes = await librarianRequest("/keep/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: input.filename,
        title: input.title,
        tags: input.tags,
        library: lib,
        project: lib,
      }),
      library: lib,
    });
    if (signRes.status === 503) {
      return call("/keep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }, lib);
    }
    const signedText = await signRes.text();
    if (!signRes.ok) {
      try {
        const parsed = JSON.parse(signedText) as { error?: { message?: string } };
        throw new Error(parsed.error?.message || signedText);
      } catch (error) {
        if (error instanceof Error && error.message !== signedText) throw error;
        throw new Error(signedText || downMessage());
      }
    }
    const signed = JSON.parse(signedText) as { uploadId: string; putUrl: string; headers?: Record<string, string> };
    const put = await fetch(signed.putUrl, {
      method: "PUT",
      headers: signed.headers,
      body: input.content,
      signal: AbortSignal.timeout(300_000),
    });
    if (!put.ok) throw new Error(`Object store PUT failed (${put.status}).`);
    return call("/keep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploadId: signed.uploadId,
        filename: input.filename,
        title: input.title,
        tags: input.tags,
        library: lib,
        project: lib,
      }),
    }, lib);
  }),
);

server.registerTool(
  "cm_inbox",
  {
    title: "List inbox",
    description: "Inbox library files. apply=true moves only high-confidence items into another library.",
    inputSchema: { apply: z.boolean().optional() },
  },
  async ({ apply }) => wrap(() =>
    apply
      ? call("/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apply: true }) }, UNCLASSIFIED)
      : call("/inbox", {}, UNCLASSIFIED),
  ),
);

const transport = new StdioServerTransport();
await server.connect(transport);
