#!/usr/bin/env node
/**
 * cli.ts — CentricMem command line interface (workspace hub).
 */
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { findWorkspaceRoot, resolvePaths, loadConfig } from "./core.js";
import {
  initProject,
  distill,
  healthCheck,
  listDecisions,
  promoteToRules,
  logDecision,
  logLesson,
} from "./memory.js";
import { listTemplates, applyTemplate } from "./templates.js";
import { migrate } from "./migrate.js";
import {
  buildIndex,
  buildIndexAll,
  buildIndexAsync,
  search,
  searchAsync,
  searchAll,
  classifyIntent,
  dismissChunk,
} from "./indexer.js";
import { parseImportBundle, importBundle } from "./import.js";
import {
  linkProject,
  useProject,
  listProjects,
  classifyMemory,
  getCurrentProjectSlug,
  suggestClassify,
} from "./workspace.js";
import { workspaceHealth } from "./workspace-health.js";
import { runSetup, printSetupSummary, installCursorHooks } from "./setup.js";
import { logSession } from "./session.js";
import { routeQuery } from "./route.js";
import { buildAmbient, writeAmbientFile } from "./ambient.js";
import { isEmbeddingEnabled } from "./embedding.js";

const program = new Command();
program.name("centricmem").description("Cross-agent project memory layer (workspace hub)").version("0.9.0");

function requireWorkspace(): string {
  const root = findWorkspaceRoot();
  if (!root) {
    console.error("Error: no CentricMem workspace found. Run `centricmem init` first.");
    process.exit(1);
  }
  return root;
}

function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(!/^n/i.test(answer.trim()));
    });
  });
}

const HOOK_MARKER = "# centricmem-hook";

