/**
 * import.ts — ImportBundle v1 schema + materialization into project memory.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { resolvePaths, ensureDir, nowISO, slugify } from "./core.js";
import { buildIndex } from "./indexer.js";
import { logDecision, logLesson, logSession } from "./memory.js";
import { UNCLASSIFIED, ensureProjectRegistered } from "./workspace.js";

// ---------------------------------------------------------------------------
// ImportBundle v1 — the single canonical write contract
// ---------------------------------------------------------------------------

export const ImportDecisionSchema = z.object({
  title: z.string().min(1),
  context: z.string().default(""),
  decision: z.string().default(""),
  consequences: z.string().optional(),
  agent: z.string().optional(),
  tags: z.array(z.string()).optional(),
  supersedes: z.number().int().min(1).optional(),
  refs: z.array(z.number().int().min(1)).optional(),
  logged_at: z.string().optional(),
  external_id: z.string().optional(),
});

export const ImportLessonSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  agent: z.string().optional(),
  external_id: z.string().optional(),
});

export const ImportRuleSchema = z.object({
  title: z.string().optional(),
  body: z.string().min(1),
  external_id: z.string().optional(),
});

export const ImportDocSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  external_id: z.string().optional(),
  /** Relative path under imported/ (preserves corpus subdirs for domain_boost). */
  rel_path: z.string().optional(),
  meta: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean()])).optional(),
});

export const ImportSessionSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  logged_at: z.string().optional(),
  external_id: z.string().optional(),
});

export const ImportResearchSchema = z.object({
  title: z.string().min(1),
  body: z.string().default(""),
  tags: z.array(z.string()).optional(),
  external_id: z.string().optional(),
});

