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

const { initProject, logDecision, updateContext, readContext, healthCheck } =
  await import(toImport(path.join(distDir, "memory.js")));
const { buildIndex, buildIndexAll, search, searchAll } = await import(toImport(path.join(distDir, "indexer.js")));
const { migrate } = await import(toImport(path.join(distDir, "migrate.js")));
const { listTemplates, applyTemplate } = await import(toImport(path.join(distDir, "templates.js")));
const { resolvePaths } = await import(toImport(path.join(distDir, "core.js")));
const { linkProject, useProject, listProjects, classifyMemory, UNCLASSIFIED } =
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
  return path.join(ws, ".centricmem", "projects", slug);
}

test("initProject creates workspace hub and unclassified project", () => {
  const ws = freshDir("t1-init");
  const result = initProject(ws);
  assert.ok(fs.existsSync(path.join(ws, ".centricmem", "workspace.json")));
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
  const slug = linkProject(ws, "my-app");
  assert.strictEqual(slug, "my-app");
  useProject(ws, slug);
  const projects = listProjects(ws);
  assert.ok(projects.find((p: { slug: string }) => p.slug === slug)?.current);
});

test("import bundle into unclassified and classify", () => {
  const ws = freshDir("t12-import");
  initProject(ws);
  fs.mkdirSync(path.join(ws, "myapp"));
  const targetSlug = linkProject(ws, "myapp");

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
  const slug = linkProject(ws, "app2");
  logDecision(ws, { title: "UniqueWidget", context: "x", decision: "y" }, slug);
  buildIndexAll(ws);
  const hits = searchAll(ws, "UniqueWidget");
  assert.ok(hits.some((h: { projectSlug?: string }) => h.projectSlug === slug));
});

const { logSession, readRecentSessions } = await import(toImport(path.join(distDir, "session.js")));
const { routeQuery } = await import(toImport(path.join(distDir, "route.js")));
const { promoteToRules, distill } = await import(toImport(path.join(distDir, "memory.js")));
const { dismissChunk } = await import(toImport(path.join(distDir, "indexer.js")));
const { suggestClassify } = await import(toImport(path.join(distDir, "workspace.js")));
const { buildAmbient } = await import(toImport(path.join(distDir, "ambient.js")));

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
  fs.mkdirSync(path.join(ws, "acme-app"));
  fs.writeFileSync(path.join(ws, "acme-app", "package.json"), "{}");
  linkProject(ws, "acme-app");
  const bundle = parseImportBundle({
    version: 1,
    project: UNCLASSIFIED,
    decisions: [{ title: "acme-app deployment", context: "deploy", decision: "k8s" }],
  });
  importBundle(ws, bundle);
  const suggestions = suggestClassify(ws, "decisions/0001-acme-app-deployment.md");
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
  linkProject(ws, "target");
  fs.writeFileSync(path.join(ws, "victim.txt"), "outside memory");
  assert.throws(
    () => classifyMemory(ws, "../../../victim.txt", "target"),
    /Invalid path|Not found/,
  );
  assert.ok(fs.existsSync(path.join(ws, "victim.txt")), "victim file must not move");
});

test("semantic search blends mock embeddings", async () => {
  const ws = freshDir("t22-semantic");
  initProject(ws);
  logDecision(ws, { title: "Vector ranking pipeline", context: "hybrid", decision: "blend bm25 and cosine", agent: "test" });
  const paths = resolvePaths(ws);
  const { buildIndexAsync } = await import(toImport(path.join(distDir, "indexer.js")));

  // Deterministic mock vectors: every chunk gets the same unit vector.
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
