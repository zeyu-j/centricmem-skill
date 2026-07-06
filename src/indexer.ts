/**
 * indexer.ts — SQLite FTS5 index over .centricmem/ Markdown files.
 *
 * Design:
 * - Memory-aware chunking: decision files are one chunk each; other .md files
 *   are split by `##` headings (falling back to whole file).
 * - Incremental indexing: per-file content SHA256 stored in `files`; unchanged
 *   files are skipped, changed files have their chunks replaced.
 * - Temporal-aware ranking: score = BM25 * time_decay * status_penalty * ref_boost * intent_boost
 * - DB connection: CLI opens/closes per command; MCP server reuses a single
 *   connection via getDb() for the process lifetime.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { MemPaths, sha256, ensureDir, loadConfig, MemConfig, resolvePaths } from "./core.js";
import { loadWorkspace } from "./workspace.js";
import {
  embedTexts,
  isEmbeddingEnabled,
  vectorToBlob,
  blobToVector,
  cosineSimilarity,
} from "./embedding.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single indexed memory unit (one decision record, or one ## section). */
export interface MemoryChunk {
  file: string;     // relative to memDir
  heading: string;
  content: string;
  docType: string;  // decision | context | rules | lessons | imported | other
  loggedAt: string; // ISO timestamp (best-effort)
  agent: string;    // source agent if detectable
  status: string;   // active | superseded | deprecated | historical
  supersededBy: string; // seq of the decision that replaced this one ("" if none)
}

/** A ranked search result returned by search(). */
export interface SearchResult {
  file: string;
  heading: string;
  snippet: string;
  docType: string;
  loggedAt: string;
  agent: string;
  status: string;
  supersededBy: string;
  score: number;
  projectSlug?: string;
  explain?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  bm25: number;
  cosine: number;
  relevance: number;
  timeDecay: number;
  statusPenalty: number;
  refBoost: number;
  intentBoost: number;
  feedbackPenalty: number;
  final: number;
}

export interface SearchOptions {
  explain?: boolean;
  semantic?: boolean;
  queryEmbedding?: number[];
}

export interface SearchFilters {
  /** Filter by memory type: decision | rule | lesson | context | imported. */
  type?: string;
  /** Filter by status: active | superseded | deprecated | historical. */
  status?: string;
  /** Filter by source agent: cursor | claude-code | migration | ... */
  agent?: string;
}

export interface IndexStats {
  scanned: number;
  indexed: number;
  removed: number;
  chunks: number;
  embedded?: number;
}

export interface BuildIndexOptions {
  embed?: boolean;
  mockEmbeddings?: number[][];
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function classifyDocType(relPath: string): string {
  if (relPath.startsWith("decisions/") || relPath.startsWith("decisions\\")) return "decision";
  if (relPath === "active_context.md") return "context";
  if (relPath === "AGENTS.md") return "rules";
  if (relPath === "lessons.md") return "lessons";
  if (relPath.startsWith("sessions/") || relPath.startsWith("sessions\\")) return "session";
  if (relPath.startsWith("imported/")) return "imported";
  return "other";
}

function extractMeta(content: string): { loggedAt?: string; agent?: string; status?: string; supersededBy?: string } {
  const meta: { loggedAt?: string; agent?: string; status?: string; supersededBy?: string } = {};
  const st = /\*\*Status\*\*:\s*(Superseded|Deprecated|Historical)/i.exec(content);
  if (st) meta.status = st[1].toLowerCase();
  const sb = /\*\*Superseded by\*\*:\s*#?(\d+)/.exec(content);
  if (sb) meta.supersededBy = sb[1];
  const at =
    /\*\*Logged at\*\*:\s*(\S+)/.exec(content) ||
    /updated_at=(\S+?)(?:\s|-->)/.exec(content) ||
    /imported_at=(\S+?)(?:\s|-->)/.exec(content);
  if (at) meta.loggedAt = at[1];
  const by =
    /\*\*Logged by\*\*:\s*(\S+)/.exec(content) ||
    /updated_by=(\S+?)(?:\s|-->)/.exec(content) ||
    /logged_by=(\S+?)(?:\s|-->)/.exec(content);
  if (by) meta.agent = by[1];
  return meta;
}

/** Split a markdown body by `##` headings, keeping the preamble as its own chunk. */
function splitByHeadings(content: string): { heading: string; body: string }[] {
  const lines = content.split("\n");
  const chunks: { heading: string; body: string }[] = [];
  let heading = "";
  let buf: string[] = [];
  const h1 = lines.find((l) => l.startsWith("# "));
  if (h1) heading = h1.slice(2).trim();

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) chunks.push({ heading, body });
    buf = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      heading = line.slice(3).trim();
    }
    buf.push(line);
  }
  flush();
  return chunks.length ? chunks : [{ heading, body: content.trim() }];
}

