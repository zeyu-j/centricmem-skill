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
const { initProject, logDecision, updateContext, readContext, healthCheck } = await import(toImport(path.join(distDir, "memory.js")));
const { buildIndex, buildIndexAll, search, searchAll, chunkFile, parseYamlFrontmatter } = await import(toImport(path.join(distDir, "indexer.js")));
const { migrate } = await import(toImport(path.join(distDir, "migrate.js")));
const { listTemplates, applyTemplate } = await import(toImport(path.join(distDir, "templates.js")));
const { resolvePaths } = await import(toImport(path.join(distDir, "core.js")));
const { linkProject, useProject, listProjects, classifyMemory, UNCLASSIFIED } = await import(toImport(path.join(distDir, "workspace.js")));
const { parseImportBundle, importBundle } = await import(toImport(path.join(distDir, "import.js")));
let tmpRoot;
before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "CentricMem-test-"));
});
after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});
function freshDir(name) {
    const d = path.join(tmpRoot, name);
    fs.mkdirSync(d, { recursive: true });
    return d;
}
function projectDir(ws, slug = UNCLASSIFIED) {
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
    const slug = linkProject(ws, "my-app");
    assert.strictEqual(slug, "my-app");
    useProject(ws, slug);
    const projects = listProjects(ws);
    assert.ok(projects.find((p) => p.slug === slug)?.current);
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
    assert.ok(hits.some((h) => h.projectSlug === slug));
});
const { logSession, readRecentSessions, promoteToRules, distill } = await import(toImport(path.join(distDir, "memory.js")));
const { routeQuery, buildAmbient } = await import(toImport(path.join(distDir, "retrieve.js")));
const { dismissChunk, extractDecisionLinks, getLinks, decisionId } = await import(toImport(path.join(distDir, "indexer.js")));
const { suggestClassify } = await import(toImport(path.join(distDir, "workspace.js")));
test("logSession appends to sessions/", () => {
    const ws = freshDir("t14-session");
    initProject(ws);
    const r = logSession(ws, { summary: "Implemented feature X", title: "Morning" });
    assert.ok(r.file.replace(/\\/g, "/").startsWith("sessions/"));
    const recent = readRecentSessions(ws, 7, 5);
    assert.ok(recent.some((s) => s.summary.includes("feature X")));
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
    linkProject(ws, "sample-project");
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
    linkProject(ws, "target");
    fs.writeFileSync(path.join(ws, "victim.txt"), "outside memory");
    assert.throws(() => classifyMemory(ws, "../../../victim.txt", "target"), /Invalid path|Not found/);
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
    assert.ok(results[0].explain.cosine > 0.99, `cosine should be ~1, got ${results[0].explain.cosine}`);
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
const { skillStatus, compareSemver, satisfiesCliRange, bundledSkillPath, readSkillInfo, } = await import(toImport(path.join(distDir, "skill.js")));
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
    const destDir = path.join(ws, ".centricmem", "skills", "centricmem-agent");
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
    const destDir = path.join(ws, ".centricmem", "skills", "centricmem-agent");
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
    const destDir = path.join(ws, ".centricmem", "skills", "centricmem-agent");
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, "SKILL.md"), "---\nname: centricmem-agent\nversion: 0.0.1\n---\n# Old\n", "utf8");
    const block = buildAmbient(ws);
    assert.ok(block.text.includes("Skill:") && block.text.includes("outdated"));
});
test("skill status hints migrate when legacy .cursor/skills exists", () => {
    const ws = freshDir("t34-legacy-skill");
    initProject(ws);
    const legacyDir = path.join(ws, ".cursor", "skills", "centricmem-agent");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "SKILL.md"), "---\nname: centricmem-agent\nversion: 0.11.1\n---\n# Legacy\n", "utf8");
    const r = skillStatus(ws);
    assert.strictEqual(r.status, "missing");
    assert.ok(r.hint?.includes("legacy .cursor/skills"));
});
