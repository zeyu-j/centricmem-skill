/**
 * workspace-health.ts — workspace-level health (unclassified backlog).
 */
import fs from "node:fs";
import path from "node:path";
import { MEM_DIR } from "./core.js";
import { UNCLASSIFIED, loadWorkspace } from "./workspace.js";
import { healthCheck } from "./memory.js";

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
  const unclassifiedDir = path.join(workspaceRoot, MEM_DIR, "projects", UNCLASSIFIED);
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
        message: `oldest unclassified item is ${ageDays} days old — run suggest-classify`,
      });
    }
  }

  const ws = loadWorkspace(workspaceRoot);
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
