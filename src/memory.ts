/**
 * memory.ts — shared write/read operations on .centricmem/projects/<slug>/ used by CLI.
 */
import fs from "node:fs";
import path from "node:path";
import {
  MemPaths,
  resolvePaths,
  ensureDir,
  nextDecisionSeq,
  slugify,
  nowISO,
  readFileIfExists,
  detectAgent,
  getProductHome,
} from "./core.js";
import {
  decisionTemplate,
  lessonsTemplate,
  agentsTemplate,
} from "./templates.js";
import { initWorkspace, loadWorkspace } from "./workspace.js";

export interface InitResult {
  created: string[];
  skipped: string[];
}

/**
 * Initialize the Agent product hub at CENTRICMEM_HOME.
 * Does not write product usage files into code repositories.
 */
export function initProject(workspaceRoot?: string, _codeRoot?: string): InitResult {
  const home = workspaceRoot ?? getProductHome();
  const created: string[] = [];
  const skipped: string[] = [];
  const ws = initWorkspace(home);
  created.push(...ws.created);
  skipped.push(...ws.skipped);
  return { created, skipped };
}


function pathsFor(workspaceRoot: string, projectSlug?: string): MemPaths {
  return resolvePaths(workspaceRoot, projectSlug);
}

export interface LogDecisionInput {
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  agent?: string;
  tags?: string[];
  /** Sequence number of the decision this supersedes (e.g. 3 for #0003). */
  supersedes?: number;
  /** Sequence numbers of related decisions this one references (Memory Links). */
  refs?: number[];
}

export interface LogDecisionResult {
  file: string; // relative path from project root
  seq: number;
}

/**
 * Append-only: create decisions/NNNN-slug.md with the next sequence number.
 * Concurrency-safe: uses an O_EXCL sentinel (`.NNNN.seq`) so two processes can
 * never claim the same sequence number, even when their slugs differ.
 */
export function logDecision(
  workspaceRoot: string,
  input: LogDecisionInput,
  projectSlug?: string,
): LogDecisionResult {
  if (!input.title || !input.title.trim()) {
    throw new Error("Decision title must not be empty.");
  }
  const paths = pathsFor(workspaceRoot, projectSlug);
  ensureDir(paths.decisionsDir);

  // Claim a sequence number atomically: create a sentinel file with O_EXCL.
  // If another process claimed the same number first, retry with the next one.
  let seq = nextDecisionSeq(paths.decisionsDir);
  let id = String(seq).padStart(4, "0");
  let file = "";
  for (let attempt = 0; attempt < 100; attempt++) {
    const sentinel = path.join(paths.decisionsDir, `.${id}.seq`);
    try {
      fs.writeFileSync(sentinel, "", { encoding: "utf8", flag: "wx" });
      file = path.join(paths.decisionsDir, `${id}-${slugify(input.title)}.md`);
      break;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      seq += 1;
      id = String(seq).padStart(4, "0");
    }
  }
  if (!file) throw new Error("Could not allocate a decision sequence number after 100 attempts.");

  const content = decisionTemplate({
    seq,
    title: input.title,
    context: input.context,
    decision: input.decision,
    consequences: input.consequences,
    agent: input.agent || detectAgent(),
    loggedAt: nowISO(),
    tags: input.tags,
    supersedes: input.supersedes,
    refs: input.refs,
  });
  // 'wx' flag guarantees append-only semantics: fail rather than overwrite.
  fs.writeFileSync(file, content, { encoding: "utf8", flag: "wx" });

  // If supersedes is set, update the old decision's Status to Superseded and
  // write a back-pointer so the evolution chain is traceable in both directions.
  if (input.supersedes) {
    const oldId = String(input.supersedes).padStart(4, "0");
    const decFiles = fs.existsSync(paths.decisionsDir)
      ? fs.readdirSync(paths.decisionsDir).filter((f) => f.startsWith(oldId + "-") && f.endsWith(".md"))
      : [];
    for (const oldFile of decFiles) {
      const oldPath = path.join(paths.decisionsDir, oldFile);
      const oldContent = fs.readFileSync(oldPath, "utf8");
      let updated = oldContent.replace(
        /^(- \*\*Status\*\*:)\s*\S+/m,
        `$1 Superseded`
      );
      // Add or refresh the Superseded-by back-pointer under the Status line.
      const byLine = `- **Superseded by**: #${id}`;
      if (/^- \*\*Superseded by\*\*:/m.test(updated)) {
        updated = updated.replace(/^- \*\*Superseded by\*\*:.*$/m, byLine);
      } else {
        updated = updated.replace(/^(- \*\*Status\*\*:.*)$/m, `$1\n${byLine}`);
      }
      if (updated !== oldContent) fs.writeFileSync(oldPath, updated, "utf8");
    }
  }

  return { file: path.relative(workspaceRoot, file), seq };
}