function installGitHook(root: string): string {
  const hooksDir = path.join(root, ".git", "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookFile = path.join(hooksDir, "post-commit");
  const line = `centricmem index --all --quiet ${HOOK_MARKER}\n`;
  if (fs.existsSync(hookFile)) {
    const existing = fs.readFileSync(hookFile, "utf8");
    if (existing.includes(HOOK_MARKER)) return "git hook already installed (post-commit)";
    fs.appendFileSync(hookFile, `\n${line}`);
  } else {
    fs.writeFileSync(hookFile, `#!/bin/sh\n${line}`, { mode: 0o755 });
  }
  fs.chmodSync(hookFile, 0o755);
  return "installed git post-commit hook (centricmem index --all --quiet)";
}

program
  .command("init")
  .description("Initialise workspace hub (.centricmem/workspace.json + projects/unclassified/)")
  .option("--template <name>", "apply template to current project after init")
  .option("--list-templates", "list built-in templates")
  .option("--git-hook", "install post-commit index hook")
  .option("--no-git-hook", "skip git hook prompt")
  .action(async (opts: { template?: string; listTemplates?: boolean; gitHook?: boolean }) => {
    if (opts.listTemplates) {
      for (const t of listTemplates()) console.log(`  ${t.name.padEnd(14)} ${t.description}`);
      return;
    }
    const cwd = process.cwd();
    const result = initProject(cwd);
    for (const f of result.created) console.log(`  created  ${f}`);
    for (const f of result.skipped) console.log(`  skipped  ${f}`);

    if (opts.template) {
      const applied = applyTemplate(cwd, opts.template);
      for (const f of applied) console.log(`  template ${f}`);
    }

    const gitDir = path.join(cwd, ".git");
    if (fs.existsSync(gitDir) && opts.gitHook !== false) {
      let install = opts.gitHook === true;
      if (!install && process.stdout.isTTY) {
        install = await askYesNo("Install git post-commit hook to auto-index memory? [Y/n]: ");
      }
      if (install) console.log(`  ${installGitHook(cwd)}`);
    }

    buildIndexAll(cwd);
    printSetupSummary(cwd);
  });

program
  .command("setup")
  .description("Guided workspace setup (link projects, discover migrate, install skill)")
  .option("--workspace <path>", "workspace root", process.cwd())
  .option("--link-all", "link subdirectories with .git or package.json")
  .option("--migrate-discover", "import discovered cursor-rules / memory-bank into unclassified")
  .option("--install-skill", "copy SKILL.md to .cursor/skills/centricmem-agent/")
  .option("--install-hooks", "install Cursor session hooks for implicit memory")
  .option("--drive-mcp-hint", "print Drive MCP sync configuration hint")
  .action((opts: {
    workspace: string;
    linkAll?: boolean;
    migrateDiscover?: boolean;
    installSkill?: boolean;
    installHooks?: boolean;
    driveMcpHint?: boolean;
  }) => {
    const result = runSetup({
      workspace: opts.workspace,
      linkAll: opts.linkAll,
      migrateDiscover: opts.migrateDiscover,
      installSkill: opts.installSkill,
      installHooks: opts.installHooks,
      driveMcpHint: opts.driveMcpHint,
    });
    printSetupSummary(result.workspaceRoot);
    if (result.linked.length) console.log(`Linked: ${result.linked.join(", ")}`);
    if (result.migrated) console.log(`Migrated ${result.migrated} source(s) → unclassified`);
    if (result.skillInstalled) console.log("Skill installed to .cursor/skills/centricmem-agent/");
    if (result.hooksInstalled) console.log("Cursor hooks installed to .cursor/hooks/");
  });

program
  .command("link <path>")
  .description("Register a subdirectory as a memory project")
  .action((subpath: string) => {
    const ws = requireWorkspace();
    const slug = linkProject(ws, subpath);
    console.log(`Linked ${subpath} → project "${slug}"`);
    buildIndex(resolvePaths(ws, slug));
  });

program
  .command("use <slug>")
  .description("Switch current project")
  .action((slug: string) => {
    const ws = requireWorkspace();
    useProject(ws, slug);
    console.log(`Current project: ${slug}`);
  });

program
  .command("projects")
  .description("List registered projects")
  .action(() => {
    const ws = requireWorkspace();
    for (const p of listProjects(ws)) {
      console.log(`${p.current ? "*" : " "} ${p.slug}${p.entry.sourceDir ? `  (${p.entry.sourceDir})` : ""}`);
    }
  });

program
  .command("classify <relPath>")
  .description("Move memory from unclassified to a project (path relative to project memDir)")
  .requiredOption("--to <slug>", "target project slug")
  .action((relPath: string, opts: { to: string }) => {
    const ws = requireWorkspace();
    const r = classifyMemory(ws, relPath, opts.to);
    buildIndex(resolvePaths(ws, opts.to));
    console.log(`Moved: ${r.moved.join(", ")} → ${opts.to}`);
  });

program
  .command("suggest-classify <relPath>")
  .description("Suggest target project for unclassified memory")
  .action((relPath: string) => {
    const ws = requireWorkspace();
    const suggestions = suggestClassify(ws, relPath);
    if (!suggestions.length) {
      console.log("No strong matches. Consider creating a new project with `centricmem link`.");
      return;
    }
    for (const s of suggestions) {
      console.log(`${s.slug}  (score ${s.score}) — ${s.reason}`);
    }
  });

program
  .command("import [file]")
  .description("Import ImportBundle JSON into project memory")
  .option("--stdin", "read bundle from stdin")
  .option("--dry-run", "preview counts only")
  .option("-p, --project <slug>", "target project (default: unclassified)")
  .action((file: string | undefined, opts: { stdin?: boolean; dryRun?: boolean; project?: string }) => {
    const ws = requireWorkspace();
    let raw: string;
    if (opts.stdin) {
      raw = fs.readFileSync(0, "utf8");
    } else if (file) {
      raw = fs.readFileSync(file, "utf8");
    } else {
      console.error("Provide a file path or --stdin");
      process.exit(1);
    }
    const bundle = parseImportBundle(raw);
    const r = importBundle(ws, bundle, { dryRun: opts.dryRun, project: opts.project });
    if (opts.dryRun) {
      console.log(
        `Dry run → project ${r.project}: ${r.decisions} decisions, ${r.lessons} lessons, ${r.rules} rules, ${r.imported} docs, ${r.sessions} sessions, ${r.research} research`,
      );
    } else {
      console.log(
        `Imported into ${r.project}: +${r.decisions} decisions, +${r.lessons} lessons, +${r.rules} rules, +${r.imported} docs, +${r.sessions} sessions, +${r.research} research (${r.skipped} skipped)`,
      );
    }
  });

program
  .command("migrate")
  .description("One-way import from cursor-rules | memory-bank | markdown → unclassified")
  .requiredOption("--from <type>", "cursor-rules | memory-bank | markdown")
  .requiredOption("--path <path>", "source path")
  .option("-p, --project <slug>", "target project (default: unclassified)")
  .action((opts: { from: string; path: string; project?: string }) => {
    const ws = findWorkspaceRoot() ?? process.cwd();
    if (!findWorkspaceRoot()) initProject(ws);
    try {
      const result = migrate(ws, opts.from, opts.path, opts.project);
      console.log(`Imported from ${result.from}: ${result.sources.length} source(s)`);
      for (const f of result.imported) console.log(`  -> ${f}`);
      buildIndexAll(ws);
    } catch (err) {
      console.error(`Migration failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("search <query...>")
  .description("Search project memory (FTS5 + optional semantic)")
  .option("-n, --limit <n>", "max results")
  .option("-t, --type <type>", "decision | rule | lesson | context | session | imported")
  .option("-s, --status <status>", "active | superseded | ...")
  .option("-a, --agent <agent>", "filter by agent")
  .option("-p, --project <slug>", "search one project")
  .option("--all", "search all projects")
  .option("--semantic", "hybrid BM25 + embedding search (requires API key)")
  .option("--explain", "show score breakdown")
  .action(async (queryParts: string[], opts: {
    limit?: string; type?: string; status?: string; agent?: string;
    project?: string; all?: boolean; semantic?: boolean; explain?: boolean;
  }) => {
    const ws = requireWorkspace();
    const query = queryParts.join(" ");
    const intent = classifyIntent(query);
    if (intent !== "general") console.log(`(intent: ${intent})`);
    const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;
    const filters = { type: opts.type, status: opts.status, agent: opts.agent };
    const searchOpts = { semantic: opts.semantic, explain: opts.explain };

    if (opts.semantic && !opts.all && !isEmbeddingEnabled(loadConfig(resolvePaths(ws, opts.project)))) {
      console.log("(semantic disabled — no embedding config/API key; using BM25)");
    }

    const results = opts.all
      ? searchAll(ws, query, limit, filters)
      : opts.semantic
        ? await searchAsync(resolvePaths(ws, opts.project), query, limit, filters, searchOpts)
        : search(resolvePaths(ws, opts.project), query, limit, filters, undefined, searchOpts);

    if (!results.length) {
      console.log("No results. Try broader keywords or `centricmem status`.");
      return;
    }
    for (const r of results) {
      const proj = r.projectSlug ? `[${r.projectSlug}] ` : "";
      const statusTag = r.status && r.status !== "active" ? ` [${r.status.toUpperCase()}]` : "";
      console.log(`\n${proj}[${r.score.toFixed(2)}] ${r.heading}  (${r.docType})${statusTag}`);
      console.log(`  file: ${r.file}  |  at: ${r.loggedAt}  |  by: ${r.agent}`);
      console.log(`  ${r.snippet.replace(/\n/g, " ")}`);
      if (r.explain) {
        const e = r.explain;
        console.log(
          `  explain: bm25=${e.bm25.toFixed(3)} cos=${e.cosine.toFixed(3)} rel=${e.relevance.toFixed(3)} time=${e.timeDecay.toFixed(3)} status=${e.statusPenalty} ref=${e.refBoost.toFixed(3)} intent=${e.intentBoost} fb=${e.feedbackPenalty.toFixed(3)}`,
        );
      }
    }
  });

program
  .command("route <query...>")
  .description("Retrieval routing — when to read vs search")
  .option("--json", "output JSON")
  .action((queryParts: string[], opts: { json?: boolean }) => {
    const r = routeQuery(queryParts.join(" "));
    if (opts.json) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`action: ${r.action}`);
      console.log(`intent: ${r.intent}`);
      if (r.suggestedType) console.log(`suggested_type: ${r.suggestedType}`);
      console.log(`reason: ${r.reason}`);
    }
  });

program
  .command("log-session [summary...]")
  .description("Append episodic session entry to sessions/YYYY-MM-DD.md")
  .option("-p, --project <slug>", "project slug")
  .option("--stdin", "read summary from stdin")
  .option("--title <title>", "session heading")
  .action((summaryParts: string[], opts: { project?: string; stdin?: boolean; title?: string }) => {
    const ws = requireWorkspace();
    const summary = opts.stdin ? fs.readFileSync(0, "utf8").trim() : summaryParts.join(" ");
    const r = logSession(ws, { summary, title: opts.title }, opts.project);
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Session logged: ${r.file} → ## ${r.heading}`);
  });

program
  .command("log-decision")
  .description("Append a decision record (append-only, auto sequence)")
  .requiredOption("--title <title>", "decision title")
  .option("--context <text>", "why the decision was needed", "")
  .option("--decision <text>", "what was decided", "")
  .option("--consequences <text>", "trade-offs / follow-ups")
  .option("--tags <tags>", "comma-separated tags")
  .option("--supersedes <seq>", "sequence number this replaces")
  .option("-p, --project <slug>", "project slug")
  .action((opts: {
    title: string; context: string; decision: string; consequences?: string;
    tags?: string; supersedes?: string; project?: string;
  }) => {
    const ws = requireWorkspace();
    const r = logDecision(ws, {
      title: opts.title,
      context: opts.context,
      decision: opts.decision,
      consequences: opts.consequences,
      tags: opts.tags?.split(",").map((t) => t.trim()).filter(Boolean),
      supersedes: opts.supersedes ? parseInt(opts.supersedes, 10) : undefined,
    }, opts.project);
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Decision #${r.seq} logged: ${r.file}`);
  });

program
  .command("log-lesson")
  .description("Append a lesson to lessons.md (idempotent by title)")
  .requiredOption("--title <title>", "lesson title")
  .requiredOption("--body <text>", "what happened and how to avoid it")
  .option("-p, --project <slug>", "project slug")
  .action((opts: { title: string; body: string; project?: string }) => {
    const ws = requireWorkspace();
    const r = logLesson(ws, { title: opts.title, body: opts.body }, opts.project);
    if (r.status === "skipped") {
      console.log(`Lesson "${opts.title}" already exists — skipped.`);
      return;
    }
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Lesson "${opts.title}" appended to lessons.md`);
  });

program
  .command("ambient")
  .description("Implicit memory preflight block (session start)")
  .option("-p, --project <slug>", "project slug")
  .option("--write", "write .centricmem/.ambient.md")
  .action((opts: { project?: string; write?: boolean }) => {
    const ws = requireWorkspace();
    const block = buildAmbient(ws, opts.project);
    console.log(block.text);
    if (opts.write) {
      const f = writeAmbientFile(ws, block);
      console.log(`\nWritten: ${path.relative(ws, f)}`);
    }
  });

program
  .command("promote")
  .description("Promote recurring patterns to Global Rules")
  .option("--from-distill", "show distill suggestions")
  .option("--pattern <text>", "rule text to promote")
  .option("-p, --project <slug>", "project slug")
  .option("--confirm", "write to AGENTS.md (required)")
  .action((opts: { fromDistill?: boolean; pattern?: string; project?: string; confirm?: boolean }) => {
    const ws = requireWorkspace();
    const slug = opts.project ?? getCurrentProjectSlug(ws);

    if (opts.fromDistill) {
      const d = distill(ws, 2, 8, slug);
      console.log(d.suggestion);
      if (d.patterns.length && opts.pattern) {
        const match = d.patterns.find((p) => p.keyword === opts.pattern);
        if (match) {
          const r = promoteToRules(ws, `Follow convention around "${match.keyword}" (appears in ${match.count} decisions)`, {
            confirm: opts.confirm,
            projectSlug: slug,
            source: "distill",
          });
          console.log(r.message);
        }
      }
      return;
    }

    if (!opts.pattern) {
      console.error("Provide --pattern <text> or --from-distill");
      process.exit(1);
    }
    const r = promoteToRules(ws, opts.pattern, { confirm: opts.confirm, projectSlug: slug });
    console.log(r.message);
    if (r.promoted) buildIndex(resolvePaths(ws, slug));
  });

program
  .command("dismiss <file>")
  .description("Negative feedback — down-rank a memory chunk")
  .option("--heading <heading>", "specific section heading")
  .option("-p, --project <slug>", "project slug")
  .action((file: string, opts: { heading?: string; project?: string }) => {
    const ws = requireWorkspace();
    dismissChunk(resolvePaths(ws, opts.project), file, opts.heading);
    console.log(`Dismissed: ${file}${opts.heading ? ` / ${opts.heading}` : ""}`);
  });

program
  .command("status")
  .description("Memory health for current project or workspace")
  .option("-p, --project <slug>", "project slug")
  .option("--workspace", "workspace-level health including unclassified backlog")
  .action((opts: { project?: string; workspace?: boolean }) => {
    const ws = requireWorkspace();

    if (opts.workspace) {
      const wh = workspaceHealth(ws);
      console.log("CentricMem Workspace Status");
      console.log(
        `unclassified: ${wh.unclassified.total} items (decisions ${wh.unclassified.decisions}, lessons ${wh.unclassified.lessons}, imported ${wh.unclassified.imported}, sessions ${wh.unclassified.sessions})`,
      );
      if (wh.unclassified.oldestDate) console.log(`oldest unclassified: ${wh.unclassified.oldestDate}`);
      for (const p of wh.projects) {
        console.log(`  ${p.slug}: health ${p.score} (${p.issues} issue(s))`);
      }
      if (wh.issues.length) {
        console.log("\nIssues:");
        for (const i of wh.issues) console.log(`  • ${i.message}`);
      }
      return;
    }

    const slug = opts.project ?? getCurrentProjectSlug(ws);
    const h = healthCheck(ws, slug);
    const allDecisions = listDecisions(ws, slug);
    const d = distill(ws, 2, 5, slug);

    console.log(`CentricMem Status (project: ${slug})`);
    console.log(`Health: ${h.score}/100`);
    const recent = allDecisions.slice(-5).reverse();
    console.log(`\nDecisions (${h.counts.decisions} total, ${h.counts.activeDecisions} active):`);
    if (!recent.length) console.log("  (none yet)");
    else {
      for (const dec of recent) {
        const date = dec.loggedAt ? dec.loggedAt.slice(0, 10) : "n/a";
        console.log(`  ${String(dec.seq).padStart(4, "0")}. ${dec.title} — ${date} | ${dec.agent}`);
      }
    }
    if (d.patterns.length) {
      console.log("\nDistill patterns (run `centricmem promote --from-distill`):");
      for (const p of d.patterns.slice(0, 5)) {
        console.log(`  • ${p.keyword} [${p.source}] ×${p.count}`);
      }
    }
    if (h.issues.length) {
      console.log("\nIssues:");
      for (const i of h.issues) console.log(`  • ${i.message}`);
    }
  });

program
  .command("index")
  .description("Rebuild FTS5 index (and embeddings when --embed)")
  .option("--all", "index all projects")
  .option("-p, --project <slug>", "index one project")
  .option("-q, --quiet", "suppress output")
  .option("--embed", "also embed chunks via API")
  .action(async (opts: { all?: boolean; project?: string; quiet?: boolean; embed?: boolean }) => {
    const ws = requireWorkspace();
    let stats: import("./indexer.js").IndexStats;
    if (opts.all) {
      stats = buildIndexAll(ws);
      if (opts.embed) {
        let embedded = 0;
        for (const p of listProjects(ws)) {
          embedded += (await buildIndexAsync(resolvePaths(ws, p.slug), { embed: true })).embedded ?? 0;
        }
        stats.embedded = embedded;
      }
    } else {
      const paths = resolvePaths(ws, opts.project);
      stats = opts.embed ? await buildIndexAsync(paths, { embed: true }) : buildIndex(paths);
    }
    if (!opts.quiet) {
      const emb = stats.embedded ? `, ${stats.embedded} embedded` : "";
      console.log(`Scanned ${stats.scanned}: ${stats.indexed} indexed, ${stats.removed} removed, ${stats.chunks} chunks${emb}.`);
    }
  });

program.parse();