export const ImportBundleSchema = z.object({
  version: z.literal(1),
  project: z.string().optional(),
  source: z
    .object({
      type: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  decisions: z.array(ImportDecisionSchema).optional(),
  lessons: z.array(ImportLessonSchema).optional(),
  rules: z.array(ImportRuleSchema).optional(),
  context: z.object({ body: z.string() }).optional(),
  imported: z.array(ImportDocSchema).optional(),
  sessions: z.array(ImportSessionSchema).optional(),
  research: z.array(ImportResearchSchema).optional(),
});

export type ImportBundle = z.infer<typeof ImportBundleSchema>;
export type ImportDecision = z.infer<typeof ImportDecisionSchema>;
export type ImportLesson = z.infer<typeof ImportLessonSchema>;

export interface ImportResult {
  project: string;
  decisions: number;
  lessons: number;
  rules: number;
  imported: number;
  sessions: number;
  research: number;
  skipped: number;
  /** Raw docs updated in place (same external_id, default upsert). */
  updated: number;
}

const IDEMPOTENCY_FILE = ".import-idempotency.json";

interface IdempotencyState {
  keys: Set<string>;
  /** external_id key → path relative to memDir (for upsert). */
  paths: Map<string, string>;
}

function loadIdempotency(memDir: string): IdempotencyState {
  const f = path.join(memDir, IDEMPOTENCY_FILE);
  const keys = new Set<string>();
  const paths = new Map<string, string>();
  if (!fs.existsSync(f)) return { keys, paths };
  try {
    const raw = JSON.parse(fs.readFileSync(f, "utf8")) as
      | string[]
      | { keys?: string[]; paths?: Record<string, string> };
    if (Array.isArray(raw)) {
      for (const k of raw) keys.add(k);
    } else {
      for (const k of raw.keys ?? []) keys.add(k);
      for (const [k, p] of Object.entries(raw.paths ?? {})) paths.set(k, p);
    }
  } catch {
    /* ignore corrupt file */
  }
  return { keys, paths };
}

function saveIdempotency(memDir: string, state: IdempotencyState): void {
  const payload = {
    keys: [...state.keys],
    paths: Object.fromEntries(state.paths),
  };
  fs.writeFileSync(path.join(memDir, IDEMPOTENCY_FILE), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function formatMetaYaml(meta: Record<string, string | string[] | boolean>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) lines.push(`${k}: [${v.join(", ")}]`);
    else if (typeof v === "boolean") lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${v}`);
  }
  return lines.join("\n");
}

function formatImportedDoc(title: string, body: string, meta?: Record<string, string | string[] | boolean>): string {
  const fm = meta && Object.keys(meta).length ? `---\n${formatMetaYaml(meta)}\n---\n\n` : "";
  return `${fm}# ${title}\n\n${body.trim()}\n\n<!-- centricmem:meta imported_at=${nowISO()} updated_by=migration -->\n`;
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
  opts?: { dryRun?: boolean; project?: string; skipExisting?: boolean },
): ImportResult {
  const project = opts?.project ?? bundle.project ?? UNCLASSIFIED;
  ensureProjectRegistered(workspaceRoot, project);
  const paths = resolvePaths(workspaceRoot, project);
  const sourceLabel = bundle.source?.name ?? bundle.source?.type ?? "import";
  const skipExisting = opts?.skipExisting === true;

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
      updated: 0,
    };
  }

  const idem = loadIdempotency(paths.memDir);
  let skipped = 0;
  let updated = 0;
  let decisions = 0;
  let lessons = 0;
  let rules = 0;
  let imported = 0;
  let sessions = 0;
  let research = 0;

  for (const d of bundle.decisions ?? []) {
    const key = d.external_id ? `decision:${d.external_id}` : "";
    if (key && idem.keys.has(key)) {
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
      refs: d.refs,
    }, project);
    if (key) idem.keys.add(key);
    decisions++;
  }

  for (const l of bundle.lessons ?? []) {
    const key = l.external_id ? `lesson:${l.external_id}` : "";
    if (key && idem.keys.has(key)) {
      skipped++;
      continue;
    }
    const r = logLesson(workspaceRoot, { title: l.title, body: l.body, agent: l.agent ?? "migration" }, project);
    if (r.status === "skipped") skipped++;
    else lessons++;
    if (key) idem.keys.add(key);
  }

  for (const r of bundle.rules ?? []) {
    const key = r.external_id ? `rule:${r.external_id}` : "";
    if (key && idem.keys.has(key)) {
      skipped++;
      continue;
    }
    appendToAgents(paths.agentsFile, r.title ? `Imported Rule: ${r.title}` : "Imported Rule", r.body, sourceLabel);
    if (key) idem.keys.add(key);
    rules++;
  }

  if (bundle.context?.body) {
    const body = `# Active Context\n\n${bundle.context.body.trim()}\n\n<!-- centricmem:meta updated_at=${nowISO()} updated_by=migration -->\n`;
    fs.writeFileSync(paths.activeContextFile, body, "utf8");
  }

  for (const doc of bundle.imported ?? []) {
    const key = doc.external_id ? `imported:${doc.external_id}` : "";
    const importedDir = path.join(paths.memDir, "imported");
    const relDefault = doc.rel_path?.replace(/\\/g, "/") ?? `${slugify(doc.title)}.md`;
    const existingRel = key ? idem.paths.get(key) : undefined;
    const already = Boolean(key && idem.keys.has(key));

    if (already && skipExisting) {
      skipped++;
      continue;
    }

    const rel = existingRel ?? relDefault;
    const dest = path.join(importedDir, rel);
    ensureDir(path.dirname(dest));
    const content = formatImportedDoc(doc.title, doc.body, doc.meta);
    fs.writeFileSync(dest, content, "utf8");
    if (key) {
      idem.keys.add(key);
      idem.paths.set(key, rel.replace(/\\/g, "/"));
    }
    if (already) updated++;
    else imported++;
  }

  for (const s of bundle.sessions ?? []) {
    const key = s.external_id ? `session:${s.external_id}` : "";
    if (key && idem.keys.has(key)) {
      skipped++;
      continue;
    }
    logSession(
      workspaceRoot,
      { summary: s.body, title: s.title, loggedAt: s.logged_at, agent: "migration" },
      project,
    );
    if (key) idem.keys.add(key);
    sessions++;
  }

  for (const r of bundle.research ?? []) {
    const key = r.external_id ? `research:${r.external_id}` : "";
    const importedDir = path.join(paths.memDir, "imported");
    const relDefault = `research-${slugify(r.title)}.md`;
    const existingRel = key ? idem.paths.get(key) : undefined;
    const already = Boolean(key && idem.keys.has(key));

    if (already && skipExisting) {
      skipped++;
      continue;
    }

    const rel = existingRel ?? relDefault;
    const dest = path.join(importedDir, rel);
    ensureDir(path.dirname(dest));
    const tags = r.tags?.length ? `\n\n**Tags**: ${r.tags.join(", ")}\n` : "";
    const content = `# ${r.title}\n\n${r.body.trim()}${tags}\n\n<!-- centricmem:meta imported_at=${nowISO()} updated_by=migration -->\n`;
    fs.writeFileSync(dest, content, "utf8");
    if (key) {
      idem.keys.add(key);
      idem.paths.set(key, rel.replace(/\\/g, "/"));
    }
    if (already) updated++;
    else research++;
  }

  saveIdempotency(paths.memDir, idem);
  buildIndex(paths);

  return { project, decisions, lessons, rules, imported, sessions, research, skipped, updated };
}
