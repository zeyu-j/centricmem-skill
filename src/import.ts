/**
 * import.ts — materialize ImportBundle into workspace project memory.
 */
import fs from "node:fs";
import path from "node:path";
import { resolvePaths, ensureDir, nowISO, slugify } from "./core.js";
import { buildIndex } from "./indexer.js";
import { logDecision, logLesson } from "./memory.js";
import { logSession } from "./session.js";
import { ImportBundle, ImportBundleSchema } from "./import-schema.js";
import { UNCLASSIFIED, ensureProjectRegistered } from "./workspace.js";

export interface ImportResult {
  project: string;
  decisions: number;
  lessons: number;
  rules: number;
  imported: number;
  sessions: number;
  research: number;
  skipped: number;
}

const IDEMPOTENCY_FILE = ".import-idempotency.json";

function loadIdempotency(memDir: string): Set<string> {
  const f = path.join(memDir, IDEMPOTENCY_FILE);
  if (!fs.existsSync(f)) return new Set();
  try {
    const arr = JSON.parse(fs.readFileSync(f, "utf8")) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveIdempotency(memDir: string, keys: Set<string>): void {
  fs.writeFileSync(path.join(memDir, IDEMPOTENCY_FILE), JSON.stringify([...keys], null, 2) + "\n", "utf8");
}

function appendToAgents(agentsFile: string, sectionTitle: string, body: string, source: string): void {
  let content = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, "utf8") : "# AGENTS.md\n";
  const block = `\n## ${sectionTitle}\n\n> Source: \`${source}\` (imported ${nowISO()} by migration)\n\n${body.trim()}\n`;
  content += block;
  fs.writeFileSync(agentsFile, content, "utf8");
}

export function parseImportBundle(raw: string | object): ImportBundle {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  return ImportBundleSchema.parse(data);
}

export function importBundle(
  workspaceRoot: string,
  bundle: ImportBundle,
  opts?: { dryRun?: boolean; project?: string },
): ImportResult {
  const project = opts?.project ?? bundle.project ?? UNCLASSIFIED;
  ensureProjectRegistered(workspaceRoot, project);
  const paths = resolvePaths(workspaceRoot, project);
  const sourceLabel = bundle.source?.name ?? bundle.source?.type ?? "import";

  if (opts?.dryRun) {
    return {
      project,
      decisions: bundle.decisions?.length ?? 0,
      lessons: bundle.lessons?.length ?? 0,
      rules: bundle.rules?.length ?? 0,
      imported: bundle.imported?.length ?? 0,
      sessions: bundle.sessions?.length ?? 0,
      research: bundle.research?.length ?? 0,
      skipped: 0,
    };
  }

  const idem = loadIdempotency(paths.memDir);
  let skipped = 0;
  let decisions = 0;
  let lessons = 0;
  let rules = 0;
  let imported = 0;
  let sessions = 0;
  let research = 0;

  for (const d of bundle.decisions ?? []) {
    const key = d.external_id ? `decision:${d.external_id}` : "";
    if (key && idem.has(key)) {
      skipped++;
      continue;
    }
    logDecision(workspaceRoot, {
      title: d.title,
      context: d.context || `Imported from ${sourceLabel}.`,
      decision: d.decision,
      consequences: d.consequences,
      agent: d.agent ?? "migration",
      tags: d.tags,
      supersedes: d.supersedes,
    }, project);
    if (key) idem.add(key);
    decisions++;
  }

  for (const l of bundle.lessons ?? []) {
    const key = l.external_id ? `lesson:${l.external_id}` : "";
    if (key && idem.has(key)) {
      skipped++;
      continue;
    }
    const r = logLesson(workspaceRoot, { title: l.title, body: l.body, agent: l.agent ?? "migration" }, project);
    if (r.status === "skipped") skipped++;
    else lessons++;
    if (key) idem.add(key);
  }

  for (const r of bundle.rules ?? []) {
    appendToAgents(paths.agentsFile, r.title ? `Imported Rule: ${r.title}` : "Imported Rule", r.body, sourceLabel);
    rules++;
  }

  if (bundle.context?.body) {
    const body = `# Active Context\n\n${bundle.context.body.trim()}\n\n<!-- centricmem:meta updated_at=${nowISO()} updated_by=migration -->\n`;
    fs.writeFileSync(paths.activeContextFile, body, "utf8");
  }

  for (const doc of bundle.imported ?? []) {
    const key = doc.external_id ? `imported:${doc.external_id}` : "";
    if (key && idem.has(key)) {
      skipped++;
      continue;
    }
    const importedDir = path.join(paths.memDir, "imported");
    ensureDir(importedDir);
    const name = `${slugify(doc.title)}.md`;
    const dest = path.join(importedDir, name);
    const content = `# ${doc.title}\n\n${doc.body.trim()}\n\n<!-- centricmem:meta imported_at=${nowISO()} updated_by=migration -->\n`;
    fs.writeFileSync(dest, content, "utf8");
    if (key) idem.add(key);
    imported++;
  }

  for (const s of bundle.sessions ?? []) {
    const key = s.external_id ? `session:${s.external_id}` : "";
    if (key && idem.has(key)) {
      skipped++;
      continue;
    }
    logSession(
      workspaceRoot,
      { summary: s.body, title: s.title, loggedAt: s.logged_at, agent: "migration" },
      project,
    );
    if (key) idem.add(key);
    sessions++;
  }

  for (const r of bundle.research ?? []) {
    const key = r.external_id ? `research:${r.external_id}` : "";
    if (key && idem.has(key)) {
      skipped++;
      continue;
    }
    const importedDir = path.join(paths.memDir, "imported");
    ensureDir(importedDir);
    const name = `research-${slugify(r.title)}.md`;
    const dest = path.join(importedDir, name);
    const tags = r.tags?.length ? `\n\n**Tags**: ${r.tags.join(", ")}\n` : "";
    const content = `# ${r.title}\n\n${r.body.trim()}${tags}\n\n<!-- centricmem:meta imported_at=${nowISO()} updated_by=migration -->\n`;
    fs.writeFileSync(dest, content, "utf8");
    if (key) idem.add(key);
    research++;
  }

  saveIdempotency(paths.memDir, idem);
  buildIndex(paths);

  return { project, decisions, lessons, rules, imported, sessions, research, skipped };
}