/** Overwrite active_context.md with new content, stamping agent + timestamp. */
export function updateContext(
  workspaceRoot: string,
  content: string,
  agent?: string,
  projectSlug?: string,
): string {
  const paths = pathsFor(workspaceRoot, projectSlug);
  ensureDir(paths.memDir);
  const by = agent || detectAgent();
  const body = `# Active Context

${content.trim()}

<!-- centricmem:meta updated_at=${nowISO()} updated_by=${by} -->
`;
  fs.writeFileSync(paths.activeContextFile, body, "utf8");
  return path.relative(workspaceRoot, paths.activeContextFile);
}

export interface ContextBundle {
  agents: string | null;
  activeContext: string | null;
  truncated: boolean;
}

/**
 * Progressive disclosure (Level 0): by default return only the first
 * `agentsHeadLines` lines of AGENTS.md plus the full active_context.md.
 * Pass level="full" for the complete AGENTS.md.
 */
export function readContext(
  workspaceRoot: string,
  level: "summary" | "full" = "summary",
  agentsHeadLines = 50,
  projectSlug?: string,
): ContextBundle {
  const paths = pathsFor(workspaceRoot, projectSlug);
  let agents = readFileIfExists(paths.agentsFile);
  let truncated = false;
  if (agents && level === "summary") {
    const lines = agents.split("\n");
    if (lines.length > agentsHeadLines) {
      // Structure-aware truncation: the Memory Map block is the routing table
      // for progressive disclosure, so it must ALWAYS be visible in summary
      // mode, even when the head window would push it out.
      const head = lines.slice(0, agentsHeadLines).join("\n");
      const omitted = lines.length - agentsHeadLines;
      const tail = `\n\n… (${omitted} more lines — read the full AGENTS.md or run \`centricmem search\` for details)`;
      const mapMatch = /<!-- (?:centricmem|memproject):map -->[\s\S]*?<!-- \/(?:centricmem|memproject):map -->/.exec(agents);
      if (mapMatch && !head.includes("<!-- centricmem:map -->") && !head.includes("<!-- memproject:map -->")) {
        agents = head + tail + `\n\n## Memory Map (pinned)\n\n${mapMatch[0]}`;
      } else {
        agents = head + tail;
      }
      truncated = true;
    }
  }
  return {
    agents,
    activeContext: readFileIfExists(paths.activeContextFile),
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Decision listing (overview without bodies)
// ---------------------------------------------------------------------------

export interface DecisionSummary {
  seq: number;
  title: string;
  status: string;
  loggedAt: string;
  agent: string;
  tags: string[];
  supersedes: number | null;
  supersededBy: number | null;
  file: string; // relative to project root
}

export function listDecisions(workspaceRoot: string, projectSlug?: string): DecisionSummary[] {
  const paths = pathsFor(workspaceRoot, projectSlug);
  if (!fs.existsSync(paths.decisionsDir)) return [];
  const out: DecisionSummary[] = [];
  for (const f of fs.readdirSync(paths.decisionsDir).sort()) {
    if (!f.endsWith(".md")) continue;
    const abs = path.join(paths.decisionsDir, f);
    const content = fs.readFileSync(abs, "utf8");
    const h1 = /^#\s+(?:(\d{4})\.\s*)?(.+)$/m.exec(content);
    const status = /\*\*Status\*\*:\s*(\S+)/.exec(content)?.[1] ?? "Accepted";
    const loggedAt = /\*\*Logged at\*\*:\s*(\S+)/.exec(content)?.[1] ?? "";
    const agent = /\*\*Logged by\*\*:\s*(\S+)/.exec(content)?.[1] ?? "unknown";
    const tagsRaw = /\*\*Tags\*\*:\s*(.+)/.exec(content)?.[1] ?? "";
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const supersedesRaw = /\*\*Supersedes\*\*:\s*#?(\d+)/.exec(content)?.[1];
    const supersededByRaw = /\*\*Superseded by\*\*:\s*#?(\d+)/.exec(content)?.[1];
    const seqFromFile = /^(\d{4})-/.exec(f);
    out.push({
      seq: h1?.[1] ? parseInt(h1[1], 10) : seqFromFile ? parseInt(seqFromFile[1], 10) : 0,
      title: h1?.[2]?.trim() ?? f,
      status,
      loggedAt,
      agent,
      tags,
      supersedes: supersedesRaw ? parseInt(supersedesRaw, 10) : null,
      supersededBy: supersededByRaw ? parseInt(supersededByRaw, 10) : null,
      file: path.relative(workspaceRoot, abs),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auto-distillation (suggestion only — never mutates AGENTS.md)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  (
    "the a an and or of to in for on with is are was were be been being this that these those it its as at by from we our not no use used using when must should never always api all one two more than into over " +
    "via through per within without across during before after under above between about against toward towards upon onto like unlike each every any some most both only just also very much such own same other another " +
    "add adopt adopting adding switch switching replace replacing migrate migrating choose choosing pick new make making enable enabling set setting"
  ).split(" ")
);

export interface DistillPattern {
  keyword: string;
  count: number;
  decisions: string[];
  source: "keyword" | "tag"; // how the pattern was detected
}

export interface DistillReport {
  activeDecisions: number;
  patterns: DistillPattern[];
  suggestion: string;
}

/**
 * Scan Active decisions for recurring patterns and produce a promotion suggestion
 * for AGENTS.md — output only, never mutates files.
 *
 * Two detection strategies:
 *   1. Keyword frequency: words appearing in >= minCount decisions.
 *   2. Tag heuristic: tags explicitly set by the user on >= 2 decisions
 *      (user intent is a stronger signal than word frequency).
 */
export function distill(workspaceRoot: string, minCount = 2, topN = 8, projectSlug?: string): DistillReport {
  const paths = pathsFor(workspaceRoot, projectSlug);
  const decisions = listDecisions(workspaceRoot, projectSlug).filter(
    (d) => !/superseded|deprecated|historical/i.test(d.status)
  );

  // Early exit with helpful message when corpus is too small.
  if (decisions.length < 5) {
    return {
      activeDecisions: decisions.length,
      patterns: [],
      suggestion:
        decisions.length === 0
          ? "No active decisions logged yet. Use centricmem_log_decision to start building memory."
          : `${decisions.length} decision${decisions.length === 1 ? "" : "s"} logged. Distillation works best with 5+ decisions — keep logging.`,
    };
  }

  const keywordMap = new Map<string, Set<string>>();
  const tagMap = new Map<string, Set<string>>();

  for (const d of decisions) {
    const label = `${String(d.seq).padStart(4, "0")}. ${d.title}`;
    const content = fs.readFileSync(path.join(workspaceRoot, d.file), "utf8");
    // Keyword mining: title + Decision section.
    const decisionSection = /## Decision\n([\s\S]*?)(?:\n## |$)/.exec(content)?.[1] ?? "";
    const text = `${d.title} ${decisionSection}`.toLowerCase();
    const words = text.match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
    const seen = new Set<string>();
    for (const w of words) {
      if (STOPWORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      if (!keywordMap.has(w)) keywordMap.set(w, new Set());
      keywordMap.get(w)!.add(label);
    }
    // Tag heuristic: each explicit tag is a strong pattern signal.
    for (const tag of d.tags) {
      const t = tag.toLowerCase().trim();
      if (!t) continue;
      if (!tagMap.has(t)) tagMap.set(t, new Set());
      tagMap.get(t)!.add(label);
    }
  }

  // Build patterns from both sources; deduplicate by keyword.
  const seen = new Set<string>();
  const patterns: DistillPattern[] = [];

  // Tags first (higher signal).
  for (const [tag, labels] of tagMap) {
    if (labels.size >= 2 && !seen.has(tag)) {
      seen.add(tag);
      patterns.push({ keyword: tag, count: labels.size, decisions: [...labels], source: "tag" });
    }
  }

  // Keywords (frequency-based).
  for (const [kw, labels] of keywordMap) {
    if (labels.size >= minCount && !seen.has(kw)) {
      seen.add(kw);
      patterns.push({ keyword: kw, count: labels.size, decisions: [...labels], source: "keyword" });
    }
  }

  patterns.sort((a, b) => {
    // Tags rank above keywords; within same source, sort by count desc.
    if (a.source !== b.source) return a.source === "tag" ? -1 : 1;
    return b.count - a.count;
  });
  const top = patterns.slice(0, topN);

  let suggestion: string;
  if (!top.length) {
    suggestion = "No recurring patterns detected across active decisions. Nothing to promote yet.";
  } else {
    const lines = top.map(
      (p) =>
        `- **${p.keyword}** [${p.source}] appears in ${p.count} decisions (${p.decisions.slice(0, 3).join("; ")}${p.decisions.length > 3 ? "; …" : ""})`
    );
    suggestion = `Recurring patterns across ${decisions.length} active decisions:\n\n${lines.join("\n")}\n\nSuggested action: review these clusters and promote stable rules via \`centricmem promote --pattern "<rule>" --confirm\` (writes to the project's AGENTS.md Global Rules).`;
  }
  return { activeDecisions: decisions.length, patterns: top, suggestion };
}

// ---------------------------------------------------------------------------
// Memory health check
// ---------------------------------------------------------------------------

export interface HealthIssue {
  severity: "warn" | "info";
  message: string;
}

export interface HealthReport {
  counts: { decisions: number; activeDecisions: number; rules: number; lessons: number; imported: number };
  contextAgeDays: number | null;
  issues: HealthIssue[];
  score: number; // 0-100
}

export function healthCheck(workspaceRoot: string, projectSlug?: string): HealthReport {
  const paths = pathsFor(workspaceRoot, projectSlug);
  const decisions = listDecisions(workspaceRoot, projectSlug);
  const active = decisions.filter((d) => !/superseded|deprecated|historical/i.test(d.status));
  const issues: HealthIssue[] = [];

  // Counts.
  const agents = readFileIfExists(paths.agentsFile) ?? "";
  const rulesSection = /## Global Rules\n([\s\S]*?)(?:\n## |$)/.exec(agents)?.[1] ?? "";
  const rulesCount = (rulesSection.match(/^[-*]\s+/gm) ?? []).length;
  const lessons = readFileIfExists(paths.lessonsFile) ?? "";
  const lessonsCount = (lessons.match(/^##\s+/gm) ?? []).length;
  const importedDir = path.join(paths.memDir, "imported");
  const importedCount = fs.existsSync(importedDir)
    ? fs.readdirSync(importedDir).filter((f) => f.endsWith(".md")).length
    : 0;

  // 1. Stale active_context (>30 days).
  let contextAgeDays: number | null = null;
  const ctx = readFileIfExists(paths.activeContextFile);
  if (ctx) {
    const updatedAt = /updated_at=(\S+?)(?:\s|-->)/.exec(ctx)?.[1];
    const t = updatedAt ? Date.parse(updatedAt) : fs.statSync(paths.activeContextFile).mtimeMs;
    if (!Number.isNaN(t)) {
      contextAgeDays = Math.floor((Date.now() - t) / 86400000);
      if (contextAgeDays > 30) {
        issues.push({
          severity: "warn",
          message: `active_context.md has not been updated for ${contextAgeDays} days — it may be stale.`,
        });
      }
    }
  } else {
    issues.push({ severity: "warn", message: "active_context.md is missing." });
  }

  // 2. Many decisions but empty Global Rules → needs distillation.
  //    Threshold lowered to 10; additionally, if distill already sees strong
  //    patterns (tag clusters), nudge even earlier.
  if (decisions.length >= 10 && rulesCount === 0) {
    issues.push({
      severity: "warn",
      message: `${decisions.length} decisions logged but Global Rules in AGENTS.md is empty — run \`centricmem promote --from-distill\`.`,
    });
  } else if (rulesCount === 0 && active.length >= 5) {
    const tagCounts = new Map<string, number>();
    for (const d of active) for (const t of d.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    const strongTags = [...tagCounts.entries()].filter(([, c]) => c >= 3);
    if (strongTags.length) {
      issues.push({
        severity: "info",
        message: `Tag cluster${strongTags.length > 1 ? "s" : ""} detected (${strongTags.map(([t, c]) => `"${t}" ×${c}`).join(", ")}) with empty Global Rules — distillation may be worthwhile.`,
      });
    }
  }

  // 3. Potentially conflicting decisions: pairs of Active decisions whose title
  //    keywords overlap heavily (>= 2 shared words and >= 60% of the smaller set).
  const titleWords = active.map((d) => ({
    label: `${String(d.seq).padStart(4, "0")}. ${d.title}`,
    words: new Set(
      (d.title.toLowerCase().match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? []).filter((w) => !STOPWORDS.has(w))
    ),
  }));
  const flagged = new Set<string>();
  for (let i = 0; i < titleWords.length; i++) {
    for (let j = i + 1; j < titleWords.length; j++) {
      const a = titleWords[i];
      const b = titleWords[j];
      if (!a.words.size || !b.words.size) continue;
      let shared = 0;
      for (const w of a.words) if (b.words.has(w)) shared++;
      const minSize = Math.min(a.words.size, b.words.size);
      if (shared >= 2 && shared / minSize >= 0.6) {
        const key = `${a.label}|${b.label}`;
        if (!flagged.has(key)) {
          flagged.add(key);
          issues.push({
            severity: "warn",
            message: `Possible conflicting active decisions on the same topic: ${a.label} / ${b.label}. Consider marking the older one as Superseded.`,
          });
        }
      }
    }
  }

  // 4. Info-level nudges.
  if (!decisions.length) issues.push({ severity: "info", message: "No decisions logged yet." });
  if (!lessonsCount) issues.push({ severity: "info", message: "lessons.md has no entries yet." });

  // 5. Broken sourceDir for this project (cwd→project link).
  try {
    const slug = projectSlug ?? loadWorkspace(workspaceRoot).current;
    const entry = loadWorkspace(workspaceRoot).projects[slug];
    if (entry?.sourceDir && !fs.existsSync(entry.sourceDir)) {
      issues.push({
        severity: "warn",
        message: `broken sourceDir for ${slug}: ${entry.sourceDir} — relink or fix workspace.json`,
      });
    }
  } catch { /* ignore */ }

  const warns = issues.filter((i) => i.severity === "warn").length;
  const score = Math.max(0, 100 - warns * 20 - issues.filter((i) => i.severity === "info").length * 5);

  return {
    counts: {
      decisions: decisions.length,
      activeDecisions: active.length,
      rules: rulesCount,
      lessons: lessonsCount,
      imported: importedCount,
    },
    contextAgeDays,
    issues,
    score,
  };
}

// ---------------------------------------------------------------------------
// Lesson logging (append to lessons.md)
// ---------------------------------------------------------------------------

export interface LogLessonInput {
  title: string;
  body: string;
  agent?: string;
  tags?: string[];
}

export interface LogLessonResult {
  /** 'added' when a new section was written, 'skipped' when title already exists. */
  status: "added" | "skipped";
}

/**
 * Append a lesson to .centricmem/lessons.md.
 * Idempotent: if a `## {title}` section already exists the write is skipped.
 */
export function logLesson(
  workspaceRoot: string,
  input: LogLessonInput,
  projectSlug?: string,
): LogLessonResult {
  if (!input.title || !input.title.trim()) {
    throw new Error("Lesson title must not be empty.");
  }
  const paths = pathsFor(workspaceRoot, projectSlug);
  ensureDir(paths.memDir);
  const by = input.agent || detectAgent();
  const ts = nowISO();

  // Ensure lessons.md exists.
  if (!fs.existsSync(paths.lessonsFile)) {
    fs.writeFileSync(paths.lessonsFile, lessonsTemplate(), "utf8");
  }

  const existing = fs.readFileSync(paths.lessonsFile, "utf8");
  // Idempotency: skip if a section with the same title already exists.
  const escapedTitle = input.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^##\\s+${escapedTitle}\\s*$`, "m").test(existing)) {
    return { status: "skipped" };
  }

  const section = `\n## ${input.title}\n\n${input.body.trim()}\n${
    input.tags?.length ? `\n- **Tags**: ${input.tags.join(", ")}\n` : ""
  }\n<!-- centricmem:meta logged_at=${ts} logged_by=${by} -->\n`;
  fs.appendFileSync(paths.lessonsFile, section, "utf8");
  return { status: "added" };
}

// ---------------------------------------------------------------------------
// Promote patterns to Global Rules (requires confirm)
// ---------------------------------------------------------------------------

export interface PromoteResult {
  promoted: boolean;
  rule: string;
  message: string;
}

/** Append a rule bullet to AGENTS.md ## Global Rules (requires confirm). */
export function promoteToRules(
  workspaceRoot: string,
  pattern: string,
  opts?: { confirm?: boolean; projectSlug?: string; source?: string },
): PromoteResult {
  const text = pattern.trim();
  if (!text) throw new Error("Promotion pattern/rule text must not be empty.");
  if (!opts?.confirm) {
    return {
      promoted: false,
      rule: text,
      message: "Dry run — re-run with --confirm to write to AGENTS.md Global Rules.",
    };
  }

  const paths = pathsFor(workspaceRoot, opts.projectSlug);
  let agents = readFileIfExists(paths.agentsFile) ?? agentsTemplate(paths.projectSlug, nowISO());
  const bullet = `- ${text}`;
  const rulesHeading = "## Global Rules";
  const idx = agents.indexOf(rulesHeading);
  if (idx >= 0) {
    const after = agents.indexOf("\n## ", idx + rulesHeading.length);
    const insertAt = after >= 0 ? after : agents.length;
    const before = agents.slice(0, insertAt).trimEnd();
    const rest = after >= 0 ? agents.slice(insertAt) : "";
    agents = `${before}\n${bullet}\n${rest}`;
  } else {
    agents = agents.trimEnd() + `\n\n${rulesHeading}\n\n${bullet}\n`;
  }
  if (opts.source) {
    agents = agents.replace(
      bullet,
      `${bullet} _(promoted from ${opts.source})_`,
    );
  }
  fs.writeFileSync(paths.agentsFile, agents, "utf8");
  return { promoted: true, rule: text, message: `Promoted to Global Rules: ${text}` };
}

// ---------------------------------------------------------------------------
// Session / episodic memory (append-only under sessions/)
// ---------------------------------------------------------------------------

export interface LogSessionInput {
  summary: string;
  title?: string;
  artifacts?: string[];
  agent?: string;
  loggedAt?: string;
  tags?: string[];
}

export interface LogSessionResult {
  file: string;
  heading: string;
}

const PLACEHOLDER_FOCUS = /^\(?Nothing yet/i;

/** Extract ## Current Focus body from active_context.md (excluding placeholders). */
export function extractCurrentFocus(content: string): string | null {
  const m = /^##\s+Current Focus\s*\n+([\s\S]*?)(?=\n##\s+|\n<!--|$)/im.exec(content);
  if (!m) return null;
  const body = m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("<!--") && !PLACEHOLDER_FOCUS.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return body || null;
}

/**
 * Build a non-empty session summary for hooks (`log-session --auto`).
 * Prefers active_context Current Focus; falls back to a short ambient-style line.
 */
export function autoSessionSummary(workspaceRoot: string, projectSlug?: string): string {
  const paths = resolvePaths(workspaceRoot, projectSlug);
  const ctxFile = path.join(paths.memDir, "active_context.md");
  if (fs.existsSync(ctxFile)) {
    const focus = extractCurrentFocus(fs.readFileSync(ctxFile, "utf8"));
    if (focus) return focus.slice(0, 500);
  }
  const slug = projectSlug ?? path.basename(paths.memDir);
  try {
    const h = healthCheck(workspaceRoot, projectSlug);
    return `Auto session end — project=${slug} health=${h.score} (no Current Focus set)`.slice(0, 500);
  } catch {
    return `Auto session end — project=${slug}`.slice(0, 500);
  }
}

function sessionFileForDate(memDir: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return path.join(memDir, "sessions", `${y}-${m}-${d}.md`);
}

function ensureSessionFile(file: string, date: Date): void {
  if (fs.existsSync(file)) return;
  ensureDir(path.dirname(file));
  const label = date.toISOString().slice(0, 10);
  fs.writeFileSync(
    file,
    `# Sessions — ${label}\n\n> Append-only episodic memory. Auto-captured or logged at session end.\n`,
    "utf8",
  );
}

/** Append a session entry to sessions/YYYY-MM-DD.md (append-only). */
export function logSession(
  workspaceRoot: string,
  input: LogSessionInput,
  projectSlug?: string,
): LogSessionResult {
  const summary = input.summary?.trim();
  if (!summary) throw new Error("Session summary must not be empty.");

  const paths = resolvePaths(workspaceRoot, projectSlug);
  const at = input.loggedAt ? new Date(input.loggedAt) : new Date();
  const sessionFile = sessionFileForDate(paths.memDir, at);
  ensureSessionFile(sessionFile, at);

  const by = input.agent || detectAgent();
  const ts = input.loggedAt || nowISO();
  const time = ts.slice(11, 16);
  const heading = input.title?.trim() || `${time} session`;
  let block = `## ${heading}\n\n${summary}\n`;
  if (input.tags?.length) {
    block += `\n- **Tags**: ${input.tags.join(", ")}\n`;
  }
  if (input.artifacts?.length) {
    block += `\n**Artifacts**: ${input.artifacts.map((a) => `\`${a}\``).join(", ")}\n`;
  }
  block += `\n<!-- centricmem:meta logged_at=${ts} logged_by=${by} -->\n`;
  fs.appendFileSync(sessionFile, block, "utf8");

  return {
    file: path.relative(paths.memDir, sessionFile),
    heading,
  };
}

export interface SessionEntry {
  file: string;
  heading: string;
  summary: string;
  loggedAt: string;
  agent: string;
}

/** Read recent session entries across daily files (newest first). */
export function readRecentSessions(
  workspaceRoot: string,
  days = 7,
  limit = 10,
  projectSlug?: string,
): SessionEntry[] {
  const paths = resolvePaths(workspaceRoot, projectSlug);
  const sessionsDir = path.join(paths.memDir, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const cutoff = Date.now() - days * 86400000;
  const files = fs
    .readdirSync(sessionsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  const out: SessionEntry[] = [];
  for (const f of files) {
    const abs = path.join(sessionsDir, f);
    const mtime = fs.statSync(abs).mtimeMs;
    if (mtime < cutoff && out.length >= limit) break;

    const content = fs.readFileSync(abs, "utf8");
    const rel = path.join("sessions", f);
    const sections = content.split(/^## /m).slice(1);
    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i];
      const nl = section.indexOf("\n");
      const heading = (nl >= 0 ? section.slice(0, nl) : section).trim();
      const body = nl >= 0 ? section.slice(nl + 1) : "";
      const loggedAt =
        /logged_at=(\S+?)(?:\s|-->)/.exec(body)?.[1] ??
        fs.statSync(abs).mtime.toISOString();
      const agent = /logged_by=(\S+?)(?:\s|-->)/.exec(body)?.[1] ?? "unknown";
      const summary = body
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\*\*Artifacts\*\*:[\s\S]*/g, "")
        .replace(/^- \*\*Tags\*\*:.*$/gm, "")
        .trim()
        .slice(0, 300);
      if (!summary) continue;
      out.push({ file: rel, heading, summary, loggedAt, agent });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Count session ## entries in today's sessions/YYYY-MM-DD.md for the project. */
export function countTodaySessions(workspaceRoot: string, projectSlug?: string): number {
  const paths = resolvePaths(workspaceRoot, projectSlug);
  const today = nowISO().slice(0, 10);
  const file = path.join(paths.memDir, "sessions", `${today}.md`);
  if (!fs.existsSync(file)) return 0;
  const content = fs.readFileSync(file, "utf8");
  return (content.match(/^## /gm) ?? []).length;
}

export { resolvePaths };
export type { MemPaths };