export function chunkFile(memDir: string, relPath: string): MemoryChunk[] {
  const abs = path.join(memDir, relPath);
  const content = fs.readFileSync(abs, "utf8");
  const docType = classifyDocType(relPath);
  const meta = extractMeta(content);
  const mtime = fs.statSync(abs).mtime.toISOString();
  const loggedAt = meta.loggedAt || mtime;
  const agent = meta.agent || "unknown";
  const status = meta.status || "active";

  const supersededBy = meta.supersededBy || "";

  if (docType === "decision") {
    const h1 = content.split("\n").find((l) => l.startsWith("# "));
    // Strip the H1 and metadata bullet lines from the indexed body so FTS5
    // snippets start at the real content (Context/Decision) instead of
    // "- **Status**: Accepted - **Logged at**: …". Metadata stays searchable
    // via the heading and structured columns.
    const body = content
      .split("\n")
      .filter((l) => !l.startsWith("# ") && !/^- \*\*(Status|Logged at|Logged by|Tags|Supersedes|Superseded by)\*\*:/.test(l))
      .join("\n")
      .trim();
    // Append tags as hidden searchable text so FTS5 can match tag words
    // even when the decision body doesn't contain them explicitly.
    const tagsLine = content.match(/^- \*\*Tags\*\*:\s*(.+)$/m);
    const tagsText = tagsLine
      ? "\ntags: " + tagsLine[1].split(",").map((t) => t.trim()).filter(Boolean).join(" ")
      : "";
    return [{ file: relPath, heading: h1 ? h1.slice(2).trim() : relPath, content: (body || content) + tagsText, docType, loggedAt, agent, status, supersededBy }];
  }

  return splitByHeadings(content).map((c) => {
    // Per-chunk agent attribution: imported rule blocks carry their own
    // provenance line, e.g. "> Source: `...` (imported <ISO> by migration)".
    const imp = /\(imported\s+(\S+?)\s+by\s+([\w-]+)\)/.exec(c.body);
    return {
      file: relPath, heading: c.heading, content: c.body, docType,
      loggedAt: imp?.[1] ?? loggedAt, agent: imp?.[2] ?? agent, status, supersededBy,
    };
  });
}

