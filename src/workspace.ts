/**
 * workspace.ts — multi-project workspace hub (.centricmem/projects/<slug>/).
 */
import fs from "node:fs";
import path from "node:path";
import { MEM_DIR, ensureDir, nowISO, slugify, PROJECTS_DIR } from "./core.js";
import {
  agentsTemplate,
  activeContextTemplate,
  lessonsTemplate,
  indexGitignore,
} from "./templates.js";

export const UNCLASSIFIED = "unclassified";
export const WORKSPACE_FILE = "workspace.json";

export interface ProjectEntry {
  path: string;
  linked_at: string;
  system?: boolean;
  sourceDir?: string;
}

export interface WorkspaceConfig {
  version: 1;
  current: string;
  projects: Record<string, ProjectEntry>;
}

export function workspaceFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, MEM_DIR, WORKSPACE_FILE);
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
  ensureDir(path.join(workspaceRoot, MEM_DIR));
  fs.writeFileSync(workspaceFilePath(workspaceRoot), JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function projectSlugFromName(name: string): string {
  return slugify(name).replace(/^-+|-+$/g, "") || "project";
}

/** Walk up from startDir to find a directory containing .centricmem/workspace.json. */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  const env = process.env.CENTRICMEM_WORKSPACE;
  if (env && isWorkspace(env)) return path.resolve(env);

  let dir = path.resolve(startDir);
  while (true) {
    if (isWorkspace(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function getCurrentProjectSlug(workspaceRoot: string): string {
  if (process.env.CENTRICMEM_PROJECT) return process.env.CENTRICMEM_PROJECT;
  return loadWorkspace(workspaceRoot).current;
}

export function listProjects(workspaceRoot: string): { slug: string; entry: ProjectEntry; current: boolean }[] {
  const ws = loadWorkspace(workspaceRoot);
  return Object.entries(ws.projects).map(([slug, entry]) => ({
    slug,
    entry,
    current: slug === ws.current,
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
  const memDir = path.join(workspaceRoot, MEM_DIR, "projects", slug);
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

export function initWorkspace(workspaceRoot: string): WorkspaceInitResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const wsFile = workspaceFilePath(workspaceRoot);

  if (fs.existsSync(wsFile)) {
    skipped.push(path.relative(workspaceRoot, wsFile));
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
    created.push(path.relative(workspaceRoot, wsFile));
  }

  const proj = scaffoldProjectDir(workspaceRoot, UNCLASSIFIED, UNCLASSIFIED);
  created.push(...proj.created);
  skipped.push(...proj.skipped);

  return { created, skipped };
}

export function linkProject(workspaceRoot: string, subpath: string): string {
  const abs = path.resolve(workspaceRoot, subpath);
  if (!fs.existsSync(abs)) throw new Error(`Path not found: ${abs}`);
  const slug = projectSlugFromName(path.basename(abs));
  const ws = loadWorkspace(workspaceRoot);
  if (!ws.projects[slug]) {
    ws.projects[slug] = {
      path: slug,
      linked_at: nowISO(),
      sourceDir: path.relative(workspaceRoot, abs) || ".",
    };
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

  const fromDir = path.join(workspaceRoot, MEM_DIR, "projects", UNCLASSIFIED);
  const toDir = path.join(workspaceRoot, MEM_DIR, "projects", toSlug);

  // Reject path traversal: the resolved source/dest must stay inside their project dirs.
  const src = path.resolve(fromDir, relPath);
  const dest = path.resolve(toDir, relPath);
  if (!src.startsWith(fromDir + path.sep) || !dest.startsWith(toDir + path.sep)) {
    throw new Error(`Invalid path (escapes project memory): ${relPath}`);
  }
  if (!fs.existsSync(src)) throw new Error(`Not found in unclassified: ${relPath}`);

  ensureProjectRegistered(workspaceRoot, toSlug);
  ensureDir(path.dirname(dest));
  fs.renameSync(src, dest);
  return { moved: [relPath] };
}

/** Scan workspace for linkable subdirectories. */
export function discoverLinkableDirs(workspaceRoot: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(workspaceRoot)) return out;
  for (const e of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const abs = path.join(workspaceRoot, e.name);
    const hasGit = fs.existsSync(path.join(abs, ".git"));
    const hasPkg = fs.existsSync(path.join(abs, "package.json"));
    if (hasGit || hasPkg) out.push(e.name);
  }
  return out.sort();
}

/** Discover legacy memory sources under workspace. */
export function discoverMigrateSources(workspaceRoot: string): { type: string; path: string }[] {
  const found: { type: string; path: string }[] = [];
  const add = (type: string, p: string) => {
    if (fs.existsSync(path.join(workspaceRoot, p))) found.push({ type, path: p });
  };

  add("cursor-rules", ".cursorrules");
  add("cursor-rules", ".cursor/rules");
  add("memory-bank", "memory-bank");

  for (const sub of discoverLinkableDirs(workspaceRoot)) {
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

/** Suggest target project for an unclassified memory file. */
export function suggestClassify(workspaceRoot: string, relPath: string): ClassifySuggestion[] {
  const fromDir = path.join(workspaceRoot, MEM_DIR, "projects", UNCLASSIFIED);
  const src = path.resolve(fromDir, relPath);
  if (!src.startsWith(fromDir + path.sep)) {
    throw new Error(`Invalid path (escapes project memory): ${relPath}`);
  }
  if (!fs.existsSync(src)) throw new Error(`Not found in unclassified: ${relPath}`);

  const content = fs.readFileSync(src, "utf8");
  const fileTokens = tokenize(`${relPath} ${content.slice(0, 2000)}`);
  const ws = loadWorkspace(workspaceRoot);
  const scores: ClassifySuggestion[] = [];

  for (const [slug, entry] of Object.entries(ws.projects)) {
    if (slug === UNCLASSIFIED) continue;
    const slugTokens = tokenize(slug);
    const nameTokens = tokenize(entry.sourceDir ?? slug);
    let overlap = 0;
    for (const t of fileTokens) {
      if (slugTokens.has(t) || nameTokens.has(t)) overlap++;
    }
    const tagMatch = (content.match(/\*\*Tags\*\*:\s*(.+)/)?.[1] ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    for (const tag of tagMatch) {
      if (slugTokens.has(tag) || nameTokens.has(tag)) overlap += 2;
    }
    if (overlap > 0) {
      scores.push({
        slug,
        score: overlap,
        reason: `token overlap with project "${slug}"`,
      });
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, 3);
}
