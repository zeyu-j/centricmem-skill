/**
 * workspace.ts — multi-project hub under CENTRICMEM_HOME (projects/<slug>/).
 */
import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  nowISO,
  slugify,
  LOCAL_MEM_DIR,
  getProductHome,
  projectMemDir,
  looksLikeClientFolder,
} from "./core.js";
import {
  agentsTemplate,
  activeContextTemplate,
  lessonsTemplate,
  indexGitignore,
} from "./templates.js";
import { healthCheck } from "./memory.js";

export const UNCLASSIFIED = "unclassified";
export const WORKSPACE_FILE = "workspace.json";

export interface ProjectEntry {
  path: string;
  linked_at: string;
  system?: boolean;
  /** Absolute path to the linked code directory (optional). */
  sourceDir?: string;
}

export interface WorkspaceConfig {
  version: 1;
  current: string;
  projects: Record<string, ProjectEntry>;
}

export function workspaceFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, WORKSPACE_FILE);
}

export function isWorkspace(workspaceRoot: string): boolean {
  return fs.existsSync(workspaceFilePath(workspaceRoot));
}

export function loadWorkspace(workspaceRoot: string): WorkspaceConfig {
  const file = workspaceFilePath(workspaceRoot);
  if (!fs.existsSync(file)) {
    throw new Error(`No workspace found at ${file}. Run \`centricmem init\` first.`);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as WorkspaceConfig;
  if (raw.version !== 1) throw new Error(`Unsupported workspace version: ${raw.version}`);
  return raw;
}

export function saveWorkspace(workspaceRoot: string, config: WorkspaceConfig): void {
  ensureDir(workspaceRoot);
  fs.writeFileSync(workspaceFilePath(workspaceRoot), JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function projectSlugFromName(name: string): string {
  return slugify(name).replace(/^-+|-+$/g, "") || "project";
}

/**
 * Product hub root. Prefer CENTRICMEM_HOME hub; do not treat code-repo/.centricmem as the hub.
 */
export function findWorkspaceRoot(_startDir: string = process.cwd()): string | null {
  const home = getProductHome();
  if (isWorkspace(home)) return home;
  return null;
}

/** Legacy code-repo nested hub (repo/.centricmem/workspace.json). */
export function findLocalLegacyHub(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  while (true) {
    const nested = path.join(dir, LOCAL_MEM_DIR);
    if (fs.existsSync(path.join(nested, WORKSPACE_FILE))) return nested;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}

/** Match cwd to a linked project's sourceDir (longest prefix wins). */
export function matchProjectByCwd(workspaceRoot: string, cwd: string = process.cwd()): string | null {
  const ws = loadWorkspace(workspaceRoot);
  const needle = normalizePath(cwd);
  let best: { slug: string; len: number } | null = null;
  for (const [slug, entry] of Object.entries(ws.projects)) {
    if (!entry.sourceDir) continue;
    const root = normalizePath(entry.sourceDir);
    if (needle === root || needle.startsWith(root + "/")) {
      if (!best || root.length > best.len) best = { slug, len: root.length };
    }
  }
  return best?.slug ?? null;
}

export function getCurrentProjectSlug(workspaceRoot: string, cwd: string = process.cwd()): string {
  if (process.env.CENTRICMEM_PROJECT) return process.env.CENTRICMEM_PROJECT;
  const matched = matchProjectByCwd(workspaceRoot, cwd);
  if (matched) return matched;
  return UNCLASSIFIED;
}

/** `use` pin — display only. Writes do not fall back to this. */
export function getWorkspaceCurrent(workspaceRoot: string): string {
  return loadWorkspace(workspaceRoot).current;
}

export function listProjects(workspaceRoot: string): { slug: string; entry: ProjectEntry; current: boolean }[] {
  const ws = loadWorkspace(workspaceRoot);
  const pinned = ws.current;
  return Object.entries(ws.projects).map(([slug, entry]) => ({
    slug,
    entry,
    current: slug === pinned,
  }));
}

export interface WorkspaceInitResult {
  created: string[];
  skipped: string[];
}

/** Scaffold projects/<slug>/ memory files (no workspace.json). */
export function scaffoldProjectDir(
  workspaceRoot: string,
  slug: string,
  displayName: string,
): { created: string[]; skipped: string[] } {
  const memDir = projectMemDir(workspaceRoot, slug);
  const decisionsDir = path.join(memDir, "decisions");
  const indexDir = path.join(memDir, ".index");
  const created: string[] = [];
  const skipped: string[] = [];
  const ts = nowISO();

  ensureDir(decisionsDir);
  ensureDir(indexDir);
  ensureDir(path.join(memDir, "sessions"));

  const writeIfAbsent = (p: string, content: string) => {
    if (fs.existsSync(p)) skipped.push(path.relative(workspaceRoot, p));
    else {
      fs.writeFileSync(p, content, "utf8");
      created.push(path.relative(workspaceRoot, p));
    }
  };

  writeIfAbsent(path.join(memDir, "AGENTS.md"), agentsTemplate(displayName, ts));
  writeIfAbsent(
    path.join(memDir, "config.json"),
    JSON.stringify({ decay_rate: 0.01, max_results: 5, ref_weight: 0.1 }, null, 2) + "\n",
  );
  writeIfAbsent(path.join(memDir, "active_context.md"), activeContextTemplate(ts));
  writeIfAbsent(path.join(memDir, "lessons.md"), lessonsTemplate());
  writeIfAbsent(path.join(indexDir, ".gitignore"), indexGitignore());

  return { created, skipped };
}

export function initWorkspace(workspaceRoot: string = getProductHome()): WorkspaceInitResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const wsFile = workspaceFilePath(workspaceRoot);

  if (fs.existsSync(wsFile)) {
    skipped.push(path.relative(workspaceRoot, wsFile) || WORKSPACE_FILE);
  } else {
    const ts = nowISO();
    const config: WorkspaceConfig = {
      version: 1,
      current: UNCLASSIFIED,
      projects: {
        [UNCLASSIFIED]: { path: UNCLASSIFIED, linked_at: ts, system: true },
      },
    };
    saveWorkspace(workspaceRoot, config);
    created.push(WORKSPACE_FILE);
  }

  const proj = scaffoldProjectDir(workspaceRoot, UNCLASSIFIED, UNCLASSIFIED);
  created.push(...proj.created);
  skipped.push(...proj.skipped);

  return { created, skipped };
}

/**
 * Register a code directory as a memory project.
 * @param codePath Absolute or relative to cwd (the code project, not the product hub).
 */
export function linkProject(workspaceRoot: string, codePath: string, cwd: string = process.cwd()): string {
  const abs = path.resolve(cwd, codePath);
  if (!fs.existsSync(abs)) throw new Error(`Path not found: ${abs}`);
  const slug = projectSlugFromName(path.basename(abs));
  const ws = loadWorkspace(workspaceRoot);
  if (!ws.projects[slug]) {
    ws.projects[slug] = {
      path: slug,
      linked_at: nowISO(),
      sourceDir: abs,
    };
    saveWorkspace(workspaceRoot, ws);
  } else if (path.resolve(ws.projects[slug].sourceDir ?? "") !== abs) {
    ws.projects[slug].sourceDir = abs;
    saveWorkspace(workspaceRoot, ws);
  }
  scaffoldProjectDir(workspaceRoot, slug, slug);
  return slug;
}

export function useProject(workspaceRoot: string, slug: string): void {
  const ws = loadWorkspace(workspaceRoot);
  if (!ws.projects[slug]) throw new Error(`Unknown project: ${slug}`);
  ws.current = slug;
  saveWorkspace(workspaceRoot, ws);
}

export function ensureProjectRegistered(workspaceRoot: string, slug: string): void {
  const ws = loadWorkspace(workspaceRoot);
  if (!ws.projects[slug]) {
    ws.projects[slug] = { path: slug, linked_at: nowISO() };
    saveWorkspace(workspaceRoot, ws);
    scaffoldProjectDir(workspaceRoot, slug, slug);
  }
}

export interface ClassifyResult {
  moved: string[];
}

/** Move a file under unclassified project memDir to target project (relative to memDir). */
export function classifyMemory(
  workspaceRoot: string,
  relPath: string,
  toSlug: string,
): ClassifyResult {
  if (toSlug === UNCLASSIFIED) throw new Error("Cannot classify into unclassified.");
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(toSlug)) throw new Error(`Invalid project slug: ${toSlug}`);

  const fromDir = projectMemDir(workspaceRoot, UNCLASSIFIED);
  const toDir = projectMemDir(workspaceRoot, toSlug);

  const src = path.resolve(fromDir, relPath);
  const dest = path.resolve(toDir, relPath);
  if (!src.startsWith(fromDir + path.sep) || !dest.startsWith(toDir + path.sep)) {
    throw new Error(`Invalid path (escapes project memory): ${relPath}`);
  }
  if (!fs.existsSync(src)) throw new Error(`Not found in unclassified: ${relPath}`);

  ensureProjectRegistered(workspaceRoot, toSlug);
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) {
    throw new Error(`Already exists in ${toSlug}: ${relPath}`);
  }
  fs.renameSync(src, dest);
  const moved = [relPath.replace(/\\/g, "/")];
  if (src.endsWith(".md")) {
    const attachRel = companionAttachRel(fs.readFileSync(dest, "utf8"));
    if (attachRel) {
      const attachSrc = path.resolve(fromDir, attachRel);
      const attachDest = path.resolve(toDir, attachRel);
      if (
        attachSrc.startsWith(fromDir + path.sep) &&
        fs.existsSync(attachSrc) &&
        !fs.existsSync(attachDest)
      ) {
        ensureDir(path.dirname(attachDest));
        fs.renameSync(attachSrc, attachDest);
        moved.push(attachRel);
      }
    }
  }
  return { moved };
}

const ATTACH_LINE = /^- \*\*Attach\*\*:\s*`?([^\n`]+)`?\s*$/m;

function companionAttachRel(content: string): string | undefined {
  const v = content.match(ATTACH_LINE)?.[1]?.trim();
  if (!v) return undefined;
  const norm = v.replace(/\\/g, "/");
  return norm.startsWith("imported/") ? norm : undefined;
}

/** Scan a code root for linkable subdirectories. */
export function discoverLinkableDirs(scanRoot: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(scanRoot)) return out;
  for (const e of fs.readdirSync(scanRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const abs = path.join(scanRoot, e.name);
    const hasGit = fs.existsSync(path.join(abs, ".git"));
    const hasPkg = fs.existsSync(path.join(abs, "package.json"));
    if (hasGit || hasPkg) out.push(e.name);
  }
  return out.sort();
}

/** Discover legacy memory sources under a code root. */
export function discoverMigrateSources(scanRoot: string): { type: string; path: string }[] {
  const found: { type: string; path: string }[] = [];
  const add = (type: string, p: string) => {
    if (fs.existsSync(path.join(scanRoot, p))) found.push({ type, path: p });
  };

  add("cursor-rules", ".cursorrules");
  add("cursor-rules", ".cursor/rules");
  add("memory-bank", "memory-bank");

  for (const sub of discoverLinkableDirs(scanRoot)) {
    add("cursor-rules", path.join(sub, ".cursor/rules"));
    add("memory-bank", path.join(sub, "memory-bank"));
  }
  return found;
}

export interface ClassifySuggestion {
  slug: string;
  score: number;
  reason: string;
}

function tokenize(s: string): Set<string> {
  const words = s.toLowerCase().match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
  return new Set(words);
}

/** Optional `classify_hints` in projects/<slug>/config.json — distinctive words for inbox scoring. */
function projectClassifyHints(workspaceRoot: string, slug: string): string[] {
  const file = path.join(projectMemDir(workspaceRoot, slug), "config.json");
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { classify_hints?: unknown };
    if (!Array.isArray(raw.classify_hints)) return [];
    return raw.classify_hints
      .map((h) => String(h).toLowerCase().trim())
      .filter((h) => h.length >= 2);
  } catch {
    return [];
  }
}

/** Suggest target project for an unclassified memory file. */
export function suggestClassify(workspaceRoot: string, relPath: string): ClassifySuggestion[] {
  const fromDir = projectMemDir(workspaceRoot, UNCLASSIFIED);
  const src = path.resolve(fromDir, relPath);
  if (!src.startsWith(fromDir + path.sep)) {
    throw new Error(`Invalid path (escapes project memory): ${relPath}`);
  }
  if (!fs.existsSync(src)) throw new Error(`Not found in unclassified: ${relPath}`);

  const content = fs.readFileSync(src, "utf8");
  const relNorm = relPath.replace(/\\/g, "/");
  const fileTokens = tokenize(`${relNorm} ${content.slice(0, 2000)}`);
  const tagMatch = (content.match(/\*\*Tags\*\*:\s*(.+)/)?.[1] ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const ws = loadWorkspace(workspaceRoot);
  const scores: ClassifySuggestion[] = [];

  for (const [slug, entry] of Object.entries(ws.projects)) {
    if (slug === UNCLASSIFIED) continue;
    const slugLc = slug.toLowerCase();
    const slugTokens = tokenize(slug);
    const baseName = entry.sourceDir ? path.basename(entry.sourceDir) : slug;
    const nameTokens = tokenize(baseName);
    let overlap = 0;
    const reasons: string[] = [];

    if (slugLc.length >= 3 && relNorm.toLowerCase().includes(slugLc)) {
      overlap += 4;
      reasons.push("path");
    }
    if (tagMatch.includes(slugLc)) {
      overlap += 5;
      reasons.push("tag=slug");
    }
    const baseLc = baseName.toLowerCase();
    if (baseLc.length >= 3 && tagMatch.includes(baseLc)) {
      overlap += 3;
      reasons.push("tag=sourceDir");
    }
    for (const t of fileTokens) {
      if (slugTokens.has(t) || nameTokens.has(t)) overlap++;
    }
    for (const tag of tagMatch) {
      if (slugTokens.has(tag) || nameTokens.has(tag)) overlap += 2;
    }
    const blob = `${relNorm} ${content.slice(0, 2000)}`.toLowerCase();
    const compact = blob.replace(/[\s_-]+/g, "");
    for (const hint of projectClassifyHints(workspaceRoot, slug)) {
      const hintCompact = hint.replace(/[\s_-]+/g, "");
      if (blob.includes(hint) || compact.includes(hintCompact) || tagMatch.includes(hint)) {
        overlap += 2;
        reasons.push(`hint:${hint}`);
      }
    }
    if (overlap > 0) {
      scores.push({
        slug,
        score: overlap,
        reason: reasons.length
          ? `${reasons.join("+")} overlap with "${slug}"`
          : `token overlap with project "${slug}"`,
      });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 3);
}

export const INBOX_APPLY_MIN_SCORE = 3;
export const INBOX_APPLY_LEAD = 2;

export interface InboxItem {
  relPath: string;
  kind: "file" | "aggregate";
  suggestion: ClassifySuggestion | null;
  skipReason?: string;
}

export interface InboxApplyResult {
  moved: { relPath: string; to: string }[];
  skipped: { relPath: string; reason: string }[];
}

function listInboxFileRels(unclassifiedDir: string): string[] {
  const out: string[] = [];
  const decDir = path.join(unclassifiedDir, "decisions");
  if (fs.existsSync(decDir)) {
    for (const f of fs.readdirSync(decDir)) {
      if (f.endsWith(".md") && !f.startsWith(".")) out.push(`decisions/${f}`);
    }
  }
  const impDir = path.join(unclassifiedDir, "imported");
  if (fs.existsSync(impDir)) {
    const walk = (dir: string, rel: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const childRel = `${rel}/${e.name}`;
        const childAbs = path.join(dir, e.name);
        const isDir = e.isDirectory() || (e.isSymbolicLink() && (() => {
          try { return fs.statSync(childAbs).isDirectory(); } catch { return false; }
        })());
        if (isDir) {
          if (
            childRel === "imported/attach" ||
            childRel === "imported/_flat_dump" ||
            childRel === "imported/academic/_scripts" ||
            childRel.startsWith("imported/attach/") ||
            childRel.startsWith("imported/_flat_dump/") ||
            childRel.startsWith("imported/academic/_scripts/")
          ) {
            continue;
          }
          walk(childAbs, childRel);
        } else if (e.name.endsWith(".md")) {
          out.push(childRel);
        }
      }
    };
    walk(impDir, "imported");
  }
  const sessDir = path.join(unclassifiedDir, "sessions");
  if (fs.existsSync(sessDir)) {
    for (const f of fs.readdirSync(sessDir)) {
      if (!f.endsWith(".md") || f.startsWith(".")) continue;
      if (/^\d{4}-\d{2}-\d{2}\.md$/.test(f)) continue;
      out.push(`sessions/${f}`);
    }
  }
  return out.sort();
}

export function highConfidenceTarget(suggestions: ClassifySuggestion[]): ClassifySuggestion | null {
  const top = suggestions[0];
  if (!top || top.score < INBOX_APPLY_MIN_SCORE) return null;
  const second = suggestions[1];
  if (second && top.score - second.score < INBOX_APPLY_LEAD) return null;
  return top;
}

/** Independent files + whole-file aggregates under unclassified. */
export function listInbox(workspaceRoot: string): InboxItem[] {
  const unclassifiedDir = projectMemDir(workspaceRoot, UNCLASSIFIED);
  const items: InboxItem[] = [];
  for (const relPath of listInboxFileRels(unclassifiedDir)) {
    const suggestions = suggestClassify(workspaceRoot, relPath);
    items.push({
      relPath,
      kind: "file",
      suggestion: suggestions[0] ?? null,
    });
  }
  const lessonsFile = path.join(unclassifiedDir, "lessons.md");
  if (fs.existsSync(lessonsFile)) {
    const headings = (fs.readFileSync(lessonsFile, "utf8").match(/^##\s+/gm) ?? []).length;
    if (headings > 0) {
      items.push({
        relPath: "lessons.md",
        kind: "aggregate",
        suggestion: null,
        skipReason: "whole file only — not auto-applied (split lessons in a later release)",
      });
    }
  }
  const sessDir = path.join(unclassifiedDir, "sessions");
  if (fs.existsSync(sessDir)) {
    for (const f of fs.readdirSync(sessDir).filter((x) => /^\d{4}-\d{2}-\d{2}\.md$/.test(x)).sort()) {
      items.push({
        relPath: `sessions/${f}`,
        kind: "aggregate",
        suggestion: null,
        skipReason: "legacy daily bundle — not auto-applied (new sessions are one file per close)",
      });
    }
  }
  return items;
}

export function countInboxFiles(workspaceRoot: string): number {
  return listInbox(workspaceRoot).filter((i) => i.kind === "file").length;
}

/** Auto-move high-confidence independent files; leave the rest for `classify --to`. */
export function applyInbox(
  workspaceRoot: string,
  minScore: number = INBOX_APPLY_MIN_SCORE,
): InboxApplyResult {
  const moved: InboxApplyResult["moved"] = [];
  const skipped: InboxApplyResult["skipped"] = [];
  for (const item of listInbox(workspaceRoot)) {
    if (item.kind !== "file") {
      skipped.push({ relPath: item.relPath, reason: item.skipReason ?? "aggregate" });
      continue;
    }
    const suggestions = suggestClassify(workspaceRoot, item.relPath);
    const top = highConfidenceTarget(suggestions);
    if (!top || top.score < minScore) {
      const hint = item.suggestion
        ? `score ${item.suggestion.score} → ${item.suggestion.slug} (classify --to)`
        : "no suggestion (classify --to or link a project)";
      skipped.push({ relPath: item.relPath, reason: hint });
      continue;
    }
    try {
      classifyMemory(workspaceRoot, item.relPath, top.slug);
      moved.push({ relPath: item.relPath, to: top.slug });
    } catch (e) {
      skipped.push({
        relPath: item.relPath,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { moved, skipped };
}

export interface WorkspaceHealthReport {
  unclassified: {
    decisions: number;
    lessons: number;
    imported: number;
    sessions: number;
    total: number;
    oldestDate: string | null;
  };
  projects: { slug: string; score: number; issues: number }[];
  issues: { severity: "warn" | "info"; message: string }[];
}

/** Workspace-level health including unclassified backlog. */
export function workspaceHealth(
  workspaceRoot: string,
  opts?: { backlogThreshold?: number; staleDays?: number },
): WorkspaceHealthReport {
  const backlogThreshold = opts?.backlogThreshold ?? 10;
  const staleDays = opts?.staleDays ?? 30;
  const unclassifiedDir = projectMemDir(workspaceRoot, UNCLASSIFIED);
  const issues: WorkspaceHealthReport["issues"] = [];

  const countMd = (subdir: string) => {
    const d = path.join(unclassifiedDir, subdir);
    if (!fs.existsSync(d)) return { count: 0, oldest: null as string | null };
    const files = fs.readdirSync(d).filter((f) => f.endsWith(".md"));
    let oldest: string | null = null;
    for (const f of files) {
      const m = fs.statSync(path.join(d, f)).mtime.toISOString();
      if (!oldest || m < oldest) oldest = m;
    }
    return { count: files.length, oldest };
  };

  const dec = countMd("decisions");
  const impDir = path.join(unclassifiedDir, "imported");
  let impCount = 0;
  let impOldest: string | null = null;
  if (fs.existsSync(impDir)) {
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs);
        else if (e.name.endsWith(".md")) {
          impCount++;
          const m = fs.statSync(abs).mtime.toISOString();
          if (!impOldest || m < impOldest) impOldest = m;
        }
      }
    };
    walk(impDir);
  }
  const sessDir = path.join(unclassifiedDir, "sessions");
  let sessCount = 0;
  let sessOldest: string | null = null;
  if (fs.existsSync(sessDir)) {
    for (const f of fs.readdirSync(sessDir).filter((x) => x.endsWith(".md"))) {
      sessCount++;
      const m = fs.statSync(path.join(sessDir, f)).mtime.toISOString();
      if (!sessOldest || m < sessOldest) sessOldest = m;
    }
  }
  const lessonsFile = path.join(unclassifiedDir, "lessons.md");
  let lessonsCount = 0;
  if (fs.existsSync(lessonsFile)) {
    lessonsCount = (fs.readFileSync(lessonsFile, "utf8").match(/^##\s+/gm) ?? []).length;
  }

  const total = dec.count + impCount + lessonsCount + sessCount;
  const oldestCandidates = [dec.oldest, impOldest, sessOldest].filter(Boolean) as string[];
  const oldestDate = oldestCandidates.length ? oldestCandidates.sort()[0].slice(0, 10) : null;

  if (total >= backlogThreshold) {
    issues.push({
      severity: "warn",
      message: `unclassified backlog: ${total} items (threshold ${backlogThreshold})`,
    });
  }
  if (oldestDate) {
    const ageDays = Math.floor((Date.now() - Date.parse(oldestDate)) / 86400000);
    if (ageDays >= staleDays) {
      issues.push({
        severity: "warn",
        message: `oldest unclassified item is ${ageDays} days old — run centricmem inbox`,
      });
    }
  }

  const ws = loadWorkspace(workspaceRoot);

  // Broken absolute sourceDir links (multi-project hub).
  for (const [slug, entry] of Object.entries(ws.projects)) {
    if (entry.system) continue;
    if (entry.sourceDir && !fs.existsSync(entry.sourceDir)) {
      issues.push({
        severity: "warn",
        message: `broken sourceDir for ${slug}: ${entry.sourceDir} — relink or fix workspace.json`,
      });
    }
  }

  // Env pointed at a non-hub path (missing workspace.json).
  const envHome = process.env.CENTRICMEM_HOME || process.env.CENTRICMEM_WORKSPACE;
  if (envHome) {
    const resolved = path.resolve(envHome);
    if (looksLikeClientFolder(resolved)) {
      const which = process.env.CENTRICMEM_HOME ? "CENTRICMEM_HOME" : "CENTRICMEM_WORKSPACE";
      issues.push({
        severity: "warn",
        message: `${which}=${resolved} is the CLI install folder — set it to the memory library (setup --workspace --persist-home)`,
      });
    }
    if (!fs.existsSync(path.join(resolved, "workspace.json"))) {
      const which = process.env.CENTRICMEM_HOME ? "CENTRICMEM_HOME" : "CENTRICMEM_WORKSPACE";
      issues.push({
        severity: "warn",
        message: `${which}=${resolved} has no workspace.json — set CENTRICMEM_HOME to the memory library, not the CLI install folder`,
      });
    }
  }

  const projects: WorkspaceHealthReport["projects"] = [];
  for (const slug of Object.keys(ws.projects)) {
    if (slug === UNCLASSIFIED) continue;
    const h = healthCheck(workspaceRoot, slug);
    projects.push({ slug, score: h.score, issues: h.issues.length });
  }

  return {
    unclassified: {
      decisions: dec.count,
      lessons: lessonsCount,
      imported: impCount,
      sessions: sessCount,
      total,
      oldestDate,
    },
    projects,
    issues,
  };
}