// ---------------------------------------------------------------------------
// Database — schema and connection helpers
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL,
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  agent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  superseded_by TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS refs (
  file TEXT NOT NULL,
  heading TEXT NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (file, heading)
);
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id INTEGER PRIMARY KEY,
  content_hash TEXT NOT NULL,
  embedding BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS chunk_feedback (
  file TEXT NOT NULL,
  heading TEXT NOT NULL,
  downvotes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (file, heading)
);
-- Standalone FTS table (not content=chunks): we index a CJK-bigram-segmented
-- copy of the text in 'seg' so compound CJK queries match, while 'heading' and
-- 'content' hold the raw text for snippets. Kept in sync manually in buildIndex.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  heading, content, seg, tokenize='unicode61'
);
`;

/** Schema version: bump when the FTS layout changes to force a clean rebuild. */
const SCHEMA_VERSION = 3;

/** Open (or create) the index database and apply the schema. */
export function openDb(paths: MemPaths): Database.Database {
  ensureDir(paths.indexDir);
  const db = new Database(paths.dbFile);
  db.pragma("journal_mode = WAL");
  // Version check: the index is fully derivative, so on any schema change we
  // simply drop everything and let buildIndex repopulate from Markdown.
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version !== SCHEMA_VERSION) {
    db.exec(`
      DROP TABLE IF EXISTS chunks_fts;
      DROP TRIGGER IF EXISTS chunks_ai;
      DROP TRIGGER IF EXISTS chunks_ad;
      DROP TABLE IF EXISTS chunk_embeddings;
      DROP TABLE IF EXISTS chunks;
      DROP TABLE IF EXISTS files;
    `);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  db.exec(SCHEMA);
  return db;
}

/**
 * Return a cached db connection for long-lived processes (e.g. MCP server).
 * CLI commands should use openDb() + db.close() directly.
 */
const _dbCache = new Map<string, Database.Database>();
export function getDb(paths: MemPaths): Database.Database {
  let db = _dbCache.get(paths.dbFile);
  if (!db || !db.open) {
    db = openDb(paths);
    _dbCache.set(paths.dbFile, db);
  }
  return db;
}

/** Close all cached DB connections (call on process exit). */
export function closeAllCached(): void {
  for (const [key, db] of _dbCache) {
    try { if (db.open) db.close(); } catch { /* ignore */ }
    _dbCache.delete(key);
  }
}

function normalizeRelPath(rel: string): string {
  return rel.replace(/\\/g, "/");
}

function listMarkdownFiles(memDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".md")) out.push(normalizeRelPath(path.relative(memDir, abs)));
    }
  };
  walk(memDir);
  return out;
}

// ---------------------------------------------------------------------------
// Memory Map auto-update
// ---------------------------------------------------------------------------

const MAP_BLOCK_RE = /<!-- (?:centricmem|memproject):map -->[\s\S]*?<!-- \/(?:centricmem|memproject):map -->/;

/**
 * Regenerate the <!-- centricmem:map --> block in AGENTS.md after indexing.
 * If the markers are absent, inserts them under ## Memory Map (or appends at EOF).
 */
export function updateMemoryMap(paths: MemPaths, stats: IndexStats): void {
  if (!fs.existsSync(paths.agentsFile)) return;
  const agentsContent = fs.readFileSync(paths.agentsFile, "utf8");

  // Count decisions and their statuses from the decisions/ dir.
  let totalDecisions = 0;
  let activeDecisions = 0;
  let supersededDecisions = 0;
  let lastDecisionDate = "\u2014";
  if (fs.existsSync(paths.decisionsDir)) {
    const files = fs.readdirSync(paths.decisionsDir).filter((f) => f.endsWith(".md")).sort();
    totalDecisions = files.length;
    for (const f of files) {
      const content = fs.readFileSync(path.join(paths.decisionsDir, f), "utf8");
      const st = /\*\*Status\*\*:\s*(\S+)/i.exec(content)?.[1]?.toLowerCase() ?? "accepted";
      if (/superseded|deprecated|historical/.test(st)) supersededDecisions++;
      else activeDecisions++;
      const at = /\*\*Logged at\*\*:\s*(\S+)/.exec(content)?.[1];
      if (at && (lastDecisionDate === "\u2014" || at > lastDecisionDate)) lastDecisionDate = at.slice(0, 10);
    }
  }

  // Count rules: bullet lines in Global Rules + imported rule sections
  // ("## Imported: …" / sections carrying an "imported … by" provenance line).
  const rulesSection = /## Global Rules\n([\s\S]*?)(?:\n## |$)/.exec(agentsContent)?.[1] ?? "";
  let rulesCount = (rulesSection.match(/^[-*]\s+/gm) ?? []).length;
  rulesCount += (agentsContent.match(/^> Source: .*\(imported .* by [\w-]+\)/gm) ?? []).length;

  // Count lessons headings.
  let lessonsCount = 0;
  if (fs.existsSync(paths.lessonsFile)) {
    const lc = fs.readFileSync(paths.lessonsFile, "utf8");
    lessonsCount = (lc.match(/^##\s+/gm) ?? []).length;
  }

  // Count imported files (recursively — migrations may create subdirectories).
  const importedDir = path.join(paths.memDir, "imported");
  let importedCount = 0;
  if (fs.existsSync(importedDir)) {
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(dir, e.name));
        else if (e.name.endsWith(".md")) importedCount++;
      }
    };
    walk(importedDir);
  }

  let sessionsCount = 0;
  const sessionsDir = path.join(paths.memDir, "sessions");
  if (fs.existsSync(sessionsDir)) {
    sessionsCount = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).length;
  }

  const decisionLabel =
    supersededDecisions > 0
      ? `${totalDecisions} (${activeDecisions} active, ${supersededDecisions} superseded)`
      : String(totalDecisions);

  const now = new Date().toISOString();
  const block = [
    "<!-- centricmem:map -->",
    "| Type | Count | Last Updated |",
    "|------|-------|--------------|",
    `| Decisions | ${decisionLabel} | ${lastDecisionDate} |`,
    `| Rules | ${rulesCount} | \u2014 |`,
    `| Lessons | ${lessonsCount} | \u2014 |`,
    `| Imported | ${importedCount} | \u2014 |`,
    `| Sessions | ${sessionsCount} | \u2014 |`,
    "",
    `Last indexed: ${now} | Total chunks: ${stats.chunks}`,
    "<!-- /centricmem:map -->",
  ].join("\n");

  let updated: string;
  if (MAP_BLOCK_RE.test(agentsContent)) {
    updated = agentsContent.replace(MAP_BLOCK_RE, block);
  } else {
    // Insert under ## Memory Map heading, or append at EOF.
    const mapHeading = /^## Memory Map$/m.exec(agentsContent);
    if (mapHeading) {
      const insertAt = (mapHeading.index ?? 0) + mapHeading[0].length;
      updated = agentsContent.slice(0, insertAt) + "\n\n" + block + agentsContent.slice(insertAt);
    } else {
      updated = agentsContent.trimEnd() + "\n\n## Memory Map\n\n" + block + "\n";
    }
  }
  fs.writeFileSync(paths.agentsFile, updated, "utf8");
}

/** Incrementally (re)build the index. Always opens its own connection and closes it. */
export function buildIndex(paths: MemPaths): IndexStats {
  const db = openDb(paths);
  const files = listMarkdownFiles(paths.memDir);
  const stats: IndexStats = { scanned: files.length, indexed: 0, removed: 0, chunks: 0 };

  const getHash = db.prepare("SELECT hash FROM files WHERE path = ?");
  const upsertFile = db.prepare(
    "INSERT INTO files(path, hash, indexed_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET hash=excluded.hash, indexed_at=excluded.indexed_at"
  );
  const selChunkIds = db.prepare("SELECT id FROM chunks WHERE file = ?");
  const delEmb = db.prepare("DELETE FROM chunk_embeddings WHERE chunk_id = ?");
  const delFts = db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
  const delChunksStmt = db.prepare("DELETE FROM chunks WHERE file = ?");
  const delChunks = (rel: string) => {
    for (const r of selChunkIds.all(rel) as { id: number }[]) {
      delFts.run(r.id);
      delEmb.run(r.id);
    }
    delChunksStmt.run(rel);
  };
  const insChunk = db.prepare(
    "INSERT INTO chunks(file, heading, content, doc_type, logged_at, agent, status, superseded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insFts = db.prepare("INSERT INTO chunks_fts(rowid, heading, content, seg) VALUES (?, ?, ?, ?)");

  const tx = db.transaction(() => {
    for (const rel of files) {
      const content = fs.readFileSync(path.join(paths.memDir, rel), "utf8");
      const hash = sha256(content);
      const row = getHash.get(rel) as { hash: string } | undefined;
      if (row && row.hash === hash) continue;
      delChunks(rel);
      for (const c of chunkFile(paths.memDir, rel)) {
        const info = insChunk.run(c.file, c.heading, c.content, c.docType, c.loggedAt, c.agent, c.status, c.supersededBy);
        insFts.run(info.lastInsertRowid, c.heading, c.content, segmentCjk(`${c.heading}\n${c.content}`));
        stats.chunks++;
      }
      upsertFile.run(rel, hash, new Date().toISOString());
      stats.indexed++;
    }
    const known = (db.prepare("SELECT path FROM files").all() as { path: string }[]).map((r) => r.path);
    for (const p of known) {
      if (!files.includes(p)) {
        delChunks(p);
        db.prepare("DELETE FROM files WHERE path = ?").run(p);
        stats.removed++;
      }
    }
  });
  tx();
  // Invalidate any cached connection so next getDb() picks up the fresh WAL.
  const cached = _dbCache.get(paths.dbFile);
  if (cached && cached !== db) { try { cached.close(); } catch { /* ignore */ } _dbCache.delete(paths.dbFile); }
  db.close();
  // Update Memory Map in AGENTS.md (best-effort, never throws).
  try { updateMemoryMap(paths, stats); } catch { /* ignore */ }
  return stats;
}

/**
 * Embed chunks whose embedding is missing or stale (content hash changed).
 * Used by buildIndexAsync; tests inject mockVectors to avoid network.
 */
export async function embedChunks(
  paths: MemPaths,
  opts?: { mockVectors?: number[][] },
): Promise<{ embedded: number }> {
  const config = loadConfig(paths);
  if (!opts?.mockVectors && !isEmbeddingEnabled(config)) return { embedded: 0 };

  const db = openDb(paths);
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.heading, c.content, e.content_hash AS eh
         FROM chunks c LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id`,
      )
      .all() as { id: number; heading: string; content: string; eh: string | null }[];
    const need = rows.filter((r) => sha256(`${r.heading}\n${r.content}`) !== r.eh);
    if (!need.length) return { embedded: 0 };

    const embeddings =
      opts?.mockVectors && opts.mockVectors.length >= need.length
        ? opts.mockVectors.slice(0, need.length)
        : await embedTexts(need.map((r) => `${r.heading}\n${r.content}`.slice(0, 8000)), config);
    if (embeddings.length !== need.length) return { embedded: 0 };

    const upsert = db.prepare(
      `INSERT INTO chunk_embeddings(chunk_id, content_hash, embedding) VALUES (?, ?, ?)
       ON CONFLICT(chunk_id) DO UPDATE SET content_hash=excluded.content_hash, embedding=excluded.embedding`,
    );
    db.transaction(() => {
      for (let i = 0; i < need.length; i++) {
        upsert.run(need[i].id, sha256(`${need[i].heading}\n${need[i].content}`), vectorToBlob(embeddings[i]));
      }
    })();
    return { embedded: need.length };
  } finally {
    db.close();
  }
}

