/**
 * core.ts — shared constants, path resolution, and file helpers.
 * Product hub (memory library) lives at CENTRICMEM_HOME; Markdown under projects/<slug>/ is SOT.
 * Client install (CLI/skill source) is a separate path — Steam-style.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { findWorkspaceRoot, getCurrentProjectSlug, isWorkspace, UNCLASSIFIED, } from "./workspace.js";
/** Legacy nested folder name inside a code repo (migrate-from-local). */
export const LOCAL_MEM_DIR = ".centricmem";
/** @deprecated Use product home layout; kept for migrate path detection. */
export const MEM_DIR = LOCAL_MEM_DIR;
export const PROJECTS_DIR = "projects";
export const SKILLS_DIR = "skills";
export const INDEX_DIR = ".index";
export const DB_FILE = "memory.db";
/** Hub files copied by `setup --migrate-home` (never src/, dist/, node_modules). */
export const HUB_TOP_FILES = ["workspace.json", "manager.json", ".ambient.md"];
export const HUB_TOP_DIRS = ["projects", "skills"];
/**
 * True when `dir` is a CentricMem *client* (CLI source/install), not a memory library.
 */
export function looksLikeClientFolder(dir) {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath))
        return false;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const bin = pkg.bin && typeof pkg.bin === "object" ? pkg.bin : {};
        const hasCli = Boolean(bin.centricmem);
        const hasSrc = fs.existsSync(path.join(dir, "src", "cli.ts")) ||
            fs.existsSync(path.join(dir, "dist", "cli.js"));
        return (pkg.name === "centricmem" && (hasCli || hasSrc)) || (hasCli && hasSrc);
    }
    catch {
        return false;
    }
}
export function assertLibraryPath(home) {
    if (!looksLikeClientFolder(home))
        return;
    throw new Error([
        `Refusing to use the CentricMem client folder as the memory library:`,
        `  ${path.resolve(home)}`,
        `Choose a library path (Steam-style: client vs games):`,
        `  centricmem setup --workspace <path> --persist-home`,
    ].join("\n"));
}
/** `%APPDATA%/centricmem/home.json` or `$XDG_CONFIG_HOME/centricmem/home.json`. Override with CENTRICMEM_HOME_POINTER. */
export function productHomePointerPath() {
    if (process.env.CENTRICMEM_HOME_POINTER?.trim()) {
        return path.resolve(process.env.CENTRICMEM_HOME_POINTER.trim());
    }
    if (process.platform === "win32") {
        const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(appdata, "centricmem", "home.json");
    }
    const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(xdg, "centricmem", "home.json");
}
export function readPersistedProductHome() {
    const file = productHomePointerPath();
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof raw.home === "string" && raw.home.trim())
            return path.resolve(raw.home.trim());
    }
    catch {
        /* missing or invalid */
    }
    return null;
}
function persistWindowsUserEnv(name, value) {
    const escaped = value.replace(/'/g, "''");
    spawnSync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `[Environment]::SetEnvironmentVariable('${name}', '${escaped}', 'User')`,
    ], { windowsHide: true, encoding: "utf8" });
}
export function persistProductHome(home, opts = {}) {
    const resolved = path.resolve(home);
    const pointer = productHomePointerPath();
    fs.mkdirSync(path.dirname(pointer), { recursive: true });
    fs.writeFileSync(pointer, JSON.stringify({ home: resolved }, null, 2) + "\n", "utf8");
    process.env.CENTRICMEM_HOME = resolved;
    if (opts.userEnv !== false && process.platform === "win32") {
        persistWindowsUserEnv("CENTRICMEM_HOME", resolved);
    }
    return pointer;
}
export function resolveProductHome() {
    const env = (process.env.CENTRICMEM_HOME || process.env.CENTRICMEM_WORKSPACE)?.trim();
    const persisted = readPersistedProductHome();
    if (env) {
        const resolved = path.resolve(env);
        if (!looksLikeClientFolder(resolved)) {
            return { home: resolved, source: "env" };
        }
        if (persisted && !looksLikeClientFolder(persisted)) {
            return { home: persisted, source: "env-client-ignored" };
        }
        return { home: resolved, source: "env" };
    }
    if (persisted)
        return { home: persisted, source: "pointer" };
    return { home: path.join(os.homedir(), ".centricmem"), source: "default" };
}
/**
 * Agent-side memory library (not the CLI install folder).
 * CENTRICMEM_HOME, else persisted pointer, else ~/.centricmem.
 * If env points at the client folder and a library pointer exists, the pointer wins.
 */
export function getProductHome() {
    return resolveProductHome().home;
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
const SECRET_ASSIGN = /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|auth(?:entication)?[_-]?token|authorization|bearer|private[_-]?key)\b(\s*[=:]\s*)(?:["']?)([^\s"'&,;]+)/gi;
const WELL_KNOWN_SECRETS = [
    /\bghp_[A-Za-z0-9_]{20,}/g,
    /\bgho_[A-Za-z0-9_]{20,}/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
    /\bsk-[A-Za-z0-9]{20,}/g,
    /\bAKIA[0-9A-Z]{16}/g,
    /\bBearer\s+[A-Za-z0-9._\-+/=]+/gi,
];
/**
 * Strip credential-shaped strings. `values` (default) keeps words like
 * "password" in prose; `ambient` also masks those words in preflight tails.
 */
export function redactSecrets(text, mode = "values") {
    if (!text)
        return text;
    let out = text;
    for (const re of WELL_KNOWN_SECRETS) {
        re.lastIndex = 0;
        out = out.replace(re, "[redacted]");
    }
    SECRET_ASSIGN.lastIndex = 0;
    out = out.replace(SECRET_ASSIGN, (_m, key, punct) => `${key}${punct}[redacted]`);
    if (mode === "ambient") {
        out = out.replace(/\b(password|passwd|pwd|secret|api[_-]?key|private[_-]?key)\b/gi, "[redacted]");
    }
    return out;
}
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
