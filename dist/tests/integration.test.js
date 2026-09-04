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
const toImport = (p) => pathToFileURL(p).href;
const { initProject, logDecision, updateContext, readContext, healthCheck, autoSessionSummary, logSession, logLesson, countTodaySessions, keepOriginal, showMemory } = await import(toImport(path.join(distDir, "memory.js")));
const { buildIndex, buildIndexAll, search, searchAll, searchAllAsync, searchScoped, chunkFile, parseYamlFrontmatter, folksonomyFromCorpusMeta, slugFolksonomyTag, shouldSkipIndexDir, shouldSkipIndexFile, isCorpusLeafCatalog, pathRetrievalBoost, corpusRetrievalBoost, dedupeSearchByWork, parseAddressQuery, normalizeKey } = await import(toImport(path.join(distDir, "indexer.js")));
const { migrate } = await import(toImport(path.join(distDir, "migrate.js")));
const { listTemplates, applyTemplate } = await import(toImport(path.join(distDir, "templates.js")));
const { resolvePaths, redactSecrets, looksLikeClientFolder, persistProductHome, assertLibraryPath, resolveProductHome } = await import(toImport(path.join(distDir, "core.js")));
const { linkProject, useProject, listProjects, classifyMemory, UNCLASSIFIED, workspaceHealth, loadWorkspace, saveWorkspace, getCurrentProjectSlug, listInbox, applyInbox, ensureProjectRegistered } = await import(toImport(path.join(distDir, "workspace.js")));
const { parseImportBundle, importBundle } = await import(toImport(path.join(distDir, "import.js")));
let tmpRoot;
let prevCatalogEnv;
let prevUrlEnv;
before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "CentricMem-test-"));
    prevCatalogEnv = process.env.CENTRICMEM_LIBRARIES_JSON;
    prevUrlEnv = process.env.CENTRICMEM_URL;
    process.env.CENTRICMEM_LIBRARIES_JSON = path.join(tmpRoot, "libraries.json");
    // Live guest machines export CENTRICMEM_URL; local hub tests must not inherit it.
    delete process.env.CENTRICMEM_URL;
});
after(() => {
    if (prevCatalogEnv === undefined)
        delete process.env.CENTRICMEM_LIBRARIES_JSON;
    else
        process.env.CENTRICMEM_LIBRARIES_JSON = prevCatalogEnv;
    if (prevUrlEnv === undefined)
        delete process.env.CENTRICMEM_URL;
    else
        process.env.CENTRICMEM_URL = prevUrlEnv;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});