/** Index + embed. Embeds when configured (or forced via opts.embed / mockEmbeddings). */
export async function buildIndexAsync(paths: MemPaths, opts?: BuildIndexOptions): Promise<IndexStats> {
  const stats = buildIndex(paths);
  if (opts?.embed === false) return stats;
  if (opts?.embed || opts?.mockEmbeddings || isEmbeddingEnabled(loadConfig(paths))) {
    stats.embedded = (await embedChunks(paths, { mockVectors: opts?.mockEmbeddings })).embedded;
  }
  return stats;
}

/** Index every project registered in the workspace. */
export function buildIndexAll(workspaceRoot: string): IndexStats {
  const ws = loadWorkspace(workspaceRoot);
  const total: IndexStats = { scanned: 0, indexed: 0, removed: 0, chunks: 0 };
  for (const slug of Object.keys(ws.projects)) {
    const s = buildIndex(resolvePaths(workspaceRoot, slug));
    total.scanned += s.scanned;
    total.indexed += s.indexed;
    total.removed += s.removed;
    total.chunks += s.chunks;
  }
  return total;
}

/** Search across all projects in a workspace; merges and re-ranks results. */
export function searchAll(
  workspaceRoot: string,
  query: string,
  limit?: number,
  filters?: SearchFilters,
): SearchResult[] {
  const ws = loadWorkspace(workspaceRoot);
  const config = loadConfig(resolvePaths(workspaceRoot, ws.current));
  const max = limit ?? config.max_results;
  const merged: SearchResult[] = [];
  for (const slug of Object.keys(ws.projects)) {
    const paths = resolvePaths(workspaceRoot, slug);
    const hits = search(paths, query, max * 3, filters);
    for (const h of hits) merged.push({ ...h, projectSlug: slug });
  }
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, max);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

