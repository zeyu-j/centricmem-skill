/**
 * core.ts — shared constants, path resolution, and file helpers.
 * Markdown files under .centricmem/projects/<slug>/ are the Source of Truth.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  findWorkspaceRoot,
  getCurrentProjectSlug,
  isWorkspace,
  UNCLASSIFIED,
} from "./workspace.js";

export const MEM_DIR = ".centricmem";
export const PROJECTS_DIR = "projects";
export const INDEX_DIR = ".index";
export const DB_FILE = "memory.db";

export interface MemPaths {
  workspaceRoot: string;
  projectSlug: string;
  /** Alias for workspaceRoot — relative paths are from workspace root. */
  root: string;
  memDir: string;
  agentsFile: string;
  activeContextFile: string;
  decisionsDir: string;
  lessonsFile: string;
  sessionsDir: string;
  indexDir: string;
  dbFile: string;
}

/**
 * Resolve memory paths for a workspace project.
 * @param workspaceRoot Directory containing .centricmem/workspace.json
 * @param projectSlug Project slug under projects/ (default: current from workspace.json or env)
 */
export function resolvePaths(workspaceRoot: string, projectSlug?: string): MemPaths {
  const wsRoot = path.resolve(workspaceRoot);
  if (!isWorkspace(wsRoot)) {
    throw new Error(`Not a CentricMem workspace: ${path.join(wsRoot, MEM_DIR)}. Run \`centricmem init\`.`);
  }
  const slug = projectSlug ?? getCurrentProjectSlug(wsRoot);
  const memDir = path.join(wsRoot, MEM_DIR, PROJECTS_DIR, slug);
  return {
    workspaceRoot: wsRoot,
    projectSlug: slug,
    root: wsRoot,
    memDir,
    agentsFile: path.join(memDir, "AGENTS.md"),
    activeContextFile: path.join(memDir, "active_context.md"),
    decisionsDir: path.join(memDir, "decisions"),
    lessonsFile: path.join(memDir, "lessons.md"),
    sessionsDir: path.join(memDir, "sessions"),
    indexDir: path.join(memDir, INDEX_DIR),
    dbFile: path.join(memDir, INDEX_DIR, DB_FILE),
  };
}

export { findWorkspaceRoot, UNCLASSIFIED };

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "untitled";
}

export function nextDecisionSeq(decisionsDir: string): number {
  if (!fs.existsSync(decisionsDir)) return 1;
  let max = 0;
  for (const f of fs.readdirSync(decisionsDir)) {
    const m = /^(\d{4})-/.exec(f);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

export function readFileIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

export function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function detectAgent(): string {
  if (process.env.CENTRICMEM_AGENT) return process.env.CENTRICMEM_AGENT;
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_SESSION) return "cursor";
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) return "claude-code";
  return "unknown";
}

export interface EmbeddingConfig {
  provider: string;
  model?: string;
  api_key_env?: string;
  dimensions?: number;
  base_url?: string;
  hybrid_alpha?: number;
}

export interface DomainBoostDimension {
  keywords: string[];
  path_prefix: string;
  boost?: number;
}

export interface DomainBoostConfig {
  default_boost?: number;
  dimensions: Record<string, DomainBoostDimension>;
}

export interface MetadataConfig {
  hot_columns?: string[];
  hot_columns_enabled?: boolean;
}

export interface MemConfig {
  decay_rate: number;
  max_results: number;
  ref_weight: number;
  embedding: EmbeddingConfig;
  remote_index_url?: string;
  domain_boost?: DomainBoostConfig;
  metadata?: MetadataConfig;
}

export const DEFAULT_CONFIG: MemConfig = {
  decay_rate: 0.01,
  max_results: 5,
  ref_weight: 0.1,
  embedding: { provider: "none", hybrid_alpha: 0.6 },
  metadata: {
    hot_columns: ["civilization", "type", "has_incantation"],
    hot_columns_enabled: false,
  },
};

export function loadConfig(paths: MemPaths): MemConfig {
  const file = path.join(paths.memDir, "config.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      embedding: { ...DEFAULT_CONFIG.embedding, ...(raw.embedding || {}) },
      metadata: { ...DEFAULT_CONFIG.metadata, ...(raw.metadata || {}) },
      domain_boost: raw.domain_boost,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
