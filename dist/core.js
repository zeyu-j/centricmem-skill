/**
 * core.ts — shared constants, path resolution, and file helpers.
 * Product hub lives at CENTRICMEM_HOME (~/.centricmem); Markdown under projects/<slug>/ is SOT.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { findWorkspaceRoot, getCurrentProjectSlug, isWorkspace, UNCLASSIFIED, } from "./workspace.js";
/** Legacy nested folder name inside a code repo (migrate-from-local). */
export const LOCAL_MEM_DIR = ".centricmem";
/** @deprecated Use product home layout; kept for migrate path detection. */
export const MEM_DIR = LOCAL_MEM_DIR;
export const PROJECTS_DIR = "projects";
export const SKILLS_DIR = "skills";
export const INDEX_DIR = ".index";
export const DB_FILE = "memory.db";
/**
 * Agent-side product hub (not inside a code git repo).
 * CENTRICMEM_HOME, else CENTRICMEM_WORKSPACE (legacy alias), else ~/.centricmem.
 */
export function getProductHome() {
    const env = process.env.CENTRICMEM_HOME || process.env.CENTRICMEM_WORKSPACE;
    if (env?.trim())
        return path.resolve(env.trim());
    return path.join(os.homedir(), ".centricmem");
}
export function projectMemDir(workspaceRoot, slug) {
    return path.join(workspaceRoot, PROJECTS_DIR, slug);
}
export function skillsDir(workspaceRoot) {
    return path.join(workspaceRoot, SKILLS_DIR);
}
/**
 * Resolve memory paths for a project under the product hub.
 * @param workspaceRoot Product home (contains workspace.json + projects/)
 * @param projectSlug Project slug under projects/ (default: current or cwd match)
 */
export function resolvePaths(workspaceRoot, projectSlug) {
    const wsRoot = path.resolve(workspaceRoot);
    if (!isWorkspace(wsRoot)) {
        throw new Error(`Not a CentricMem hub: ${path.join(wsRoot, "workspace.json")}. Run \`centricmem init\`.`);
    }
    const slug = projectSlug ?? getCurrentProjectSlug(wsRoot);
    const memDir = projectMemDir(wsRoot, slug);
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
export function sha256(content) {
    return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}
export function nowISO() {
    return new Date().toISOString();
}
export function slugify(title) {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return slug || "untitled";
}
export function nextDecisionSeq(decisionsDir) {
    if (!fs.existsSync(decisionsDir))
        return 1;
    let max = 0;
    for (const f of fs.readdirSync(decisionsDir)) {
        const m = /^(\d{4})-/.exec(f);
        if (m)
            max = Math.max(max, parseInt(m[1], 10));
    }
    return max + 1;
}
export function readFileIfExists(p) {
    try {
        return fs.readFileSync(p, "utf8");
    }
    catch {
        return null;
    }
}
export function ensureDir(p) {
    fs.mkdirSync(p, { recursive: true });
}
/**
 * Join `relPath` under `rootDir` and reject escapes (absolute paths, `..`, empty).
 * Returns a normalized relative path (posix separators) and the absolute destination.
 */
export function resolveUnderDir(rootDir, relPath) {
    const raw = relPath.replace(/\\/g, "/");
    if (!raw || path.isAbsolute(raw) || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) {
        throw new Error(`Unsafe import path (absolute or empty): ${relPath}`);
    }
    const parts = raw.split("/");
    for (const part of parts) {
        if (part === "" || part === "." || part === ".." || part === "~") {
            throw new Error(`Unsafe import path segment: ${relPath}`);
        }
    }
    const rootResolved = path.resolve(rootDir);
    const abs = path.resolve(rootResolved, ...parts);
    const relPosix = path.relative(rootResolved, abs).replace(/\\/g, "/");
    if (!relPosix ||
        relPosix === ".." ||
        relPosix.startsWith("../") ||
        path.isAbsolute(relPosix)) {
        throw new Error(`Import path escapes root ${rootResolved}: ${relPath}`);
    }
    return { rel: relPosix, abs };
}
export function detectAgent() {
    if (process.env.CENTRICMEM_AGENT)
        return process.env.CENTRICMEM_AGENT;
    if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_SESSION)
        return "cursor";
    if (process.env.CLAUDECODE || process.env.CLAUDE_CODE)
        return "claude-code";
    return "unknown";
}
export const DEFAULT_CONFIG = {
    decay_rate: 0.01,
    max_results: 5,
    ref_weight: 0.1,
    embedding: { provider: "none", hybrid_alpha: 0.6, rrf_k: 60 },
    metadata: {
        hot_columns: ["civilization", "type", "has_incantation"],
        hot_columns_enabled: false,
    },
};
export function loadConfig(paths) {
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
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