// FTS5 reserved words that must not appear bare as query terms.
const FTS5_RESERVED = new Set(["AND", "OR", "NOT", "NEAR"]);

const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]{2,}/g;

/**
 * Segment contiguous CJK runs into space-separated overlapping bigrams so that
 * compound words match regardless of surrounding characters.
 * unicode61 treats a whole CJK run as one token, so "会话缓存" would never
 * match inside "做会话缓存" without this. Applied to BOTH indexed text and queries.
 */
export function segmentCjk(text: string): string {
  return text.replace(CJK_RUN, (run) => {
    const grams: string[] = [];
    for (let i = 0; i < run.length - 1; i++) grams.push(run.slice(i, i + 2));
    return grams.join(" ");
  });
}

/** Escape a user query into a safe FTS5 query (OR of prefix terms; CJK bigram phrases). */
function toFtsQuery(query: string): string {
  const terms = segmentCjk(query)
    .split(/\s+/)
    .map((t) => t.replace(/["'*()]/g, "").trim())
    .filter(Boolean);
  if (!terms.length) return '""';
  // Wrap each term in double quotes; FTS5 reserved words are already safe when quoted.
  return terms.map((t) => (FTS5_RESERVED.has(t.toUpperCase()) ? `"${t}"` : `"${t}"*`)).join(" OR ");
}

/** Time decay: 1 / (1 + decay_rate * days_old). */
function timeDecay(loggedAt: string, decayRate: number): number {
  const t = Date.parse(loggedAt);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = Math.max(0, (Date.now() - t) / 86400000);
  return 1 / (1 + decayRate * ageDays);
}

// ---------------------------------------------------------------------------
// Query Intent Router
// ---------------------------------------------------------------------------

export type QueryIntent = "context" | "decision" | "lessons" | "research" | "general";

const INTENT_RULES: { intent: QueryIntent; patterns: RegExp }[] = [
  { intent: "context", patterns: /当前|现在|正在|进展|current|right now|working on|today|focus/i },
  { intent: "decision", patterns: /为什么|决策|选择|决定|why|decision|decided|chose|choice|rationale/i },
  { intent: "lessons", patterns: /避免|坑|注意|教训|pitfall|avoid|gotcha|lesson|careful|went wrong|mistake|failure/i },
  { intent: "research", patterns: /调研|研究|survey|research|external|文献|对比/i },
];

export function classifyIntent(query: string): QueryIntent {
  for (const rule of INTENT_RULES) {
    if (rule.patterns.test(query)) return rule.intent;
  }
  return "general";
}

function intentBoost(intent: QueryIntent, docType: string): number {
  if (intent === "context" && docType === "context") return 2.0;
  if (intent === "decision" && docType === "decision") return 2.0;
  if (intent === "lessons" && docType === "lessons") return 2.0;
  if (intent === "research" && docType === "imported") return 2.0;
  return 1.0;
}

function feedbackPenalty(conn: Database.Database, file: string, heading: string): number {
  const row = conn
    .prepare("SELECT downvotes FROM chunk_feedback WHERE file = ? AND heading = ?")
    .get(normalizeRelPath(file), heading) as { downvotes: number } | undefined;
  if (!row?.downvotes) return 1;
  return Math.max(0.1, 1 / (1 + row.downvotes * 0.7));
}

/** Record negative feedback — down-rank a chunk in future searches. */
export function dismissChunk(paths: MemPaths, file: string, heading?: string): void {
  const db = openDb(paths);
  const normFile = normalizeRelPath(file);
  try {
    if (heading) {
      db.prepare(
        `INSERT INTO chunk_feedback(file, heading, downvotes) VALUES (?, ?, 1)
         ON CONFLICT(file, heading) DO UPDATE SET downvotes = downvotes + 1`,
      ).run(normFile, heading);
    } else {
      const rows = db.prepare("SELECT heading FROM chunks WHERE file = ?").all(normFile) as { heading: string }[];
      const bump = db.prepare(
        `INSERT INTO chunk_feedback(file, heading, downvotes) VALUES (?, ?, 1)
         ON CONFLICT(file, heading) DO UPDATE SET downvotes = downvotes + 1`,
      );
      for (const r of rows) bump.run(normFile, r.heading);
    }
  } finally {
    db.close();
  }
}

/** Map user-facing type names to internal doc_type values. */
function normalizeTypeFilter(type: string): string {
  const t = type.toLowerCase();
  if (t === "rule" || t === "rules") return "rules";
  if (t === "lesson" || t === "lessons") return "lessons";
  return t;
}

/**
 * Search the index.
 * - If the db file doesn't exist, builds the index first (first-run bootstrap).
 * - Does NOT call buildIndex on every search — callers that write new data are
 *   responsible for triggering buildIndex themselves.
 * - Accepts an optional `db` parameter so MCP server can reuse a single connection.
 */
export function search(
  paths: MemPaths,
  query: string,
  limit?: number,
  filters?: SearchFilters,
  db?: Database.Database,
  options?: SearchOptions,
): SearchResult[] {
  // Bootstrap: if no db file exists at all, build once.
  if (!fs.existsSync(paths.dbFile)) buildIndex(paths);

  const config: MemConfig = loadConfig(paths);
  const rawMax = limit ?? config.max_results;
  const max = Number.isFinite(Number(rawMax)) && Number(rawMax) > 0 ? Math.floor(Number(rawMax)) : config.max_results;
  const intent = classifyIntent(query);
  const ownDb = !db;
  const conn = db ?? openDb(paths);
  const alpha = config.embedding?.hybrid_alpha ?? 0.6;
  const useSemantic = options?.semantic && (options.queryEmbedding?.length || isEmbeddingEnabled(config));

  try {
    const conds: string[] = ["chunks_fts MATCH ?"];
    const params: unknown[] = [toFtsQuery(query)];
    if (filters?.type) {
      conds.push("c.doc_type = ?");
      params.push(normalizeTypeFilter(filters.type));
    }
    if (filters?.status) {
      conds.push("c.status = ?");
      params.push(filters.status.toLowerCase());
    }
    if (filters?.agent) {
      conds.push("c.agent = ?");
      params.push(filters.agent.toLowerCase());
    }
    params.push(max * 5);

    const rows = conn
      .prepare(
        `SELECT c.id, c.file, c.heading, c.doc_type, c.logged_at, c.agent, c.status, c.superseded_by,
                snippet(chunks_fts, 1, '**', '**', ' … ', 24) AS snip,
                bm25(chunks_fts, 4.0, 2.0, 1.0) AS rank
         FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
         WHERE ${conds.join(" AND ")}
         ORDER BY rank LIMIT ?`,
      )
      .all(...params) as {
      id: number;
      file: string; heading: string; doc_type: string; logged_at: string;
      agent: string; status: string; superseded_by: string; snip: string; rank: number;
    }[];

    const getRef = conn.prepare("SELECT ref_count FROM refs WHERE file = ? AND heading = ?");
    const getEmb = conn.prepare("SELECT embedding FROM chunk_embeddings WHERE chunk_id = ?");

    // Semantic mode needs a precomputed query vector (searchAsync embeds it).
    const queryVec = options?.queryEmbedding;

    const bm25Scores = rows.map((r) => -r.rank);
    const bm25Max = Math.max(...bm25Scores, 0.001);

    const results: SearchResult[] = rows.map((r) => {
      const bm25Norm = (-r.rank) / bm25Max;
      let cosine = 0;
      if (useSemantic && queryVec?.length) {
        const embRow = getEmb.get(r.id) as { embedding: Buffer } | undefined;
        if (embRow) cosine = Math.max(0, cosineSimilarity(queryVec, blobToVector(embRow.embedding)));
      }
      const relevance = useSemantic && queryVec?.length
        ? alpha * bm25Norm + (1 - alpha) * cosine
        : bm25Norm;
      const td = timeDecay(r.logged_at, config.decay_rate);
      const statusPenalty = r.status === "active" ? 1 : 0.1;
      const refRow = getRef.get(r.file, r.heading) as { ref_count: number } | undefined;
      const refCount = refRow?.ref_count ?? 0;
      const refBoost = 1 + config.ref_weight * Math.log(1 + refCount);
      const ib = intentBoost(intent, r.doc_type);
      const fb = feedbackPenalty(conn, r.file, r.heading);
      const score = relevance * td * statusPenalty * refBoost * ib * fb;
      const result: SearchResult = {
        file: r.file,
        heading: r.heading,
        snippet: r.snip,
        docType: r.doc_type,
        loggedAt: r.logged_at,
        agent: r.agent,
        status: r.status,
        supersededBy: r.superseded_by ?? "",
        score,
      };
      if (options?.explain) {
        result.explain = {
          bm25: bm25Norm,
          cosine,
          relevance,
          timeDecay: td,
          statusPenalty,
          refBoost,
          intentBoost: ib,
          feedbackPenalty: fb,
          final: score,
        };
      }
      return result;
    });

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, max);

    const bumpRef = conn.prepare(
      "INSERT INTO refs(file, heading, ref_count) VALUES (?, ?, 1) ON CONFLICT(file, heading) DO UPDATE SET ref_count = ref_count + 1",
    );
    for (const r of top) bumpRef.run(r.file, r.heading);

    return top;
  } finally {
    if (ownDb) conn.close();
  }
}

/** Async search with optional semantic embedding of query. */
export async function searchAsync(
  paths: MemPaths,
  query: string,
  limit?: number,
  filters?: SearchFilters,
  options?: SearchOptions,
): Promise<SearchResult[]> {
  const config = loadConfig(paths);
  let queryEmbedding = options?.queryEmbedding;
  if (options?.semantic && isEmbeddingEnabled(config) && !queryEmbedding?.length) {
    const vecs = await embedTexts([query], config);
    queryEmbedding = vecs[0];
  }
  return search(paths, query, limit, filters, undefined, { ...options, queryEmbedding });
}