function freshDir(name) {
    const d = path.join(tmpRoot, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
}
function projectDir(ws, slug = UNCLASSIFIED) {
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
    assert.ok(activeResults.every((r) => r.status === "active"));
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
    assert.ok(full.agents.includes("Rule 60"));
});
test("updateContext overwrites active_context.md", () => {
    const ws = freshDir("t7-update");
    initProject(ws);
    updateContext(ws, "## Focus\n\nAuth module.", "cursor");
    const ctx = readContext(ws, "full");
    assert.ok(ctx.activeContext.includes("Auth module"));
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
    assert.ok(projects.find((p) => p.slug === slug)?.current);
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
    assert.ok(hits.some((h) => h.projectSlug === slug));
});
const { promoteToRules, distill, readRecentSessions } = await import(toImport(path.join(distDir, "memory.js")));
const { routeQuery, buildAmbient, formatUninitializedAmbient, formatUninitializedStatus } = await import(toImport(path.join(distDir, "retrieve.js")));
const { runDoctor } = await import(toImport(path.join(distDir, "doctor.js")));
const { dismissChunk, extractDecisionLinks, getLinks, decisionId } = await import(toImport(path.join(distDir, "indexer.js")));
const { suggestClassify } = await import(toImport(path.join(distDir, "workspace.js")));
test("logSession appends to sessions/", () => {
    const ws = freshDir("t14-session");
    initProject(ws);
    const r = logSession(ws, { summary: "Implemented feature X", title: "Morning", agent: "cursor" });
    assert.ok(r.file.replace(/\\/g, "/").startsWith("sessions/"));
    assert.match(r.file.replace(/\\/g, "/"), /sessions\/\d{4}-\d{2}-\d{2}T\d{6}Z-cursor-[a-f0-9]{6}\.md/);
    const recent = readRecentSessions(ws, 7, 5);
    assert.ok(recent.some((s) => s.summary.includes("feature X")));
});
test("two logSession writes do not share a daily file", () => {
    const ws = freshDir("t14-session-unique");
    initProject(ws);
    const a = logSession(ws, { summary: "Laptop close", title: "desk", agent: "cursor" });
    const b = logSession(ws, { summary: "VPS close", title: "cloud", agent: "cursor" });
    assert.notEqual(a.file, b.file);
    const dir = path.join(projectDir(ws), "sessions");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    assert.equal(files.length, 2);
    assert.ok(fs.readFileSync(path.join(dir, path.basename(a.file)), "utf8").includes("Laptop close"));
    assert.ok(fs.readFileSync(path.join(dir, path.basename(b.file)), "utf8").includes("VPS close"));
});
test("logSession heading is a short summary when title is omitted", () => {
    const ws = freshDir("t14-session-title");
    initProject(ws);
    const r = logSession(ws, {
        summary: "Shipped unique session files so two writers can sync. Also documented Drive as L2.",
        agent: "cursor",
    });
    assert.equal(r.heading, "Shipped unique session files so two writers can sync.");
    const body = fs.readFileSync(path.join(projectDir(ws), r.file), "utf8");
    assert.ok(body.startsWith("## Shipped unique session files so two writers can sync.\n"));
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
    const byKey = new Map(links.map((l) => [`${l.rel}|${l.toId}`, l]));
    assert.ok(byKey.has("supersedes|decision:0002"));
    assert.ok(byKey.has("refs|decision:0001"), "explicit ref extracted");
    assert.ok(!byKey.has("mentions|decision:0001"), "explicit ref suppresses mentions edge");
    assert.ok(byKey.has("mentions|decision:0004"), "inline mention extracted");
    assert.ok(![...byKey.keys()].some((k) => k.endsWith("decision:0003")), "self-reference dropped");
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
    assert.ok(rootOut.some((e) => e.rel === "refs" && e.toId === "decision:0001"));
    const fromOne = getLinks(paths, 1);
    const rootIn = fromOne.get(decisionId(1))?.in ?? [];
    assert.ok(rootIn.some((e) => e.fromFile.includes("0002")), "inbound edge visible from target");
});
test("refs boost ranking of referenced decisions", () => {
    const ws = freshDir("t24-refboost");
    initProject(ws);
    logDecision(ws, { title: "CachePolicy alpha", context: "x", decision: "y", agent: "test" });
    logDecision(ws, { title: "CachePolicy beta", context: "x", decision: "y", agent: "test", refs: [1] });
    const paths = resolvePaths(ws);
    buildIndex(paths);
    const results = search(paths, "CachePolicy", 5, undefined, undefined, { explain: true });
    const alpha = results.find((r) => r.heading.includes("alpha"));
    const beta = results.find((r) => r.heading.includes("beta"));
    assert.ok(alpha && beta);
    assert.ok(alpha.explain.refBoost > beta.explain.refBoost, `referenced decision should have higher refBoost (${alpha.explain.refBoost} vs ${beta.explain.refBoost})`);
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
    assert.ok(results[0].explain.final > 0);
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
test("suggestClassify uses classify_hints from config.json", () => {
    const ws = freshDir("t18b-hints");
    initProject(ws);
    ensureProjectRegistered(ws, "host");
    const hostCfg = path.join(projectDir(ws, "host"), "config.json");
    const cfg = JSON.parse(fs.readFileSync(hostCfg, "utf8"));
    cfg.classify_hints = ["van68", "vanguard"];
    fs.writeFileSync(hostCfg, JSON.stringify(cfg, null, 2) + "\n");
    const logged = logDecision(ws, {
        title: "LoL VAN 68 is vgc crashing",
        context: "League handshake then VAN 68",
        decision: "Check vgc SERVICE_EXIT_CODE before reinstalling Vanguard",
        tags: ["ops", "infra"],
    }, UNCLASSIFIED);
    const rel = logged.file.replace(/\\/g, "/").replace(/^.*?(decisions\/)/, "decisions/");
    const suggestions = suggestClassify(ws, rel);
    assert.ok(suggestions.some((s) => s.slug === "host" && s.score >= 3), JSON.stringify(suggestions));
});
test("buildAmbient produces preflight text", () => {
    const ws = freshDir("t19-ambient");
    initProject(ws);
    const block = buildAmbient(ws);
    assert.ok(block.text.includes("CentricMem: project="));
    assert.ok(block.text.includes("inbox="));
    assert.ok(block.text.includes("working_set=3dec+3tail"));
});
test("ambient lists corpus= for domain_boost projects", () => {
    const ws = freshDir("t-ambient-corpus");
    initProject(ws);
    ensureProjectRegistered(ws, "ancient-medicine");
    const cfgPath = path.join(projectDir(ws, "ancient-medicine"), "config.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfg.domain_boost = {
        dimensions: { "01": { keywords: ["disease"], path_prefix: "imported/academic/" } },
    };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg), "utf8");
    const block = buildAmbient(ws);
    assert.ok(block.text.includes("corpus=ancient-medicine"), block.text);
});
test("classify rejects path traversal", () => {
    const ws = freshDir("t21-traversal");
    initProject(ws);
    fs.mkdirSync(path.join(ws, "target"));
    fs.writeFileSync(path.join(ws, "target", "package.json"), "{}");
    linkProject(ws, "target", ws);
    fs.writeFileSync(path.join(ws, "victim.txt"), "outside memory");
    assert.throws(() => classifyMemory(ws, "../../../victim.txt", "target"), /Invalid path|Not found/);
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
    assert.ok(results[0].explain.cosine > 0.99, `cosine should be ~1, got ${results[0].explain.cosine}`);
    assert.ok(results[0].explain.rrf != null && results[0].explain.rrf > 0, "RRF score expected");
    assert.ok(results[0].explain.vecRank != null, "vec rank expected");
    assert.ok(results[0].explain.validityPenalty === 1);
});
test("validity window penalizes expired docs", () => {
    const ws = freshDir("t26-validity");
    initProject(ws);
    const paths = resolvePaths(ws);
    const importedDir = path.join(paths.memDir, "imported");
    fs.mkdirSync(importedDir, { recursive: true });
    fs.writeFileSync(path.join(importedDir, "expired.md"), "---\nvalid_until: 2020-01-01\n---\n# Expired auth plan\n\nOld plan about oauth tokens.\n", "utf8");
    fs.writeFileSync(path.join(importedDir, "current.md"), "---\nvalid_from: 2020-01-01\n---\n# Current auth plan\n\nCurrent plan about oauth tokens.\n", "utf8");
    buildIndex(paths);
    const hits = search(paths, "oauth tokens", 5, undefined, undefined, { explain: true });
    assert.ok(hits.length >= 2);
    const expired = hits.find((h) => h.file.includes("expired"));
    const current = hits.find((h) => h.file.includes("current"));
    assert.ok(expired?.explain);
    assert.ok(current?.explain);
    assert.ok(expired.explain.validityPenalty < 0.1);
    assert.strictEqual(current.explain.validityPenalty, 1);
    assert.ok(current.score > expired.score, "current should outrank expired");
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
    const oldNormal = normal.find((h) => h.heading.includes("Old auth"));
    const oldHist = hist.find((h) => h.heading.includes("Old auth"));
    assert.ok(oldNormal && oldHist);
    assert.ok(oldNormal.explain.statusPenalty <= 0.15);
    assert.ok(oldHist.explain.statusPenalty >= 0.4);
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
    assert.ok(d.patterns.some((p) => p.keyword === "redis"));
});
test("parseYamlFrontmatter reads block lists", () => {
    const raw = "---\ntags:\n- eye-disease\nbody_parts:\n- head\ncivilization: babylonian\n---\n# T\n";
    const { meta } = parseYamlFrontmatter(raw);
    assert.deepEqual(meta.tags, ["eye-disease"]);
    assert.deepEqual(meta.body_parts, ["head"]);
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
test("corpus folksonomy tags include body_parts and path collection", () => {
    assert.deepEqual(slugFolksonomyTag("babylonia"), ["babylonian"]);
    assert.ok(slugFolksonomyTag("Neo-Assyrian / Mesopotamian").includes("neo-assyrian"));
    const tags = folksonomyFromCorpusMeta({
        tags: ["eye-disease"],
        body_parts: ["head"],
        methods: ["topical"],
        civilization: "Babylonian",
        type: "recipe",
    }, "imported/academic/corpus/recipes/bam10-igi/rec.md");
    assert.ok(tags.includes("eye-disease"));
    assert.ok(tags.includes("head"));
    assert.ok(tags.includes("topical"));
    assert.ok(tags.includes("babylonian"));
    assert.ok(tags.includes("recipe"));
    assert.ok(tags.includes("bam10"));
    const sessionTags = folksonomyFromCorpusMeta({ tags: ["VAN68"] }, "sessions/2026-01-01.md");
    assert.ok(sessionTags.includes("VAN68"));
    assert.ok(!sessionTags.includes("van68"));
});
test("search --tag hits YAML body_parts on corpus cards", () => {
    const ws = freshDir("t-corpus-yaml-tags");
    initProject(ws);
    const paths = resolvePaths(ws);
    const dir = path.join(paths.memDir, "imported", "academic", "corpus", "recipes", "bam10-igi");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "rec-bam10-igi-001.md"), [
        "---",
        "civilization: babylonian",
        "type: recipe",
        "body_parts:",
        "- head",
        "methods:",
        "- topical",
        "tags:",
        "- eye-disease",
        "---",
        "# IGI salve",
        "",
        "White honey in ghee applied to the eyes.",
        "",
    ].join("\n"), "utf8");
    buildIndex(paths);
    const byPart = search(paths, "", 8, { tags: ["head"] });
    assert.ok(byPart.some((h) => h.file.includes("rec-bam10-igi-001")));
    const byCiv = search(paths, "", 8, { tags: ["babylonian"] });
    assert.ok(byCiv.length >= 1);
    const byColl = search(paths, "tag:bam10", 8);
    assert.ok(byColl.some((h) => h.file.includes("bam10")));
});
test("search --filter meta matches imported frontmatter", () => {
    const ws = freshDir("t25-meta-filter");
    initProject(ws);
    const paths = resolvePaths(ws);
    const importedDir = path.join(paths.memDir, "imported", "recipes");
    fs.mkdirSync(importedDir, { recursive: true });
    fs.writeFileSync(path.join(importedDir, "sample-recipe.md"), "---\ncivilization: babylonian\ntype: recipe\nhas_incantation: true\n---\n# Hemorrhoid salve\n\nApply oil to affected area.\n", "utf8");
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
    fs.writeFileSync(path.join(paths.memDir, "config.json"), JSON.stringify({
        domain_boost: {
            default_boost: 2,
            dimensions: {
                "03": { keywords: ["pharmacology", "药物"], path_prefix: "imported/recipes/" },
            },
        },
    }), "utf8");
    buildIndex(paths);
    const results = search(paths, "pharmacology", 5, undefined, undefined, { explain: true });
    const herb = results.find((r) => r.file.includes("recipes/herb-a"));
    const ref = results.find((r) => r.file.includes("references/ref-b"));
    assert.ok(herb && ref);
    assert.ok(herb.explain.domainBoost > ref.explain.domainBoost);
});
test("crosswalk file remains single chunk", () => {
    const ws = freshDir("t27-crosswalk");
    initProject(ws);
    const paths = resolvePaths(ws);
    const crossDir = path.join(paths.memDir, "imported", "crosswalks");
    fs.mkdirSync(crossDir, { recursive: true });
    const rows = Array.from({ length: 40 }, (_, i) => `| row${i} | data${i} |`).join("\n");
    const rel = "imported/crosswalks/disease-map.md";
    fs.writeFileSync(path.join(paths.memDir, rel), `# Disease map\n\n| id | note |\n|----|------|\n${rows}\n`, "utf8");
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
test("import preserves existing YAML frontmatter", () => {
    const ws = freshDir("t-import-yaml-keep");
    initProject(ws);
    const bundle = parseImportBundle({
        version: 1,
        imported: [{
                title: "Should not become a second H1",
                rel_path: "corpus/keep-yaml.md",
                body: "---\nid: REC-WW-056\ntags:\n  - wuwei\n  - recipe\n---\n\n# Original heading\n\nBody stays.\n",
                external_id: "yaml-keep-1",
            }],
    });
    importBundle(ws, bundle);
    const file = path.join(projectDir(ws), "imported", "corpus", "keep-yaml.md");
    const content = fs.readFileSync(file, "utf8");
    assert.match(content, /^---\nid: REC-WW-056/m);
    assert.match(content, /tags:\n  - wuwei/);
    assert.doesNotMatch(content, /# Should not become a second H1/);
    assert.doesNotMatch(content, /updated_by=migration/);
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
    fs.writeFileSync(path.join(paths.memDir, ".import-idempotency.json"), JSON.stringify({
        keys: ["imported:idem-trav"],
        paths: { "imported:idem-trav": "../../../outside-idem.md" },
    }), "utf8");
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
const { skillStatus, compareSemver, satisfiesCliRange, bundledSkillPath, readSkillInfo, formatUninitializedSkillStatus, formatUninitializedSkillStatusText, } = await import(toImport(path.join(distDir, "skill.js")));
const { runSetup, migrateProductHome, retireMixedHub } = await import(toImport(path.join(distDir, "setup.js")));
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
    fs.writeFileSync(path.join(destDir, "SKILL.md"), "---\nname: centricmem-agent\nversion: 0.0.1\ncompatible_cli: \">=0.12.0\"\n---\n# Old skill\n", "utf8");
    const r = skillStatus(ws);
    assert.strictEqual(r.status, "outdated");
    assert.ok(r.bundled.version && compareSemver(r.bundled.version, "0.0.1") > 0);
});
test("skill status reports modified when body differs at same version", () => {
    const ws = freshDir("t31-skill-modified");
    initProject(ws);
    const bundled = readSkillInfo(bundledSkillPath("centricmem-agent"));
    assert.ok(bundled?.version);
    const destDir = path.join(ws, "skills", "centricmem-agent");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, "SKILL.md"), `---\nname: centricmem-agent\nversion: ${bundled.version}\n---\n# User edited copy\n`, "utf8");
    const r = skillStatus(ws);
    assert.strictEqual(r.status, "modified");
});
test("skill status reports incompatible cli via install path", () => {
    const ws = freshDir("t32-skill-incompat");
    initProject(ws);
    const fixture = path.join(ws, "fake-skill.md");
    fs.writeFileSync(fixture, "---\nname: test-skill\nversion: 1.0.0\ncompatible_cli: \">=99.0.0\"\n---\n# x\n", "utf8");
    const r = skillStatus(ws, { name: "test-skill", installPath: fixture });
    assert.strictEqual(r.status, "incompatible");
});
test("ambient includes skill hint when outdated", () => {
    const ws = freshDir("t33-ambient-skill");
    initProject(ws);
    const destDir = path.join(ws, "skills", "centricmem-agent");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, "SKILL.md"), "---\nname: centricmem-agent\nversion: 0.0.1\n---\n# Old\n", "utf8");
    const block = buildAmbient(ws);
    assert.ok(block.text.includes("Skill:") && block.text.includes("outdated"));
});
test("skill status hints migrate when legacy path exists", () => {
    const ws = freshDir("t34-legacy-skill");
    initProject(ws);
    const legacyDir = path.join(ws, ".cursor", "skills", "centricmem-agent");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "SKILL.md"), "---\nname: centricmem-agent\nversion: 0.11.1\n---\n# Legacy\n", "utf8");
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
    const { matchProjectByCwd } = await import(toImport(path.join(distDir, "workspace.js")));
    const home = freshDir("t37-cwd-match-home");
    const code = freshDir("t37-cwd-match-code");
    initProject(home);
    fs.writeFileSync(path.join(code, "package.json"), "{}");
    const slug = linkProject(home, code, path.dirname(code));
    assert.ok(slug);
    assert.strictEqual(matchProjectByCwd(home, code), slug);
    assert.strictEqual(getCurrentProjectSlug(home, code), slug);
});
test("unlinked cwd writes go to unclassified, not workspace.current", () => {
    const home = freshDir("t39-write-inbox-home");
    const code = freshDir("t39-write-inbox-code");
    const elsewhere = freshDir("t39-write-elsewhere");
    initProject(home);
    fs.writeFileSync(path.join(code, "package.json"), "{}");
    const slug = linkProject(home, code, path.dirname(code));
    useProject(home, slug);
    assert.strictEqual(getCurrentProjectSlug(home, elsewhere), UNCLASSIFIED);
    assert.strictEqual(getCurrentProjectSlug(home, code), slug);
    const starred = listProjects(home).find((p) => p.slug === slug);
    assert.ok(starred?.current);
    const wsCfg = loadWorkspace(home);
    wsCfg.projects[slug].sourceDir = elsewhere;
    saveWorkspace(home, wsCfg);
    linkProject(home, code, path.dirname(code));
    assert.strictEqual(path.resolve(loadWorkspace(home).projects[slug].sourceDir), path.resolve(code));
});
test("inbox lists files and --apply moves high-confidence", () => {
    const ws = freshDir("t40-inbox");
    initProject(ws);
    fs.mkdirSync(path.join(ws, "my-app"));
    fs.writeFileSync(path.join(ws, "my-app", "package.json"), "{}");
    const slug = linkProject(ws, "my-app", ws);
    const hit = logDecision(ws, {
        title: "Pick runtime",
        context: "x",
        decision: "y",
        tags: ["my-app"],
    }, UNCLASSIFIED);
    const miss = logDecision(ws, {
        title: "Generic note",
        context: "zzz",
        decision: "qqq",
    }, UNCLASSIFIED);
    const memRel = (file) => {
        const n = file.replace(/\\/g, "/");
        const i = n.search(/decisions\//);
        return i >= 0 ? n.slice(i) : n;
    };
    const hitRel = memRel(hit.file);
    const missRel = memRel(miss.file);
    const listed = listInbox(ws);
    const files = listed.filter((i) => i.kind === "file");
    assert.ok(files.some((i) => i.relPath === hitRel));
    const applied = applyInbox(ws);
    assert.ok(applied.moved.some((m) => m.relPath === hitRel && m.to === slug));
    assert.ok(fs.existsSync(path.join(projectDir(ws, slug), hitRel)));
    assert.ok(applied.skipped.some((s) => s.relPath === missRel));
    assert.ok(fs.existsSync(path.join(projectDir(ws, UNCLASSIFIED), missRel)));
});
test("migrateFromLocalHub moves repo .centricmem into product home", async () => {
    const { migrateFromLocalHub } = await import(toImport(path.join(distDir, "setup.js")));
    const code = freshDir("t38-migrate-code");
    const home = freshDir("t38-migrate-home");
    // Simulate legacy nested hub inside code repo
    const legacy = path.join(code, ".centricmem");
    fs.mkdirSync(path.join(legacy, "projects", "unclassified", "decisions"), { recursive: true });
    fs.writeFileSync(path.join(legacy, "workspace.json"), JSON.stringify({
        version: 1,
        current: "demo",
        projects: {
            unclassified: { path: "unclassified", linked_at: "2026-01-01T00:00:00.000Z", system: true },
            demo: { path: "demo", linked_at: "2026-01-01T00:00:00.000Z", sourceDir: "." },
        },
    }) + "\n");
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
    fs.writeFileSync(ctx, `# Active Context\n\n## Current Focus\n\nShipping RRF search polish\n\n<!-- centricmem:meta updated_at=2026-07-11T00:00:00.000Z updated_by=test -->\n`, "utf8");
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
    assert.ok(wh.issues.some((i) => i.message.includes("broken sourceDir") && i.message.includes(slug)));
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
        assert.ok(wh.issues.some((i) => i.message.includes("CENTRICMEM_HOME") && i.message.includes("workspace.json")));
    }
    finally {
        if (prevHome === undefined)
            delete process.env.CENTRICMEM_HOME;
        else
            process.env.CENTRICMEM_HOME = prevHome;
        if (prevWs === undefined)
            delete process.env.CENTRICMEM_WORKSPACE;
        else
            process.env.CENTRICMEM_WORKSPACE = prevWs;
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
    assert.ok(hits.some((h) => h.projectSlug === slug && h.explain?.rrf != null));
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
    assert.ok(fs.existsSync(path.join(home, "skills", "centricmem-agent", "REFERENCE.md")));
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
    assert.ok(result.linked.some((s) => s.includes("t-link-paths-other") || s === "t-link-paths-other"));
    assert.ok(result.skillInstalled);
});
test("logSession writes Tags line and search finds tag", () => {
    const ws = freshDir("t-session-tags");
    initProject(ws);
    const r = logSession(ws, { summary: "Deployed matrix trial stack", tags: ["work", "deploy", "matrix"] });
    const body = fs.readFileSync(path.join(projectDir(ws), r.file), "utf8");
    assert.ok(body.includes("- **Tags**: work, deploy, matrix"));
    assert.strictEqual(countTodaySessions(ws), 1);
    buildIndex(resolvePaths(ws));
    const hits = search(resolvePaths(ws), "matrix", 5);
    assert.ok(hits.some((h) => (h.file ?? "").includes("sessions/") || (h.content ?? "").includes("matrix")));
});
test("search --tag matches Tags field or body; tagged ranks higher", () => {
    const ws = freshDir("t-tag-filter");
    initProject(ws);
    logSession(ws, { summary: "Talked about wifi handshake only in prose", tags: ["VAN68"] });
    logSession(ws, { summary: "Unrelated deploy notes mentioning VAN68 by accident", tags: ["deploy"] });
    buildIndex(resolvePaths(ws));
    const tagged = search(resolvePaths(ws), "", 10, { tags: ["VAN68"] });
    assert.ok(tagged.length >= 2, "body mention and Tags field should both hit");
    assert.ok(tagged[0].tags?.includes("VAN68"), "tagged row ranks above body-only");
    assert.ok(!(tagged[0].tags ?? []).includes("deploy"));
    assert.ok(tagged.some((h) => (h.tags ?? []).includes("deploy")));
    const andHits = search(resolvePaths(ws), "", 10, { tags: ["VAN68", "deploy"] });
    assert.equal(andHits.length, 1);
    assert.ok((andHits[0].tags ?? []).includes("deploy"));
    const kwPlusTag = search(resolvePaths(ws), "handshake", 10, { tags: ["VAN68"] });
    assert.ok(kwPlusTag.length >= 1);
    const explained = search(resolvePaths(ws), "", 10, { tags: ["VAN68"] }, undefined, { explain: true });
    assert.ok((explained[0].explain?.keyBoost ?? 1) > 1);
});
test("search prefixes: type: #id; bare decision is FTS not a type filter", () => {
    const ws = freshDir("t-addr-prefix");
    initProject(ws);
    logDecision(ws, { title: "Use Redis", context: "Caching", decision: "Redis", agent: "test" });
    logSession(ws, { summary: "This meeting mentioned a decision only as a word", tags: ["work"] });
    const paths = resolvePaths(ws);
    buildIndex(paths);
    const parsedType = parseAddressQuery("type:decision");
    assert.equal(parsedType.type, "decision");
    assert.equal(parsedType.ftsQuery, "");
    const parsedBare = parseAddressQuery("decision");
    assert.equal(parsedBare.type, undefined);
    assert.equal(parsedBare.ftsQuery, "decision");
    const typed = search(paths, "type:decision", 10);
    assert.ok(typed.length >= 1);
    assert.ok(typed.every((h) => h.docType === "decision"));
    assert.ok(!typed.some((h) => h.docType === "session"));
    const bare = search(paths, "decision", 10);
    assert.ok(bare.some((h) => h.docType === "session"));
    const byHash = search(paths, "#0001", 10);
    assert.ok(byHash.some((h) => /decisions[\\/]0001-/.test(h.file)));
    const byId = search(paths, "id:0001", 10);
    assert.ok(byId.some((h) => /decisions[\\/]0001-/.test(h.file)));
});
test("search project: jumps which index; CJK tag matches Tags or body", () => {
    const ws = freshDir("t-addr-project");
    initProject(ws);
    fs.mkdirSync(path.join(ws, "host"));
    const host = linkProject(ws, "host", ws);
    logDecision(ws, { title: "HostOnlyWidget", context: "x", decision: "y" }, host);
    logSession(ws, { summary: "unrelated local note", tags: ["腹心疾"] });
    logSession(ws, { summary: "正文里碰巧写了腹心疾", tags: ["other"] });
    buildIndexAll(ws);
    const jumped = searchScoped(ws, "project:host HostOnlyWidget");
    assert.ok(jumped.some((h) => h.heading.includes("HostOnlyWidget")));
    const local = search(resolvePaths(ws), "HostOnlyWidget");
    assert.equal(local.length, 0);
    assert.equal(normalizeKey("腹心疾"), "腹心疾");
    const cjk = search(resolvePaths(ws), "", 10, { tags: ["腹心疾"] });
    assert.ok(cjk.length >= 2, "CJK token should hit Tags and body");
    assert.ok(cjk[0].tags?.includes("腹心疾"));
});
test("ambient lists existing tags for reuse", () => {
    const ws = freshDir("t-ambient-tags");
    initProject(ws);
    logSession(ws, { summary: "Did a thing", tags: ["ops", "VAN68"] });
    const filled = buildAmbient(ws);
    assert.ok(filled.text.includes("Tags:"));
    const tagsPart = filled.text.split("Tags:")[1] ?? "";
    assert.ok(tagsPart.includes("VAN68"));
    assert.ok(tagsPart.indexOf("VAN68") < tagsPart.indexOf("ops"));
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
test("route knowledge queries to lessons", () => {
    const r = routeQuery("这个项目怎么想 tags");
    assert.strictEqual(r.action, "search");
    assert.strictEqual(r.suggestedType, "lessons");
});
test("import bundle lessons keep tags", () => {
    const ws = freshDir("t-import-lesson-tags");
    initProject(ws);
    const bundle = parseImportBundle({
        version: 1,
        lessons: [{ title: "Live hub is E", body: "Not ~/.centricmem", tags: ["dual-hub"] }],
    });
    importBundle(ws, bundle);
    const body = fs.readFileSync(path.join(ws, "projects", "unclassified", "lessons.md"), "utf8");
    assert.ok(body.includes("Live hub is E"));
    assert.ok(body.includes("- **Tags**: dual-hub"));
});
test("keep stores original; search hits stub; show --original returns full text", () => {
    const ws = freshDir("t-keep-show");
    initProject(ws);
    const src = path.join(ws, "source-note.txt");
    fs.writeFileSync(src, "UNIQUE_KEEP_PHRASE the full original transcript lives here.\n");
    const kept = keepOriginal(ws, src, { title: "Source note", tags: ["keep-test"] });
    assert.ok(kept.stubRel.startsWith("imported/kept/"));
    assert.ok(kept.attachRel.startsWith("imported/attach/"));
    buildIndex(resolvePaths(ws));
    const hits = search(resolvePaths(ws), "UNIQUE_KEEP_PHRASE", 10);
    assert.ok(hits.some((h) => (h.file ?? "").includes("imported/kept/")));
    assert.ok(hits.some((h) => (h.attach ?? "").startsWith("imported/attach/")));
    const full = showMemory(ws, kept.stubRel, { original: true });
    assert.ok(full.includes("UNIQUE_KEEP_PHRASE"));
    assert.equal(full, fs.readFileSync(src, "utf8"));
});
test("keep of jsonl transcript does not index the dump", () => {
    const ws = freshDir("t-keep-jsonl");
    initProject(ws);
    const src = path.join(ws, "chat.jsonl");
    fs.writeFileSync(src, '{"role":"user","message":{"content":[{"type":"text","text":"SECRET_CHAT_DUMP"}]}}\n');
    const kept = keepOriginal(ws, src, { title: "A chat", tags: ["chat"] });
    const stub = fs.readFileSync(path.join(ws, "projects", "unclassified", kept.stubRel), "utf8");
    assert.ok(!stub.includes("SECRET_CHAT_DUMP"));
    buildIndex(resolvePaths(ws));
    const hits = search(resolvePaths(ws), "SECRET_CHAT_DUMP", 10);
    assert.equal(hits.length, 0);
    const original = showMemory(ws, kept.stubRel, { original: true });
    assert.ok(original.includes("SECRET_CHAT_DUMP"));
});
test("note --attach links original; show heading --original reads it", () => {
    const ws = freshDir("t-note-attach");
    initProject(ws);
    const src = path.join(ws, "chat.jsonl");
    fs.writeFileSync(src, '{"msg":"ATTACHED_ORIGINAL_BODY"}\n');
    const { attachRel } = keepOriginal(ws, src, { title: "unused-stub-for-copy" });
    logLesson(ws, {
        title: "Claim about the chat",
        body: "The useful judgment, not the dump.",
        tags: ["attach-test"],
        attach: attachRel,
    });
    buildIndex(resolvePaths(ws));
    const shown = showMemory(ws, "lessons.md", { heading: "Claim about the chat", original: true });
    assert.ok(shown.includes("ATTACHED_ORIGINAL_BODY"));
});
test("show rejects path traversal", () => {
    const ws = freshDir("t-show-trav");
    initProject(ws);
    assert.throws(() => showMemory(ws, "../secret.md"), /Unsafe|escapes|absolute/i);
});
test("imported/attach originals are not FTS-indexed", () => {
    const ws = freshDir("t-attach-not-fts");
    initProject(ws);
    const paths = resolvePaths(ws);
    const attachDir = path.join(paths.memDir, "imported", "attach");
    fs.mkdirSync(attachDir, { recursive: true });
    fs.writeFileSync(path.join(attachDir, "hidden.md"), "# Hidden\n\nONLY_IN_ATTACH_DIR\n");
    buildIndex(paths);
    const hits = search(paths, "ONLY_IN_ATTACH_DIR", 10);
    assert.equal(hits.length, 0);
});
test("imported/_flat_dump and academic/_scripts are not FTS-indexed", () => {
    const ws = freshDir("t-skip-flat-scripts");
    initProject(ws);
    const paths = resolvePaths(ws);
    const dumpDir = path.join(paths.memDir, "imported", "_flat_dump");
    const scriptsDir = path.join(paths.memDir, "imported", "academic", "_scripts");
    const liveDir = path.join(paths.memDir, "imported", "academic", "corpus");
    fs.mkdirSync(dumpDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(dumpDir, "old.md"), "# Old\n\nFLAT_DUMP_TOKEN\n");
    fs.writeFileSync(path.join(scriptsDir, "export.md"), "# Export\n\nSCRIPTS_TOKEN\n");
    fs.writeFileSync(path.join(liveDir, "live.md"), "# Live\n\nLIVE_CORPUS_TOKEN\n");
    buildIndex(paths);
    assert.equal(search(paths, "FLAT_DUMP_TOKEN", 10).length, 0);
    assert.equal(search(paths, "SCRIPTS_TOKEN", 10).length, 0);
    assert.ok(search(paths, "LIVE_CORPUS_TOKEN", 10).length >= 1);
});
test("shouldSkipIndexDir skips strahil OCR and reading copies", () => {
    assert.equal(shouldSkipIndexDir("imported/academic/sources/strahil-medical-md"), true);
    assert.equal(shouldSkipIndexDir("imported/academic/sources/strahil-medical-md/foo"), true);
    assert.equal(shouldSkipIndexDir("imported/academic/sources/early-chinese"), false);
    assert.equal(shouldSkipIndexDir("imported/academic/secondary/book/reading"), true);
    assert.equal(shouldSkipIndexDir("imported/academic/corpus/references"), false);
});
test("shouldSkipIndexFile skips secondary dumps but keeps catalogs and corpus cards", () => {
    assert.equal(shouldSkipIndexFile("imported/academic/secondary/chinese-medicine/kuriyama-1999/Kuriyama-Epilogue-1999.md"), true);
    assert.equal(shouldSkipIndexFile("imported/academic/secondary/_index.md"), false);
    assert.equal(shouldSkipIndexFile("imported/academic/secondary/foo/_catalog.md"), false);
    assert.equal(shouldSkipIndexFile("imported/academic/corpus/references/kuriyama1999/ref.md"), false);
    assert.equal(shouldSkipIndexFile("imported/academic/sources/babylonian/wiggermann/_fulltext.md"), true);
    assert.equal(shouldSkipIndexFile("imported/academic/sources/early-chinese/mawangdui/_fulltext.md"), false);
    assert.equal(shouldSkipIndexFile("imported/academic/sources/early-chinese/wuwei/_fulltext_complete.md"), true);
    assert.equal(isCorpusLeafCatalog("imported/academic/corpus/references/kuriyama1999/_index.md"), true);
    assert.equal(isCorpusLeafCatalog("imported/academic/corpus/references/_catalog.md"), false);
    assert.equal(shouldSkipIndexFile("imported/academic/corpus/references/kuriyama1999/_index.md"), true);
    assert.equal(shouldSkipIndexFile("imported/academic/corpus/references/_catalog.md"), false);
    assert.equal(pathRetrievalBoost("imported/academic/corpus/references/kuriyama1999/ref.md") > 1, true);
    assert.equal(pathRetrievalBoost("imported/academic/secondary/_index.md") < 1, true);
    assert.equal(corpusRetrievalBoost({ card_role: "volume" }) > corpusRetrievalBoost({ card_role: "chapter" }), true);
    assert.equal(corpusRetrievalBoost({ card_role: "superseded" }) < 0.5, true);
    const deduped = dedupeSearchByWork([
        { file: "a.md", heading: "h", snippet: "", docType: "imported", loggedAt: "", agent: "", status: "active", supersededBy: "", score: 2, work: "w1" },
        { file: "b.md", heading: "h", snippet: "", docType: "imported", loggedAt: "", agent: "", status: "active", supersededBy: "", score: 5, work: "w1" },
        { file: "c.md", heading: "h", snippet: "", docType: "imported", loggedAt: "", agent: "", status: "active", supersededBy: "", score: 3 },
    ]);
    assert.equal(deduped.length, 2);
    assert.equal(deduped.find((r) => r.file === "b.md")?.workSiblings, 1);
});
test("secondary dumps and strahil OCR are not FTS-indexed; catalogs and cards are", () => {
    const ws = freshDir("t-skip-secondary-strahil");
    initProject(ws);
    const paths = resolvePaths(ws);
    const secDir = path.join(paths.memDir, "imported", "academic", "secondary", "chinese-medicine", "kuriyama-1999");
    const catalogDir = path.join(paths.memDir, "imported", "academic", "secondary");
    const cardDir = path.join(paths.memDir, "imported", "academic", "corpus", "references", "kuriyama1999");
    const strahilDir = path.join(paths.memDir, "imported", "academic", "sources", "strahil-medical-md");
    const readingDir = path.join(secDir, "reading");
    fs.mkdirSync(secDir, { recursive: true });
    fs.mkdirSync(cardDir, { recursive: true });
    fs.mkdirSync(strahilDir, { recursive: true });
    fs.mkdirSync(readingDir, { recursive: true });
    fs.writeFileSync(path.join(secDir, "dump.md"), "# Dump\n\nSECONDARY_DUMP_TOKEN\n");
    fs.writeFileSync(path.join(catalogDir, "_index.md"), "# Index\n\nSECONDARY_INDEX_TOKEN\n");
    fs.writeFileSync(path.join(cardDir, "card.md"), "# Card\n\nKURIYAMA_CARD_TOKEN\n");
    fs.writeFileSync(path.join(strahilDir, "ocr.md"), "# OCR\n\nSTRAHIL_OCR_TOKEN\n");
    fs.writeFileSync(path.join(readingDir, "copy.md"), "# Copy\n\nREADING_COPY_TOKEN\n");
    buildIndex(paths);
    assert.equal(search(paths, "SECONDARY_DUMP_TOKEN", 10).length, 0);
    assert.ok(search(paths, "SECONDARY_INDEX_TOKEN", 10).length >= 1);
    assert.ok(search(paths, "KURIYAMA_CARD_TOKEN", 10).length >= 1);
    assert.equal(search(paths, "STRAHIL_OCR_TOKEN", 10).length, 0);
    assert.equal(search(paths, "READING_COPY_TOKEN", 10).length, 0);
});
test("babylonian fulltext and leaf catalogs are not FTS-indexed; argument beats Opening OCR", () => {
    const ws = freshDir("t-skip-fulltext-leaf");
    initProject(ws);
    const paths = resolvePaths(ws);
    const babDir = path.join(paths.memDir, "imported", "academic", "sources", "babylonian", "wiggermann");
    const earlyDir = path.join(paths.memDir, "imported", "academic", "sources", "early-chinese", "mawangdui");
    const cardDir = path.join(paths.memDir, "imported", "academic", "corpus", "references", "kuriyama1999");
    const refRoot = path.join(paths.memDir, "imported", "academic", "corpus", "references");
    fs.mkdirSync(babDir, { recursive: true });
    fs.mkdirSync(earlyDir, { recursive: true });
    fs.mkdirSync(cardDir, { recursive: true });
    fs.writeFileSync(path.join(babDir, "_fulltext.md"), "# Bab\n\nBABYLON_FULLTEXT_TOKEN\n");
    fs.writeFileSync(path.join(earlyDir, "_fulltext.md"), "# MWD\n\nEARLY_CHINESE_FULLTEXT_TOKEN\n");
    fs.writeFileSync(path.join(earlyDir, "_fulltext_complete.md"), "# Dup\n\nEARLY_COMPLETE_TOKEN\n");
    fs.writeFileSync(path.join(cardDir, "_index.md"), "# Leaf\n\nLEAF_CATALOG_TOKEN\n");
    fs.writeFileSync(path.join(refRoot, "_catalog.md"), "# Root\n\nROOT_CATALOG_TOKEN\n");
    fs.writeFileSync(path.join(cardDir, "card.md"), "---\nid: REF-KURIYAMA1999-CH01\n---\n# Kuriyama ch.1\n\n## Argument (sequential read)\n\nCARD_ARGUMENT_TOKEN felt different bodies.\n\n## Opening (OCR)\n\n```\n## Page 2\nOPENING_OCR_TOKEN jstor boilerplate.\n```\n");
    buildIndex(paths);
    assert.equal(search(paths, "BABYLON_FULLTEXT_TOKEN", 10).length, 0);
    assert.ok(search(paths, "EARLY_CHINESE_FULLTEXT_TOKEN", 10).length >= 1);
    assert.equal(search(paths, "EARLY_COMPLETE_TOKEN", 10).length, 0);
    assert.equal(search(paths, "LEAF_CATALOG_TOKEN", 10).length, 0);
    assert.ok(search(paths, "ROOT_CATALOG_TOKEN", 10).length >= 1);
    assert.ok(search(paths, "CARD_ARGUMENT_TOKEN", 10).length >= 1);
    assert.equal(search(paths, "OPENING_OCR_TOKEN", 10).length, 0);
    assert.ok(search(paths, "REF-KURIYAMA1999-CH01", 10).length >= 1);
});
test("ingest helper markdown is not FTS-indexed", () => {
    const ws = freshDir("t-skip-resume-ocr");
    initProject(ws);
    const paths = resolvePaths(ws);
    const dumpDir = path.join(paths.memDir, "imported", "academic", "sources", "dump");
    fs.mkdirSync(dumpDir, { recursive: true });
    fs.writeFileSync(path.join(dumpDir, "_RESUME-SLICE.md"), "# Slice\n\nRESUME_SLICE_TOKEN\n");
    fs.writeFileSync(path.join(dumpDir, "ocr_quality_notes.md"), "# Notes\n\nOCR_NOTES_TOKEN\n");
    fs.writeFileSync(path.join(dumpDir, "ocr_completion_report.md"), "# Report\n\nOCR_REPORT_TOKEN\n");
    fs.writeFileSync(path.join(dumpDir, "work.md"), "# Work\n\nLIVE_WORK_TOKEN\n");
    buildIndex(paths);
    assert.equal(search(paths, "RESUME_SLICE_TOKEN", 10).length, 0);
    assert.equal(search(paths, "OCR_NOTES_TOKEN", 10).length, 0);
    assert.equal(search(paths, "OCR_REPORT_TOKEN", 10).length, 0);
    assert.ok(search(paths, "LIVE_WORK_TOKEN", 10).length >= 1);
});
test("directory junction under imported/ is FTS-indexed", () => {
    const ws = freshDir("t-junction-index");
    initProject(ws);
    const paths = resolvePaths(ws);
    const outside = path.join(ws, "corpus-src");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "card.md"), "---\ncivilization: babylonian\n---\n# Card\n\nJUNCTION_CORPUS_TOKEN\n");
    const imported = path.join(paths.memDir, "imported");
    fs.mkdirSync(imported, { recursive: true });
    const dest = path.join(imported, "academic");
    const type = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(outside, dest, type);
    buildIndex(paths);
    const hits = search(paths, "JUNCTION_CORPUS_TOKEN", 10);
    assert.ok(hits.length >= 1);
    const filtered = search(paths, "JUNCTION_CORPUS_TOKEN", 10, { meta: { civilization: "babylonian" } });
    assert.ok(filtered.length >= 1);
});
test("redactSecrets masks assignment values but keeps prose", () => {
    assert.equal(redactSecrets("password=hunter2"), "password=[redacted]");
    assert.equal(redactSecrets("token: abcdef"), "token: [redacted]");
    assert.ok(redactSecrets("Never store passwords in memory").includes("passwords"));
    assert.ok(!redactSecrets("ghp_abcdefghijklmnopqrstuvwxyz0123456789").includes("ghp_"));
});
test("logSession redacts secrets on write; ambient redacts the word password", () => {
    const ws = freshDir("t-redact-session");
    initProject(ws);
    const r = logSession(ws, { summary: "rotated db password=hunter2", title: "ops" });
    const body = fs.readFileSync(path.join(projectDir(ws), r.file), "utf8");
    assert.ok(body.includes("password=[redacted]"));
    assert.ok(!body.includes("hunter2"));
    const block = buildAmbient(ws);
    assert.ok(!block.text.includes("hunter2"));
    const tail = block.text.split("Session tail:")[1] ?? "";
    assert.match(tail, /\[redacted\]/i);
    assert.ok(!/\bpassword\b/i.test(tail.split("|")[0] ?? tail));
});
test("doctor reports uninitialized hub", async () => {
    const home = freshDir("t-doctor-empty");
    const r = await runDoctor(home);
    assert.equal(r.ok, false);
    assert.equal(r.initialized, false);
    assert.ok(r.errors.some((e) => /uninitialized/i.test(e)));
});
test("agent skill stays short", () => {
    const skillPath = path.resolve(distDir, "..", "skills", "centricmem-agent", "SKILL.md");
    const raw = fs.readFileSync(skillPath, "utf8");
    const lines = raw.split("\n").length;
    assert.ok(lines <= 80, `SKILL.md is ${lines} lines; keep the agent-facing file short`);
    assert.ok(raw.includes("REFERENCE.md"));
    assert.ok(raw.includes("HTTP only"));
    assert.ok(raw.includes("one sweep"));
    assert.ok(!raw.includes("setup --bootstrap") || raw.includes("Never `setup --bootstrap`"));
});
test("looksLikeClientFolder detects CLI package, not a library hub", () => {
    const client = freshDir("t-client-folder");
    fs.writeFileSync(path.join(client, "package.json"), JSON.stringify({ name: "centricmem", bin: { centricmem: "./dist/cli.js" } }));
    fs.mkdirSync(path.join(client, "dist"), { recursive: true });
    fs.writeFileSync(path.join(client, "dist", "cli.js"), "");
    const lib = freshDir("t-library-folder");
    initProject(lib);
    assert.equal(looksLikeClientFolder(client), true);
    assert.equal(looksLikeClientFolder(lib), false);
    assert.throws(() => assertLibraryPath(client), /memory library/);
});
test("setup refuses to use the client folder as --workspace", () => {
    const client = freshDir("t-setup-client");
    fs.writeFileSync(path.join(client, "package.json"), JSON.stringify({ name: "centricmem", bin: { centricmem: "./dist/cli.js" } }));
    fs.mkdirSync(path.join(client, "src"), { recursive: true });
    fs.writeFileSync(path.join(client, "src", "cli.ts"), "");
    assert.throws(() => runSetup({ workspace: client, bootstrap: true, codeRoot: freshDir("t-setup-client-code") }), /client folder as the memory library/);
});
test("persistProductHome pointer wins over env that points at the client", () => {
    const pointer = path.join(freshDir("t-pointer-dir"), "home.json");
    const lib = freshDir("t-pointer-lib");
    initProject(lib);
    const client = freshDir("t-pointer-client");
    fs.writeFileSync(path.join(client, "package.json"), JSON.stringify({ name: "centricmem", bin: { centricmem: "./dist/cli.js" } }));
    fs.mkdirSync(path.join(client, "dist"), { recursive: true });
    fs.writeFileSync(path.join(client, "dist", "cli.js"), "");
    const prevPtr = process.env.CENTRICMEM_HOME_POINTER;
    const prevHome = process.env.CENTRICMEM_HOME;
    const prevWs = process.env.CENTRICMEM_WORKSPACE;
    process.env.CENTRICMEM_HOME_POINTER = pointer;
    try {
        persistProductHome(lib, { userEnv: false });
        process.env.CENTRICMEM_HOME = client;
        delete process.env.CENTRICMEM_WORKSPACE;
        const r = resolveProductHome();
        assert.equal(r.home, path.resolve(lib));
        assert.equal(r.source, "env-client-ignored");
    }
    finally {
        if (prevPtr === undefined)
            delete process.env.CENTRICMEM_HOME_POINTER;
        else
            process.env.CENTRICMEM_HOME_POINTER = prevPtr;
        if (prevHome === undefined)
            delete process.env.CENTRICMEM_HOME;
        else
            process.env.CENTRICMEM_HOME = prevHome;
        if (prevWs === undefined)
            delete process.env.CENTRICMEM_WORKSPACE;
        else
            process.env.CENTRICMEM_WORKSPACE = prevWs;
    }
});
test("migrateProductHome copies hub files and can retire a mixed client", () => {
    const from = freshDir("t-migrate-from");
    fs.writeFileSync(path.join(from, "package.json"), JSON.stringify({ name: "centricmem", bin: { centricmem: "./dist/cli.js" } }));
    fs.mkdirSync(path.join(from, "src"), { recursive: true });
    fs.writeFileSync(path.join(from, "src", "cli.ts"), "export {}\n");
    initProject(from);
    fs.writeFileSync(path.join(from, "manager.json"), '{"home":"x"}\n');
    const dest = freshDir("t-migrate-to");
    assert.equal(migrateProductHome(from, dest), true);
    assert.ok(fs.existsSync(path.join(dest, "workspace.json")));
    assert.ok(fs.existsSync(path.join(dest, "projects")));
    assert.ok(fs.existsSync(path.join(dest, "manager.json")));
    assert.ok(fs.existsSync(path.join(from, "src", "cli.ts")));
    assert.equal(retireMixedHub(from), true);
    assert.ok(!fs.existsSync(path.join(from, "workspace.json")));
    assert.ok(fs.existsSync(path.join(from, "workspace.json.bak-library-moved")));
    assert.ok(fs.existsSync(path.join(from, "src", "cli.ts")));
});
