/**
 * integration.test.ts — CentricMem v0.8 workspace integration tests.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..");
const toImport = (p: string) => pathToFileURL(p).href;

  const { initProject, logDecision, updateContext, readContext, healthCheck, autoSessionSummary, logSession, logLesson, countTodaySessions } =
  await import(toImport(path.join(distDir, "memory.js")));
const { buildIndex, buildIndexAll, search, searchAll, searchAllAsync, chunkFile, parseYamlFrontmatter } = await import(toImport(path.join(distDir, "indexer.js")));
const { migrate } = await import(toImport(path.join(distDir, "migrate.js")));
const { listTemplates, applyTemplate } = await import(toImport(path.join(distDir, "templates.js")));
const { resolvePaths } = await import(toImport(path.join(distDir, "core.js")));
const { linkProject, useProject, listProjects, classifyMemory, UNCLASSIFIED, workspaceHealth, loadWorkspace, saveWorkspace } =
  await import(toImport(path.join(distDir, "workspace.js")));
const { parseImportBundle, importBundle } = await import(toImport(path.join(distDir, "import.js")));

let tmpRoot: string;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "CentricMem-test-"));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function freshDir(name: string): string {
  const d = path.join(tmpRoot, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function projectDir(ws: string, slug = UNCLASSIFIED): string {
  return path.join(ws, "projects", slug);
}

test("initProject creates workspace hub and unclassified project", () => {
  const ws = freshDir("t1-init");
  const result = initProject(ws);
  assert.ok(fs.existsSync(path.join(ws, "workspace.json")));
  assert.ok(fs.existsSync(path.join(projectDir(ws), "AGENTS.md")));
  assert.ok(result.created.length > 0);
  const result2 = initProject(ws);
  assert.strictEqual(result2.created.length, 0);
});

test("logDecision writes file with auto-incrementing sequence", () => {
  const ws = freshDir("t2-log");
  initProject(ws);
  const r1 = logDecision(ws, {
    title: "Use SQLite",
    context: "Need embedded DB",
    decision: "SQLite chosen",
    agent: "test-agent",
  });
  assert.strictEqual(r1.seq, 1);
  const r2 = logDecision(ws, { title: "Use TypeScript", context: "x", decision: "y", agent: "test" });
  assert.strictEqual(r2.seq, 2);
});

test("buildIndex indexes project files", () => {
  const ws = freshDir("t3-index");
  initProject(ws);
  logDecision(ws, { title: "Use Redis", context: "Caching", decision: "Redis", agent: "test" });
  const stats = buildIndex(resolvePaths(ws));
  assert.ok(stats.chunks > 0);
});

test("search finds freshly written decision", () => {
  const ws = freshDir("t4-search");
  initProject(ws);
  logDecision(ws, { title: "Adopt PostgreSQL", context: "DB", decision: "PostgreSQL 15", agent: "test" });
  buildIndex(resolvePaths(ws));
  const results = search(resolvePaths(ws), "PostgreSQL");
  assert.ok(results.length > 0);
});

test("search type and status filters work", () => {
  const ws = freshDir("t5-filters");
  initProject(ws);
  logDecision(ws, { title: "Use Nginx", context: "x", decision: "Nginx", agent: "test" });
  const paths = resolvePaths(ws);
  const decFile = path.join(paths.decisionsDir, "0001-use-nginx.md");
  const content = fs.readFileSync(decFile, "utf8");
  fs.writeFileSync(decFile, content.replace("**Status**: Accepted", "**Status**: Superseded"), "utf8");
  buildIndex(paths);
  const activeResults = search(paths, "nginx", undefined, { status: "active" });
  assert.ok(activeResults.every((r: { status: string }) => r.status === "active"));
});

test("readContext summary truncates long AGENTS.md", () => {
  const ws = freshDir("t6-context");
  initProject(ws);
  const agentsFile = path.join(projectDir(ws), "AGENTS.md");
  const padding = Array.from({ length: 60 }, (_, i) => `- Rule ${i + 1}`).join("\n");
  fs.appendFileSync(agentsFile, "\n" + padding);
  const summary = readContext(ws, "summary");
  assert.ok(summary.truncated);
  const full = readContext(ws, "full");
  assert.ok(full.agents!.includes("Rule 60"));
});

test("updateContext overwrites active_context.md", () => {
  const ws = freshDir("t7-update");
  initProject(ws);
  updateContext(ws, "## Focus\n\nAuth module.", "cursor");
  const ctx = readContext(ws, "full");
  assert.ok(ctx.activeContext!.includes("Auth module"));
});

test("healthCheck returns score", () => {
  const ws = freshDir("t8-health");
  initProject(ws);
  const report = healthCheck(ws);
  assert.ok(report.score >= 0 && report.score <= 100);
});

test("migrate cursor-rules imports into AGENTS.md", () => {
  const ws = freshDir("t9-migrate");
  initProject(ws);
  const cursorFile = path.join(ws, "rules.md");
  fs.writeFileSync(cursorFile, "# Rules\n\n- Always write tests\n", "utf8");
  const result = migrate(ws, "cursor-rules", cursorFile);
  assert.ok(result.sources.length > 0);
  const agents = fs.readFileSync(path.join(projectDir(ws), "AGENTS.md"), "utf8");
  assert.ok(agents.includes("Always write tests"));
});

test("applyTemplate is idempotent", () => {
  const ws = freshDir("t10-template");
  initProject(ws);
  assert.ok(listTemplates().length >= 4);
  applyTemplate(ws, "web-app");
  const before = fs.readFileSync(path.join(projectDir(ws), "AGENTS.md"), "utf8");
  applyTemplate(ws, "web-app");
  const after = fs.readFileSync(path.join(projectDir(ws), "AGENTS.md"), "utf8");
  assert.strictEqual(before, after);
});

test("link and use projects", () => {
  const ws = freshDir("t11-link");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "my-app"));
  fs.writeFileSync(path.join(ws, "my-app", "package.json"), "{}");
  const slug = linkProject(ws, "my-app", ws);
  assert.strictEqual(slug, "my-app");
  useProject(ws, slug);
  const projects = listProjects(ws);
  assert.ok(projects.find((p: { slug: string }) => p.slug === slug)?.current);
});

test("import bundle into unclassified and classify", () => {
  const ws = freshDir("t12-import");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "myapp"));
  const targetSlug = linkProject(ws, "myapp", ws);

  const bundle = parseImportBundle({
    version: 1,
    project: UNCLASSIFIED,
    decisions: [{ title: "Pick Bun", context: "runtime", decision: "Use Bun", external_id: "t1" }],
  });
  const ir = importBundle(ws, bundle);
  assert.strictEqual(ir.decisions, 1);

  const decPath = "decisions/0001-pick-bun.md";
  classifyMemory(ws, decPath, targetSlug);
  assert.ok(fs.existsSync(path.join(projectDir(ws, targetSlug), decPath)));
});

test("searchAll finds across projects", () => {
  const ws = freshDir("t13-all");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "app2"));
  const slug = linkProject(ws, "app2", ws);
  logDecision(ws, { title: "UniqueWidget", context: "x", decision: "y" }, slug);
  buildIndexAll(ws);
  const hits = searchAll(ws, "UniqueWidget");
  assert.ok(hits.some((h: { projectSlug?: string }) => h.projectSlug === slug));
});

const { promoteToRules, distill, readRecentSessions } = await import(toImport(path.join(distDir, "memory.js")));
const { routeQuery, buildAmbient, formatUninitializedAmbient, formatUninitializedStatus } = await import(
  toImport(path.join(distDir, "retrieve.js")),
);
const { dismissChunk, extractDecisionLinks, getLinks, decisionId } = await import(toImport(path.join(distDir, "indexer.js")));
const { suggestClassify } = await import(toImport(path.join(distDir, "workspace.js")));

test("logSession appends to sessions/", () => {
  const ws = freshDir("t14-session");
  initProject(ws);
  const r = logSession(ws, { summary: "Implemented feature X", title: "Morning" });
  assert.ok(r.file.replace(/\\/g, "/").startsWith("sessions/"));
  const recent = readRecentSessions(ws, 7, 5);
  assert.ok(recent.some((s: { summary: string }) => s.summary.includes("feature X")));
});

test("route returns retrieval action", () => {
  const r = routeQuery("为什么选 Redis");
  assert.strictEqual(r.action, "search");
  assert.strictEqual(r.intent, "decision");
  const c = routeQuery("当前在做什么");
  assert.strictEqual(c.action, "read_context");
  const l = routeQuery("0003 依赖哪些决策");
  assert.strictEqual(l.action, "refs");
});

test("extractDecisionLinks parses supersedes, refs and mentions", () => {
  const content = [
    "# 0003. Use Redis",
    "",
    "- **Status**: Accepted",
    "- **Supersedes**: #0002",
    "- **Refs**: #0001",
    "",
    "## Decision",
    "",
    "延续 #0001 的缓存策略，同时参考 #0004 的连接池设置。也提到自身 #0003。",
  ].join("\n");
  const links = extractDecisionLinks("decisions/0003-use-redis.md", content);
  const byKey = new Map(links.map((l: { rel: string; toId: string }) => [`${l.rel}|${l.toId}`, l]));
  assert.ok(byKey.has("supersedes|decision:0002"));
  assert.ok(byKey.has("refs|decision:0001"), "explicit ref extracted");
  assert.ok(!byKey.has("mentions|decision:0001"), "explicit ref suppresses mentions edge");
  assert.ok(byKey.has("mentions|decision:0004"), "inline mention extracted");
  assert.ok(![...byKey.keys()].some((k) => (k as string).endsWith("decision:0003")), "self-reference dropped");
});

test("links land in index and getLinks walks both directions", () => {
  const ws = freshDir("t23-links");
  initProject(ws);
  logDecision(ws, { title: "Base cache strategy", context: "c", decision: "d", agent: "test" });
  logDecision(ws, { title: "Redis rate limit", context: "builds on #0001", decision: "redis", agent: "test", refs: [1] });
  const paths = resolvePaths(ws);
  buildIndex(paths);

  const fromTwo = getLinks(paths, 2);
  const rootOut = fromTwo.get(decisionId(2))?.out ?? [];
  assert.ok(rootOut.some((e: { rel: string; toId: string }) => e.rel === "refs" && e.toId === "decision:0001"));

  const fromOne = getLinks(paths, 1);
  const rootIn = fromOne.get(decisionId(1))?.in ?? [];
  assert.ok(rootIn.some((e: { fromFile: string }) => e.fromFile.includes("0002")), "inbound edge visible from target");
});

test("refs boost ranking of referenced decisions", () => {
  const ws = freshDir("t24-refboost");
  initProject(ws);
  logDecision(ws, { title: "CachePolicy alpha", context: "x", decision: "y", agent: "test" });
  logDecision(ws, { title: "CachePolicy beta", context: "x", decision: "y", agent: "test", refs: [1] });
  const paths = resolvePaths(ws);
  buildIndex(paths);
  const results = search(paths, "CachePolicy", 5, undefined, undefined, { explain: true });
  const alpha = results.find((r: { heading: string }) => r.heading.includes("alpha"));
  const beta = results.find((r: { heading: string }) => r.heading.includes("beta"));
  assert.ok(alpha && beta);
  assert.ok(
    alpha!.explain!.refBoost > beta!.explain!.refBoost,
    `referenced decision should have higher refBoost (${alpha!.explain!.refBoost} vs ${beta!.explain!.refBoost})`,
  );
});

test("promote requires confirm", () => {
  const ws = freshDir("t15-promote");
  initProject(ws);
  const dry = promoteToRules(ws, "Always write tests", { confirm: false });
  assert.strictEqual(dry.promoted, false);
  const ok = promoteToRules(ws, "Always write tests", { confirm: true });
  assert.strictEqual(ok.promoted, true);
  const agents = fs.readFileSync(path.join(projectDir(ws), "AGENTS.md"), "utf8");
  assert.ok(agents.includes("Always write tests"));
});

test("search --explain via options", () => {
  const ws = freshDir("t16-explain");
  initProject(ws);
  logDecision(ws, { title: "Use GraphQL", context: "API", decision: "GraphQL", agent: "test" });
  buildIndex(resolvePaths(ws));
  const results = search(resolvePaths(ws), "GraphQL", 5, undefined, undefined, { explain: true });
  assert.ok(results[0]?.explain);
  assert.ok(results[0].explain!.final > 0);
});

test("dismiss down-ranks chunk", () => {
  const ws = freshDir("t17-dismiss");
  initProject(ws);
  logDecision(ws, { title: "DismissMeTopic", context: "x", decision: "y", agent: "test" });
  const paths = resolvePaths(ws);
  buildIndex(paths);
  const decFiles = fs.readdirSync(paths.decisionsDir).filter((f) => f.endsWith(".md"));
  const relFile = path.relative(paths.memDir, path.join(paths.decisionsDir, decFiles[0])).replace(/\\/g, "/");
  dismissChunk(paths, relFile);
  const before = search(paths, "DismissMeTopic", 5, undefined, undefined, { explain: true });
  const fb = before[0]?.explain?.feedbackPenalty ?? 1;
  assert.ok(fb < 1, `expected feedback penalty < 1, got ${fb}`);
});

test("suggestClassify scores projects", () => {
  const ws = freshDir("t18-classify");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "sample-project"));
  fs.writeFileSync(path.join(ws, "sample-project", "package.json"), "{}");
  linkProject(ws, "sample-project", ws);
  const bundle = parseImportBundle({
    version: 1,
    project: UNCLASSIFIED,
    decisions: [{ title: "sample-project deployment", context: "deploy", decision: "k8s" }],
  });
  importBundle(ws, bundle);
  const suggestions = suggestClassify(ws, "decisions/0001-sample-project-deployment.md");
  assert.ok(suggestions.length > 0);
});

test("buildAmbient produces preflight text", () => {
  const ws = freshDir("t19-ambient");
  initProject(ws);
  const block = buildAmbient(ws);
  assert.ok(block.text.includes("CentricMem: project="));
});

test("classify rejects path traversal", () => {
  const ws = freshDir("t21-traversal");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "target"));
  fs.writeFileSync(path.join(ws, "target", "package.json"), "{}");
  linkProject(ws, "target", ws);
  fs.writeFileSync(path.join(ws, "victim.txt"), "outside memory");
  assert.throws(
    () => classifyMemory(ws, "../../../victim.txt", "target"),
    /Invalid path|Not found/,
  );
  assert.ok(fs.existsSync(path.join(ws, "victim.txt")), "victim file must not move");
});

test("semantic search uses RRF with mock embeddings", async () => {
  const ws = freshDir("t22-semantic");
  initProject(ws);
  logDecision(ws, { title: "Vector ranking pipeline", context: "hybrid", decision: "RRF fuse bm25 and cosine", agent: "test" });
  const paths = resolvePaths(ws);
  const { buildIndexAsync } = await import(toImport(path.join(distDir, "indexer.js")));

  const vec = [1, 0, 0];
  const stats = await buildIndexAsync(paths, { mockEmbeddings: Array.from({ length: 100 }, () => vec) });
  assert.ok((stats.embedded ?? 0) > 0, "chunks should be embedded from mocks");

  const results = search(paths, "vector ranking", 5, undefined, undefined, {
    semantic: true,
    explain: true,
    queryEmbedding: vec,
  });
  assert.ok(results.length > 0);
  assert.ok(results[0].explain!.cosine > 0.99, `cosine should be ~1, got ${results[0].explain!.cosine}`);
  assert.ok(results[0].explain!.rrf != null && results[0].explain!.rrf > 0, "RRF score expected");
  assert.ok(results[0].explain!.vecRank != null, "vec rank expected");
  assert.ok(results[0].explain!.validityPenalty === 1);
});

test("validity window penalizes expired docs", () => {
  const ws = freshDir("t26-validity");
  initProject(ws);
  const paths = resolvePaths(ws);
  const importedDir = path.join(paths.memDir, "imported");
  fs.mkdirSync(importedDir, { recursive: true });
  fs.writeFileSync(
    path.join(importedDir, "expired.md"),
    "---\nvalid_until: 2020-01-01\n---\n# Expired auth plan\n\nOld plan about oauth tokens.\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(importedDir, "current.md"),
    "---\nvalid_from: 2020-01-01\n---\n# Current auth plan\n\nCurrent plan about oauth tokens.\n",
    "utf8",
  );
  buildIndex(paths);
  const hits = search(paths, "oauth tokens", 5, undefined, undefined, { explain: true });
  assert.ok(hits.length >= 2);
  const expired = hits.find((h: { file: string }) => h.file.includes("expired"));
  const current = hits.find((h: { file: string }) => h.file.includes("current"));
  assert.ok(expired?.explain);
  assert.ok(current?.explain);
  assert.ok(expired!.explain!.validityPenalty < 0.1);
  assert.strictEqual(current!.explain!.validityPenalty, 1);
  assert.ok(current!.score > expired!.score, "current should outrank expired");
});

test("historical query softens superseded status penalty", () => {
  const ws = freshDir("t27-history");
  initProject(ws);
  const r1 = logDecision(ws, { title: "Old auth strategy", context: "past", decision: "sessions", agent: "test" });
  logDecision(ws, {
    title: "New auth strategy",
    context: "now",
    decision: "JWT",
    agent: "test",
    supersedes: r1.seq,
  });
  const paths = resolvePaths(ws);
  buildIndex(paths);
  const normal = search(paths, "auth strategy", 5, undefined, undefined, { explain: true });
  const hist = search(paths, "what was our auth strategy previously", 5, undefined, undefined, { explain: true });
  const oldNormal = normal.find((h: { heading: string }) => h.heading.includes("Old auth"));
  const oldHist = hist.find((h: { heading: string }) => h.heading.includes("Old auth"));
  assert.ok(oldNormal && oldHist);
  assert.ok(oldNormal!.explain!.statusPenalty <= 0.15);
  assert.ok(oldHist!.explain!.statusPenalty >= 0.4);
});

test("distill surfaces patterns with enough decisions", () => {
  const ws = freshDir("t20-distill");
  initProject(ws);
  for (let i = 0; i < 6; i++) {
    logDecision(ws, {
      title: `Redis cache layer ${i}`,
      context: "perf",
      decision: "use redis",
      tags: ["redis"],
    });
  }
  const d = distill(ws);
  assert.ok(d.patterns.some((p: { keyword: string }) => p.keyword === "redis"));
});

test("parseYamlFrontmatter extracts metadata and body", () => {
  const raw = "---\ncivilization: babylonian\ntype: recipe\nhas_incantation: true\n---\n# Title\n\nBody text.\n";
  const { meta, body } = parseYamlFrontmatter(raw);
  assert.strictEqual(meta.civilization, "babylonian");
  assert.strictEqual(meta.type, "recipe");
  assert.strictEqual(meta.has_incantation, true);
  assert.ok(body.includes("# Title"));
  assert.ok(!body.startsWith("---"));
});

test("search --filter meta matches imported frontmatter", () => {
  const ws = freshDir("t25-meta-filter");
  initProject(ws);
  const paths = resolvePaths(ws);
  const importedDir = path.join(paths.memDir, "imported", "recipes");
  fs.mkdirSync(importedDir, { recursive: true });
  fs.writeFileSync(
    path.join(importedDir, "sample-recipe.md"),
    "---\ncivilization: babylonian\ntype: recipe\nhas_incantation: true\n---\n# Hemorrhoid salve\n\nApply oil to affected area.\n",
    "utf8",
  );
  buildIndex(paths);
  const hits = search(paths, "hemorrhoid", 5, { meta: { civilization: "babylonian", type: "recipe" } });
  assert.ok(hits.length > 0);
  const miss = search(paths, "hemorrhoid", 5, { meta: { civilization: "chinese" } });
  assert.strictEqual(miss.length, 0);
});

test("domain_boost elevates path_prefix matches", () => {
  const ws = freshDir("t26-domain-boost");
  initProject(ws);
  const paths = resolvePaths(ws);
  fs.mkdirSync(path.join(paths.memDir, "imported", "recipes"), { recursive: true });
  fs.mkdirSync(path.join(paths.memDir, "imported", "references"), { recursive: true });
  fs.writeFileSync(path.join(paths.memDir, "imported", "recipes", "herb-a.md"), "# Herb A\n\npharmacology formula\n", "utf8");
  fs.writeFileSync(path.join(paths.memDir, "imported", "references", "ref-b.md"), "# Ref B\n\npharmacology mention\n", "utf8");
  fs.writeFileSync(
    path.join(paths.memDir, "config.json"),
    JSON.stringify({
      domain_boost: {
        default_boost: 2,
        dimensions: {
          "03": { keywords: ["pharmacology", "药物"], path_prefix: "imported/recipes/" },
        },
      },
    }),
    "utf8",
  );
  buildIndex(paths);
  const results = search(paths, "pharmacology", 5, undefined, undefined, { explain: true });
  const herb = results.find((r: { file: string }) => r.file.includes("recipes/herb-a"));
  const ref = results.find((r: { file: string }) => r.file.includes("references/ref-b"));
  assert.ok(herb && ref);
  assert.ok(herb!.explain!.domainBoost > ref!.explain!.domainBoost);
});

test("crosswalk file remains single chunk", () => {
  const ws = freshDir("t27-crosswalk");
  initProject(ws);
  const paths = resolvePaths(ws);
  const crossDir = path.join(paths.memDir, "imported", "crosswalks");
  fs.mkdirSync(crossDir, { recursive: true });
  const rows = Array.from({ length: 40 }, (_, i) => `| row${i} | data${i} |`).join("\n");
  const rel = "imported/crosswalks/disease-map.md";
  fs.writeFileSync(
    path.join(paths.memDir, rel),
    `# Disease map\n\n| id | note |\n|----|------|\n${rows}\n`,
    "utf8",
  );
  assert.strictEqual(chunkFile(paths.memDir, rel).length, 1);
  buildIndex(paths);
  const hits = search(paths, "row39");
  assert.ok(hits.length > 0);
});

test("route academic corpus queries", () => {
  const r = routeQuery("crosswalk 疾病维度对照");
  assert.strictEqual(r.action, "search");
  assert.strictEqual(r.suggestedType, "imported");
});

test("import bundle writes meta frontmatter and rel_path", () => {
  const ws = freshDir("t28-import-meta");
  initProject(ws);
  const bundle = parseImportBundle({
    version: 1,
    imported: [{
      title: "Test doc",
      rel_path: "corpus/recipes/test.md",
      meta: { civilization: "chinese", type: "recipe" },
      body: "Recipe body content.",
      external_id: "test-1",
    }],
  });
  importBundle(ws, bundle);
  const file = path.join(projectDir(ws), "imported", "corpus", "recipes", "test.md");
  assert.ok(fs.existsSync(file));
  const content = fs.readFileSync(file, "utf8");
  assert.ok(content.startsWith("---\ncivilization: chinese"));
  buildIndex(resolvePaths(ws));
  const hits = search(resolvePaths(ws), "Recipe", 5, { meta: { civilization: "chinese" } });
  assert.ok(hits.length > 0);
});

test("import rejects rel_path traversal outside imported/", () => {
  const ws = freshDir("t-import-traversal");
  initProject(ws);
  const outside = path.join(ws, "escaped.md");
  const bundle = parseImportBundle({
    version: 1,
    imported: [{
      title: "Evil",
      body: "should not land outside",
      rel_path: "../../../../escaped.md",
      external_id: "trav:1",
    }],
  });
  assert.throws(() => importBundle(ws, bundle), /Unsafe import path|escapes/);
  assert.ok(!fs.existsSync(outside));
});

test("import rejects absolute rel_path", () => {
  const ws = freshDir("t-import-abs");
  initProject(ws);
  const bundle = parseImportBundle({
    version: 1,
    imported: [{
      title: "Abs",
      body: "nope",
      rel_path: "/tmp/centricmem-evil.md",
    }],
  });
  assert.throws(() => importBundle(ws, bundle), /Unsafe import path|escapes|absolute/);
});

test("import rejects traversal stored in idempotency map", () => {
  const ws = freshDir("t-import-idem-trav");
  initProject(ws);
  const paths = resolvePaths(ws);
  fs.writeFileSync(
    path.join(paths.memDir, ".import-idempotency.json"),
    JSON.stringify({
      keys: ["imported:idem-trav"],
      paths: { "imported:idem-trav": "../../../outside-idem.md" },
    }),
    "utf8",
  );
  const outside = path.join(ws, "outside-idem.md");
  const bundle = parseImportBundle({
    version: 1,
    imported: [{
      title: "Idem",
      body: "body",
      external_id: "idem-trav",
      rel_path: "safe.md",
    }],
  });
  assert.throws(() => importBundle(ws, bundle), /Unsafe import path|escapes/);
  assert.ok(!fs.existsSync(outside));
});

const {
  skillStatus,
  compareSemver,
  satisfiesCliRange,
  bundledSkillPath,
  readSkillInfo,
  formatUninitializedSkillStatus,
  formatUninitializedSkillStatusText,
} = await import(toImport(path.join(distDir, "skill.js")));
const { runSetup } = await import(toImport(path.join(distDir, "setup.js")));
const { findWorkspaceRoot } = await import(toImport(path.join(distDir, "core.js")));

test("compareSemver orders versions", () => {
  assert.ok(compareSemver("0.11.1", "0.11.0") > 0);
  assert.strictEqual(compareSemver("1.0.0", "1.0.0"), 0);
});

test("satisfiesCliRange supports >=", () => {
  assert.ok(satisfiesCliRange("0.11.1", ">=0.11.0"));
  assert.ok(!satisfiesCliRange("0.10.0", ">=0.11.0"));
});

test("skill status reports missing installed skill", () => {
  const ws = freshDir("t29-skill-missing");
  initProject(ws);
  const r = skillStatus(ws);
  assert.strictEqual(r.status, "missing");
});

test("skill status reports outdated installed skill", () => {
  const ws = freshDir("t30-skill-outdated");
  initProject(ws);
  const destDir = path.join(ws, "skills", "centricmem-agent");
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(
    path.join(destDir, "SKILL.md"),
    "---\nname: centricmem-agent\nversion: 0.0.1\ncompatible_cli: \">=0.12.0\"\n---\n# Old skill\n",
    "utf8",
  );
  const r = skillStatus(ws);
  assert.strictEqual(r.status, "outdated");
  assert.ok(r.bundled!.version && compareSemver(r.bundled!.version, "0.0.1") > 0);
});

test("skill status reports modified when body differs at same version", () => {
  const ws = freshDir("t31-skill-modified");
  initProject(ws);
  const bundled = readSkillInfo(bundledSkillPath("centricmem-agent"));
  assert.ok(bundled?.version);
  const destDir = path.join(ws, "skills", "centricmem-agent");
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(
    path.join(destDir, "SKILL.md"),
    `---\nname: centricmem-agent\nversion: ${bundled.version}\n---\n# User edited copy\n`,
    "utf8",
  );
  const r = skillStatus(ws);
  assert.strictEqual(r.status, "modified");
});

test("skill status reports incompatible cli via install path", () => {
  const ws = freshDir("t32-skill-incompat");
  initProject(ws);
  const fixture = path.join(ws, "fake-skill.md");
  fs.writeFileSync(
    fixture,
    "---\nname: test-skill\nversion: 1.0.0\ncompatible_cli: \">=99.0.0\"\n---\n# x\n",
    "utf8",
  );
  const r = skillStatus(ws, { name: "test-skill", installPath: fixture });
  assert.strictEqual(r.status, "incompatible");
});

test("ambient includes skill hint when outdated", () => {
  const ws = freshDir("t33-ambient-skill");
  initProject(ws);
  const destDir = path.join(ws, "skills", "centricmem-agent");
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(
    path.join(destDir, "SKILL.md"),
    "---\nname: centricmem-agent\nversion: 0.0.1\n---\n# Old\n",
    "utf8",
  );
  const block = buildAmbient(ws);
  assert.ok(block.text.includes("Skill:") && block.text.includes("outdated"));
});

test("skill status hints migrate when legacy path exists", () => {
  const ws = freshDir("t34-legacy-skill");
  initProject(ws);
  const legacyDir = path.join(ws, ".cursor", "skills", "centricmem-agent");
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(
    path.join(legacyDir, "SKILL.md"),
    "---\nname: centricmem-agent\nversion: 0.11.1\n---\n# Legacy\n",
    "utf8",
  );
  const r = skillStatus(ws);
  assert.strictEqual(r.status, "missing");
  assert.ok(r.hint?.includes("legacy path"));
});

test("import upserts imported docs with same external_id", () => {
  const ws = freshDir("t35-upsert");
  initProject(ws);
  const bundle1 = parseImportBundle({
    version: 1,
    imported: [{ title: "Cap Doc", body: "version one", external_id: "cap:1", rel_path: "cap/doc.md" }],
  });
  const r1 = importBundle(ws, bundle1);
  assert.strictEqual(r1.imported, 1);
  assert.strictEqual(r1.updated, 0);

  const bundle2 = parseImportBundle({
    version: 1,
    imported: [{ title: "Cap Doc", body: "version two UPDATED", external_id: "cap:1", rel_path: "cap/doc.md" }],
  });
  const r2 = importBundle(ws, bundle2);
  assert.strictEqual(r2.imported, 0);
  assert.strictEqual(r2.updated, 1);
  assert.strictEqual(r2.skipped, 0);

  const file = path.join(projectDir(ws), "imported", "cap", "doc.md");
  assert.ok(fs.readFileSync(file, "utf8").includes("version two UPDATED"));

  const r3 = importBundle(ws, bundle2, { skipExisting: true });
  assert.strictEqual(r3.skipped, 1);
  assert.strictEqual(r3.updated, 0);
});

test("import rules with external_id skip on re-import", () => {
  const ws = freshDir("t36-rule-id");
  initProject(ws);
  const bundle = parseImportBundle({
    version: 1,
    rules: [{ title: "Vitest", body: "Use vitest", external_id: "rule:vitest" }],
  });
  const r1 = importBundle(ws, bundle);
  assert.strictEqual(r1.rules, 1);
  const agents1 = fs.readFileSync(path.join(projectDir(ws), "AGENTS.md"), "utf8");
  const count1 = (agents1.match(/Imported Rule: Vitest/g) ?? []).length;
  assert.strictEqual(count1, 1);

  const r2 = importBundle(ws, bundle);
  assert.strictEqual(r2.rules, 0);
  assert.strictEqual(r2.skipped, 1);
  const agents2 = fs.readFileSync(path.join(projectDir(ws), "AGENTS.md"), "utf8");
  assert.strictEqual((agents2.match(/Imported Rule: Vitest/g) ?? []).length, 1);
});

test("matchProjectByCwd selects project from sourceDir", async () => {
  const { matchProjectByCwd, getCurrentProjectSlug } = await import(toImport(path.join(distDir, "workspace.js")));
  const home = freshDir("t37-cwd-match-home");
  const code = freshDir("t37-cwd-match-code");
  initProject(home);
  fs.writeFileSync(path.join(code, "package.json"), "{}");
  const slug = linkProject(home, code, path.dirname(code));
  assert.ok(slug);
  assert.strictEqual(matchProjectByCwd(home, code), slug);
  assert.strictEqual(getCurrentProjectSlug(home, code), slug);
});

test("migrateFromLocalHub moves repo .centricmem into product home", async () => {
  const { migrateFromLocalHub } = await import(toImport(path.join(distDir, "setup.js")));
  const code = freshDir("t38-migrate-code");
  const home = freshDir("t38-migrate-home");
  // Simulate legacy nested hub inside code repo
  const legacy = path.join(code, ".centricmem");
  fs.mkdirSync(path.join(legacy, "projects", "unclassified", "decisions"), { recursive: true });
  fs.writeFileSync(
    path.join(legacy, "workspace.json"),
    JSON.stringify({
      version: 1,
      current: "demo",
      projects: {
        unclassified: { path: "unclassified", linked_at: "2026-01-01T00:00:00.000Z", system: true },
        demo: { path: "demo", linked_at: "2026-01-01T00:00:00.000Z", sourceDir: "." },
      },
    }) + "\n",
  );
  fs.mkdirSync(path.join(legacy, "projects", "demo"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "projects", "demo", "AGENTS.md"), "# demo\n");
  const ok = migrateFromLocalHub(home, code);
  assert.ok(ok);
  assert.ok(fs.existsSync(path.join(home, "workspace.json")));
  assert.ok(fs.existsSync(path.join(home, "projects", "demo", "AGENTS.md")));
  assert.ok(!fs.existsSync(legacy));
});

test("log-session --auto uses Current Focus", () => {
  const ws = freshDir("t28-auto-session");
  initProject(ws);
  const ctx = path.join(projectDir(ws), "active_context.md");
  fs.writeFileSync(
    ctx,
    `# Active Context\n\n## Current Focus\n\nShipping RRF search polish\n\n<!-- centricmem:meta updated_at=2026-07-11T00:00:00.000Z updated_by=test -->\n`,
    "utf8",
  );
  const summary = autoSessionSummary(ws);
  assert.ok(summary.includes("Shipping RRF search polish"));
  const r = logSession(ws, { summary, title: "hooks" });
  const body = fs.readFileSync(path.join(projectDir(ws), r.file), "utf8");
  assert.ok(body.includes("Shipping RRF search polish"));
});

test("workspaceHealth warns on broken sourceDir", () => {
  const ws = freshDir("t29-broken-link");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "app"), { recursive: true });
  fs.writeFileSync(path.join(ws, "app", "package.json"), "{}");
  const slug = linkProject(ws, "app", ws);
  const cfg = loadWorkspace(ws);
  cfg.projects[slug].sourceDir = path.join(ws, "does-not-exist-xyz");
  saveWorkspace(ws, cfg);
  const wh = workspaceHealth(ws);
  assert.ok(wh.issues.some((i: { message: string }) => i.message.includes("broken sourceDir") && i.message.includes(slug)));
});

test("workspaceHealth warns when CENTRICMEM_HOME lacks workspace.json", () => {
  const bogus = freshDir("t30-bad-env");
  const prevHome = process.env.CENTRICMEM_HOME;
  const prevWs = process.env.CENTRICMEM_WORKSPACE;
  process.env.CENTRICMEM_HOME = bogus;
  delete process.env.CENTRICMEM_WORKSPACE;
  try {
    const hub = freshDir("t30-hub");
    initProject(hub);
    const wh = workspaceHealth(hub);
    assert.ok(wh.issues.some((i: { message: string }) => i.message.includes("CENTRICMEM_HOME") && i.message.includes("workspace.json")));
  } finally {
    if (prevHome === undefined) delete process.env.CENTRICMEM_HOME;
    else process.env.CENTRICMEM_HOME = prevHome;
    if (prevWs === undefined) delete process.env.CENTRICMEM_WORKSPACE;
    else process.env.CENTRICMEM_WORKSPACE = prevWs;
  }
});

test("searchAllAsync passes semantic explain across projects", async () => {
  const ws = freshDir("t31-all-semantic");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "app2"));
  const slug = linkProject(ws, "app2", ws);
  logDecision(ws, { title: "CrossProjectAlpha", context: "x", decision: "y" }, slug);
  const paths = resolvePaths(ws, slug);
  const { buildIndexAsync } = await import(toImport(path.join(distDir, "indexer.js")));
  const vec = [1, 0, 0];
  await buildIndexAsync(paths, { mockEmbeddings: Array.from({ length: 50 }, () => vec) });
  const hits = await searchAllAsync(ws, "CrossProjectAlpha", 5, undefined, {
    semantic: true,
    explain: true,
    queryEmbedding: vec,
  });
  assert.ok(hits.some((h: { projectSlug?: string; explain?: { rrf?: number } }) => h.projectSlug === slug && h.explain?.rrf != null));
});

test("uninitialized ambient/status text is parseable and distinct from skill missing", () => {
  const home = freshDir("t-uninit-home");
  const block = formatUninitializedAmbient(home);
  assert.strictEqual(block.state, "UNINITIALIZED");
  assert.ok(block.text.includes("state=UNINITIALIZED"));
  assert.ok(block.text.includes(`home=${home}`));
  assert.ok(block.text.includes("centricmem setup --bootstrap"));
  const statusText = formatUninitializedStatus(home);
  assert.ok(statusText.includes("UNINITIALIZED"));
  assert.ok(statusText.includes("setup --bootstrap"));
  const skillJson = formatUninitializedSkillStatus(home);
  assert.strictEqual(skillJson.hub, "UNINITIALIZED");
  assert.ok(formatUninitializedSkillStatusText(home).includes("hub:       UNINITIALIZED"));
});

test("setup --bootstrap links children and installs skill", () => {
  const home = freshDir("t-bootstrap-home");
  const codeRoot = freshDir("t-bootstrap-code");
  const child = path.join(codeRoot, "demo-app");
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(child, "package.json"), '{"name":"demo-app"}\n');
  const result = runSetup({
    workspace: home,
    codeRoot,
    bootstrap: true,
  });
  assert.ok(result.skillInstalled);
  assert.ok(result.linked.includes("demo-app"));
  assert.ok(fs.existsSync(path.join(home, "skills", "centricmem-agent", "SKILL.md")));
  assert.ok(findWorkspaceRoot(home) === home || fs.existsSync(path.join(home, "workspace.json")));
  const block = buildAmbient(home);
  assert.notEqual(block.state, "UNINITIALIZED");
  assert.ok(block.text.includes("CentricMem:"));
  const skill = skillStatus(home);
  assert.notEqual(skill.status, "missing");
});

test("setup --link links explicit paths", () => {
  const home = freshDir("t-link-paths-home");
  const codeRoot = freshDir("t-link-paths-code");
  const other = freshDir("t-link-paths-other");
  fs.writeFileSync(path.join(other, "package.json"), '{"name":"other"}\n');
  const result = runSetup({
    workspace: home,
    codeRoot,
    linkPaths: [other],
    installSkill: true,
  });
  assert.ok(result.linked.some((s: string) => s.includes("t-link-paths-other") || s === "t-link-paths-other"));
  assert.ok(result.skillInstalled);
});

test("logSession writes Tags line and search finds tag", () => {
  const ws = freshDir("t-session-tags");
  initProject(ws);
  logSession(ws, { summary: "Deployed matrix trial stack", tags: ["work", "deploy", "matrix"] });
  const today = new Date().toISOString().slice(0, 10);
  const body = fs.readFileSync(path.join(ws, "projects", "unclassified", "sessions", `${today}.md`), "utf8");
  assert.ok(body.includes("- **Tags**: work, deploy, matrix"));
  assert.strictEqual(countTodaySessions(ws), 1);
  buildIndex(resolvePaths(ws));
  const hits = search(resolvePaths(ws), "matrix", 5);
  assert.ok(hits.some((h: { file?: string; content?: string }) => (h.file ?? "").includes("sessions/") || (h.content ?? "").includes("matrix")));
});

test("ambient shows today_sessions curate hint", () => {
  const ws = freshDir("t-ambient-curate");
  initProject(ws);
  const empty = buildAmbient(ws);
  assert.ok(empty.text.includes("today_sessions=0"));
  assert.ok(empty.text.includes("Curate:"));
  logSession(ws, { summary: "Did work", tags: ["work"] });
  const filled = buildAmbient(ws);
  assert.ok(filled.text.includes("today_sessions=1"));
});

test("logLesson accepts tags", () => {
  const ws = freshDir("t-lesson-tags");
  initProject(ws);
  const r = logLesson(ws, {
    title: "Cloud must close session",
    body: "Non-Micro without log-session loses memory",
    tags: ["ops", "docs"],
  });
  assert.strictEqual(r.status, "added");
  const body = fs.readFileSync(path.join(ws, "projects", "unclassified", "lessons.md"), "utf8");
  assert.ok(body.includes("- **Tags**: ops, docs"));
});
