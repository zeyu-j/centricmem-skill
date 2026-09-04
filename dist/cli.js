#!/usr/bin/env node
/**
 * cli.ts — CentricMem command line interface (workspace hub).
 */
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { findWorkspaceRoot, resolvePaths, loadConfig, getProductHome, assertLibraryPath } from "./core.js";
import { initProject, distill, healthCheck, listDecisions, promoteToRules, logDecision, logLesson, logSession, autoSessionSummary, ingestOriginal, keepOriginal, showMemory, parseAttachLine, } from "./memory.js";
import { listTemplates, applyTemplate } from "./templates.js";
import { migrate } from "./migrate.js";
import { buildIndex, buildIndexAll, buildIndexAsync, logIndexStart, logIndexDone, searchScoped, searchScopedAsync, parseAddressQuery, resolveSearchSlugs, classifyIntent, dismissChunk, getLinks, decisionId, } from "./indexer.js";
import { parseImportBundle, importBundle } from "./import.js";
import { useProject, listProjects, classifyMemory, getCurrentProjectSlug, suggestClassify, listInbox, applyInbox, workspaceHealth, } from "./workspace.js";
import { createLibrary, ensureHubCatalog, formatLibrariesList, linkCwdToLibrary, loadCatalog, setCurrentLibrary, } from "./libraries.js";
import { AccountError, accountFetch, bootstrapOwner, clearGuestSession, loadGuestSession, saveGuestSession, } from "./account.js";
import { runSetup, printSetupSummary } from "./setup.js";
import { routeQuery, buildAmbient, writeAmbientFile, formatUninitializedAmbient, formatUninitializedStatus, } from "./retrieve.js";
import { runDoctor, formatDoctorText } from "./doctor.js";
import { listenHostServer } from "./host-server.js";
import { DEFAULT_HOST_PORT, librarianRequest } from "./host-discover.js";
import { fillAttachFromDir, isR2Enabled, loadAttachOriginal } from "./r2.js";
import { isLibrarianGuest, librarianGuestOrigin, guestHubWriteMessage } from "./guest.js";
import { isEmbeddingEnabled } from "./embedding.js";
import { skillStatus, formatSkillStatusText, cliVersion, formatUninitializedSkillStatus, formatUninitializedSkillStatusText, } from "./skill.js";
const program = new Command();
program.name("centricmem").description("Manager layer over agent-native memory (librarian hub)").version(cliVersion());
function parseMetaFilters(pairs) {
    if (!pairs?.length)
        return undefined;
    const meta = {};
    for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq <= 0)
            throw new Error(`Invalid --filter (expected key=value): ${pair}`);
        meta[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
    return meta;
}
function attachRel(ws, src, project) {
    if (!src?.trim())
        return undefined;
    return ingestOriginal(ws, src.trim(), project).attachRel;
}
function showHint(r) {
    const q = (s) => JSON.stringify(s);
    const heading = (r.docType === "lessons" || r.docType === "session") && r.heading
        ? ` --heading ${q(r.heading)}`
        : "";
    if (r.attach)
        return `attach: ${r.attach}  →  GET /download?file=…&original=1 (humans; operators: show --original on the librarian host)`;
    return `show: centricmem show ${q(r.file)}${heading}`;
}
function tryWorkspace() {
    return findWorkspaceRoot();
}
function requireWorkspace() {
    const root = tryWorkspace();
    if (!root) {
        console.error("Error: no CentricMem memory library found. Run `centricmem setup --bootstrap --workspace <path> --persist-home`.");
        process.exit(1);
    }
    return root;
}
function denyGuestHubWrite(action) {
    if (!isLibrarianGuest())
        return;
    console.error(guestHubWriteMessage(action));
    process.exit(1);
}
function requireLocalWriter() {
    denyGuestHubWrite("this command");
    return requireWorkspace();
}
function askYesNo(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(!/^n/i.test(answer.trim()));
        });
    });
}
const HOOK_MARKER = "# centricmem-hook";
function installGitHook(root) {
    const hooksDir = path.join(root, ".git", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookFile = path.join(hooksDir, "post-commit");
    const line = `centricmem index --all --quiet ${HOOK_MARKER}\n`;
    if (fs.existsSync(hookFile)) {
        const existing = fs.readFileSync(hookFile, "utf8");
        if (existing.includes(HOOK_MARKER))
            return "git hook already installed (post-commit)";
        fs.appendFileSync(hookFile, `\n${line}`);
    }
    else {
        fs.writeFileSync(hookFile, `#!/bin/sh\n${line}`, { mode: 0o755 });
    }
    fs.chmodSync(hookFile, 0o755);
    return "installed git post-commit hook (centricmem index --all --quiet)";
}
program
    .command("init")
    .description("Initialise the memory library (CENTRICMEM_HOME or ~/.centricmem); not the CLI folder")
    .option("--template <name>", "apply template to current project after init")
    .option("--list-templates", "list built-in templates")
    .option("--git-hook", "install post-commit index hook in the code repo")
    .option("--no-git-hook", "skip git hook prompt")
    .action(async (opts) => {
    if (opts.listTemplates) {
        for (const t of listTemplates())
            console.log(`  ${t.name.padEnd(14)} ${t.description}`);
        return;
    }
    const home = getProductHome();
    denyGuestHubWrite("init");
    assertLibraryPath(home);
    const cwd = process.cwd();
    const result = initProject(home, cwd);
    for (const f of result.created)
        console.log(`  created  ${f}`);
    for (const f of result.skipped)
        console.log(`  skipped  ${f}`);
    if (opts.template) {
        const applied = applyTemplate(home, opts.template);
        for (const f of applied)
            console.log(`  template ${f}`);
    }
    const gitDir = path.join(cwd, ".git");
    if (fs.existsSync(gitDir) && opts.gitHook !== false) {
        let install = opts.gitHook === true;
        if (!install && process.stdout.isTTY) {
            install = await askYesNo("Install git post-commit hook to auto-index memory? [Y/n]: ");
        }
        if (install)
            console.log(`  ${installGitHook(cwd)}`);
    }
    buildIndexAll(home);
    printSetupSummary(home);
});
program
    .command("setup")
    .description("Guided setup: pick a memory library (--workspace), then link code / install skill")
    .option("--workspace <path>", "memory library path (Steam-style games folder). Default: CENTRICMEM_HOME, pointer, or ~/.centricmem")
    .option("--persist-home", "remember --workspace (pointer file + Windows user env CENTRICMEM_HOME)")
    .option("--migrate-home", "copy hub files (workspace.json, projects/, skills/) into --workspace")
    .option("--from-home <path>", "source hub for --migrate-home (default: current library)")
    .option("--retire-old-home", "after --migrate-home, rename workspace.json if the source was the CLI folder")
    .option("--bootstrap", "cold-start: --link-all + --install-skill (no hooks)")
    .option("--link-all", "link subdirectories of cwd that have .git or package.json")
    .option("--link <path>", "link an explicit code path to a library (repeatable)", (v, prev) => [...prev, v], [])
    .option("--migrate-discover", "import discovered cursor-rules / memory-bank into unclassified")
    .option("--migrate-from-local", "move cwd/.centricmem into product home and remove the local hub")
    .option("--install-skill", "install bundled skills to $CENTRICMEM_HOME/skills/ (+ ~/.cursor, ~/.codex, ~/.agents)")
    .option("--install-academic-skill", "install academic-db-agent SKILL to product home")
    .option("--install-hooks", "install Cursor session hooks into the code repo .cursor/hooks/")
    .option("--drive-mcp-hint", "print backup note (restic; Drive/rsync is not a product path)")
    .action((opts) => {
    if ((opts.migrateHome || opts.persistHome) && !opts.workspace) {
        console.error("Error: --workspace <library-path> is required with --persist-home / --migrate-home");
        process.exitCode = 1;
        return;
    }
    if (opts.bootstrap || opts.migrateHome || opts.migrateFromLocal || opts.migrateDiscover || opts.persistHome || opts.linkAll || opts.link?.length) {
        denyGuestHubWrite("setup hub mutate");
    }
    const result = runSetup({
        workspace: opts.workspace,
        codeRoot: process.cwd(),
        bootstrap: opts.bootstrap,
        linkAll: opts.linkAll,
        linkPaths: opts.link?.length ? opts.link : undefined,
        migrateDiscover: opts.migrateDiscover,
        migrateFromLocal: opts.migrateFromLocal,
        migrateHome: opts.migrateHome,
        fromHome: opts.fromHome,
        persistHome: opts.persistHome,
        retireOldHome: opts.retireOldHome,
        installSkill: opts.installSkill,
        installAcademicSkill: opts.installAcademicSkill,
        installHooks: opts.installHooks,
        driveMcpHint: opts.driveMcpHint,
    });
    if (isLibrarianGuest()) {
        console.log(`Guest of ${librarianGuestOrigin()} — leftover hub not written.`);
    }
    else {
        printSetupSummary(result.workspaceRoot);
    }
    if (result.linked.length)
        console.log(`Linked: ${result.linked.join(", ")}`);
    if (result.migrated)
        console.log(`Migrated ${result.migrated} source(s) → unclassified`);
    if (result.migratedFromLocal)
        console.log("Migrated local .centricmem/ → product home");
    if (result.migratedHome)
        console.log("Copied memory library into --workspace");
    if (result.persistedHome)
        console.log(`Remembered library at ${result.persistedHome}`);
    if (result.retiredOldHome)
        console.log("Retired workspace.json in the old client folder");
    if (result.skillInstalled) {
        console.log(isLibrarianGuest()
            ? "Skill installed to ~/.cursor/skills/centricmem-agent/ (and ~/.codex, ~/.agents)"
            : `Skill installed to ${path.join(result.workspaceRoot, "skills", "centricmem-agent")}/`);
    }
    if (result.academicSkillInstalled)
        console.log("Academic skill installed");
    if (result.hooksInstalled)
        console.log("Cursor hooks installed to .cursor/hooks/");
});
program
    .command("link <path>")
    .description("Link a code folder to its own library (pairing key + projects/<slug>/)")
    .action((subpath) => {
    const ws = requireLocalWriter();
    const lib = linkCwdToLibrary(ws, subpath);
    console.log(`Linked ${subpath} → library "${lib.id}"`);
    buildIndex(resolvePaths(ws, lib.id));
});
program
    .command("use <slug>")
    .description("Open a library (display/ambient current; writes still follow cwd link / -p)")
    .action((slug) => {
    const ws = requireLocalWriter();
    useProject(ws, slug);
    try {
        setCurrentLibrary(slug);
    }
    catch {
        ensureHubCatalog(ws);
        setCurrentLibrary(slug);
    }
    console.log(`Opened library: ${slug} (writes still use env / -p / cwd link, else Inbox)`);
});
program
    .command("libraries")
    .description("List libraries (pairing keys per library). `projects` is an alias.")
    .option("--json", "machine-readable JSON")
    .option("--create <id>", "create a library folder and pairing key")
    .option("--use <id>", "open this library")
    .action((opts) => {
    if (opts.create || opts.use)
        denyGuestHubWrite("libraries --create/--use");
    if (isLibrarianGuest() && !opts.create && !opts.use) {
        const cat = loadCatalog();
        if (!cat) {
            console.error("No guest catalog. Pairing keys live in %APPDATA%/centricmem/libraries.json");
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({
                current: cat.current,
                origin: cat.origin,
                libraries: cat.libraries.map((lib) => ({
                    id: lib.id,
                    displayName: lib.displayName,
                    sourceDirs: lib.sourceDirs,
                    system: lib.system || undefined,
                })),
            }, null, 2));
            return;
        }
        console.log(formatLibrariesList(cat) || "(no libraries)");
        return;
    }
    const ws = requireWorkspace();
    if (opts.create) {
        const lib = createLibrary(ws, opts.create);
        console.log(`Created library ${lib.id} (${lib.displayName})`);
    }
    if (opts.use) {
        useProject(ws, opts.use);
        setCurrentLibrary(opts.use);
        console.log(`Opened library: ${opts.use}`);
    }
    const cat = ensureHubCatalog(ws);
    if (opts.json) {
        console.log(JSON.stringify({
            current: cat.current,
            libraries: cat.libraries.map((lib) => ({
                id: lib.id,
                displayName: lib.displayName,
                sourceDirs: lib.sourceDirs,
                system: lib.system || undefined,
            })),
        }, null, 2));
        return;
    }
    console.log(formatLibrariesList(cat) || "(no libraries)");
});
program
    .command("projects")
    .description("Alias of `libraries`")
    .option("--json", "machine-readable JSON")
    .action((opts) => {
    if (isLibrarianGuest()) {
        const cat = loadCatalog();
        if (!cat) {
            console.error("No guest catalog.");
            process.exit(1);
        }
        if (opts.json) {
            console.log(JSON.stringify({ current: cat.current, origin: cat.origin, libraries: cat.libraries.map((lib) => ({ id: lib.id, displayName: lib.displayName, sourceDirs: lib.sourceDirs })) }, null, 2));
            return;
        }
        console.log(formatLibrariesList(cat) || "(no libraries)");
        return;
    }
    const ws = requireWorkspace();
    const cat = ensureHubCatalog(ws);
    if (opts.json) {
        console.log(JSON.stringify({
            current: cat.current,
            libraries: cat.libraries.map((lib) => ({
                id: lib.id,
                displayName: lib.displayName,
                sourceDirs: lib.sourceDirs,
            })),
            projects: listProjects(ws),
        }, null, 2));
        return;
    }
    console.log(formatLibrariesList(cat));
});
program
    .command("classify <relPath>")
    .description("Move memory from the Inbox library to another library")
    .requiredOption("--to <slug>", "target library id")
    .action((relPath, opts) => {
    const ws = requireLocalWriter();
    const r = classifyMemory(ws, relPath, opts.to);
    buildIndex(resolvePaths(ws, opts.to));
    console.log(`Moved: ${r.moved.join(", ")} → library ${opts.to}`);
});
program
    .command("suggest-classify <relPath>")
    .description("Suggest target project for unclassified memory")
    .action((relPath) => {
    const ws = requireLocalWriter();
    const suggestions = suggestClassify(ws, relPath);
    if (!suggestions.length) {
        console.log("No strong matches. Consider creating a library with `centricmem libraries --create <id>` or `centricmem link`.");
        return;
    }
    for (const s of suggestions) {
        console.log(`${s.slug}  (score ${s.score}) — ${s.reason}`);
    }
});
program
    .command("inbox")
    .description("List Inbox library files; --apply moves high-confidence matches to another library")
    .option("--apply", "move high-confidence files; print the rest for classify --to")
    .option("--json", "output JSON")
    .action((opts) => {
    denyGuestHubWrite("inbox");
    const ws = requireWorkspace();
    if (opts.apply) {
        const r = applyInbox(ws);
        if (opts.json) {
            console.log(JSON.stringify(r, null, 2));
            return;
        }
        if (!r.moved.length && !r.skipped.length) {
            console.log("Inbox empty.");
            return;
        }
        for (const m of r.moved) {
            console.log(`moved  ${m.relPath} → ${m.to}`);
            buildIndex(resolvePaths(ws, m.to));
        }
        for (const s of r.skipped) {
            console.log(`skip   ${s.relPath}  — ${s.reason}`);
        }
        console.log(`\n${r.moved.length} moved, ${r.skipped.length} left. Move leftovers: centricmem classify <rel> --to <library>`);
        return;
    }
    const items = listInbox(ws);
    if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
    }
    if (!items.length) {
        console.log("Inbox empty.");
        return;
    }
    for (const item of items) {
        if (item.kind === "aggregate") {
            console.log(`skip   ${item.relPath}  — ${item.skipReason}`);
            continue;
        }
        const hint = item.suggestion
            ? `${item.suggestion.slug} (score ${item.suggestion.score})`
            : "(no suggestion)";
        console.log(`file   ${item.relPath}  → ${hint}`);
    }
    console.log("\nHigh-confidence auto-move: centricmem inbox --apply");
    console.log("Manual: centricmem classify <rel> --to <library>");
});
program
    .command("import [file]")
    .description("Import ImportBundle JSON into project memory (raw docs upsert by default)")
    .option("--stdin", "read bundle from stdin")
    .option("--dry-run", "preview counts only")
    .option("--skip-existing", "skip any external_id already imported (one-shot migrate style)")
    .option("-p, --project <slug>", "target library id (default: Inbox)")
    .action((file, opts) => {
    const ws = requireLocalWriter();
    let raw;
    if (opts.stdin) {
        raw = fs.readFileSync(0, "utf8");
    }
    else if (file) {
        raw = fs.readFileSync(file, "utf8");
    }
    else {
        console.error("Provide a file path or --stdin");
        process.exit(1);
    }
    const bundle = parseImportBundle(raw);
    const r = importBundle(ws, bundle, {
        dryRun: opts.dryRun,
        project: opts.project,
        skipExisting: opts.skipExisting,
    });
    if (opts.dryRun) {
        console.log(`Dry run → project ${r.project}: ${r.decisions} decisions, ${r.lessons} lessons, ${r.rules} rules, ${r.imported} docs, ${r.sessions} sessions, ${r.research} research`);
    }
    else {
        console.log(`Imported into ${r.project}: +${r.decisions} decisions, +${r.lessons} lessons, +${r.rules} rules, +${r.imported} docs, +${r.sessions} sessions, +${r.research} research (${r.updated} updated, ${r.skipped} skipped)`);
        const newDocs = r.decisions + r.lessons + r.rules + r.imported + r.sessions + r.research + r.updated;
        if (newDocs > 0) {
            console.log("\nIndex rebuilt. Next:");
            console.log(`  centricmem search "<keywords>" -p ${r.project}`);
            if (r.project === "unclassified") {
                console.log("  centricmem inbox                     # then classify --to <library>");
            }
            console.log("  centricmem status --workspace");
        }
    }
});
program
    .command("migrate")
    .description("One-way import from cursor-rules | memory-bank | markdown → unclassified")
    .requiredOption("--from <type>", "cursor-rules | memory-bank | markdown")
    .requiredOption("--path <path>", "source path")
    .option("-p, --project <slug>", "target library id (default: Inbox)")
    .action((opts) => {
    denyGuestHubWrite("migrate");
    const home = findWorkspaceRoot() ?? getProductHome();
    if (!findWorkspaceRoot())
        initProject(home, process.cwd());
    try {
        const src = path.resolve(process.cwd(), opts.path);
        const result = migrate(home, opts.from, src, opts.project);
        console.log(`Imported from ${result.from}: ${result.sources.length} source(s)`);
        for (const f of result.imported)
            console.log(`  -> ${f}`);
        buildIndexAll(home);
    }
    catch (err) {
        console.error(`Migration failed: ${err.message}`);
        process.exit(1);
    }
});
program
    .command("search [query...]")
    .description("Search library memory (FTS5 + optional semantic); --tag / tag: match Tags or body")
    .option("-n, --limit <n>", "max results")
    .option("-t, --type <type>", "decision | rule | lesson | context | session | imported")
    .option("-s, --status <status>", "active | superseded | ...")
    .option("-a, --agent <agent>", "filter by agent")
    .option("-f, --filter <pair>", "metadata filter key=value (repeatable)", (v, acc) => { acc.push(v); return acc; }, [])
    .option("--tag <tag>", "require this token in Tags or body (repeatable, AND)", (v, acc) => { acc.push(v); return acc; }, [])
    .option("-p, --project <slug>", "search one library (alias of --library)")
    .option("--library <id>", "search one library")
    .option("--all", "search all open libraries in the catalogue")
    .option("--semantic", "hybrid BM25 + embedding search via RRF (requires API key)")
    .option("--explain", "show score breakdown")
    .option("--json", "machine-readable JSON output")
    .action(async (queryParts, opts) => {
    const query = (queryParts ?? []).join(" ").trim();
    const tags = (opts.tag ?? []).map((t) => t.trim()).filter(Boolean);
    const parsed = parseAddressQuery(query);
    const hasAddr = Boolean(tags.length || parsed.type || parsed.status || parsed.agent || parsed.andTokens.length ||
        parsed.projectScopes.length || opts.type || opts.status || opts.agent);
    if (!query && !hasAddr) {
        console.error('Provide a query, --tag, type: / #id, or --type, e.g. centricmem search "auth" --tag redis');
        process.exit(1);
    }
    if (isLibrarianGuest()) {
        const params = new URLSearchParams();
        if (query)
            params.set("q", query);
        if (opts.limit)
            params.set("limit", opts.limit);
        if (opts.type)
            params.set("type", opts.type);
        if (opts.status)
            params.set("status", opts.status);
        if (opts.agent)
            params.set("agent", opts.agent);
        for (const t of tags)
            params.append("tags", t);
        for (const f of opts.filter ?? [])
            params.append("filter", f);
        const library = opts.library || opts.project;
        const res = await librarianRequest(`/search?${params.toString()}`, { library });
        const body = (await res.json());
        if (!res.ok || !body.ok) {
            console.error(body.error?.message || `Search failed (${res.status}).`);
            process.exit(1);
        }
        const results = body.results ?? [];
        if (opts.json) {
            console.log(JSON.stringify(results));
            return;
        }
        if (!results.length) {
            console.log("No results. Try broader keywords or `centricmem status`.");
            return;
        }
        for (const r of results) {
            const proj = r.projectSlug ? `[${r.projectSlug}] ` : "";
            const statusTag = r.status && r.status !== "active" ? ` [${r.status.toUpperCase()}]` : "";
            console.log(`\n${proj}[${Number(r.score).toFixed(2)}] ${r.heading}  (${r.docType})${statusTag}`);
            console.log(`  file: ${r.file}  |  at: ${r.loggedAt}  |  by: ${r.agent}`);
            console.log(`  ${(r.snippet || "").replace(/\n/g, " ")}`);
            if (r.tags?.length)
                console.log(`  tags: ${r.tags.join(", ")}`);
            console.log(`  ${showHint(r)}`);
        }
        return;
    }
    const ws = requireWorkspace();
    const intent = query ? classifyIntent(parsed.ftsQuery || query) : "general";
    if (!opts.json && intent !== "general")
        console.log(`(intent: ${intent})`);
    const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;
    let meta;
    try {
        meta = parseMetaFilters(opts.filter);
    }
    catch (err) {
        console.error(err.message);
        process.exit(1);
    }
    const filters = { type: opts.type, status: opts.status, agent: opts.agent, meta, tags: tags.length ? tags : undefined };
    const searchOpts = { semantic: opts.semantic, explain: opts.explain };
    const scope = { project: opts.library || opts.project, all: opts.all };
    const slugs = resolveSearchSlugs(ws, parsed, scope);
    if (!slugs.length) {
        console.error("No matching library index for this query (check library: / -p / --library).");
        process.exit(1);
    }
    if (opts.semantic) {
        const anyEnabled = slugs.some((slug) => isEmbeddingEnabled(loadConfig(resolvePaths(ws, slug))));
        if (!opts.json && !anyEnabled)
            console.log("(semantic disabled — no embedding config/API key; using BM25)");
    }
    const results = opts.semantic
        ? await searchScopedAsync(ws, query, limit, filters, searchOpts, scope)
        : searchScoped(ws, query, limit, filters, searchOpts, scope);
    if (opts.json) {
        console.log(JSON.stringify(results));
        return;
    }
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
        if (r.tags?.length)
            console.log(`  tags: ${r.tags.join(", ")}`);
        console.log(`  ${showHint(r)}`);
        if (r.explain) {
            const e = r.explain;
            const ranks = [
                e.bm25Rank != null ? `BM25#${e.bm25Rank}` : null,
                e.vecRank != null ? `Vec#${e.vecRank}` : null,
                e.rrf != null ? `RRF=${e.rrf.toFixed(4)}` : null,
            ].filter(Boolean).join(" | ");
            if (ranks)
                console.log(`  trajectory: ${ranks}`);
            console.log(`  explain: bm25=${e.bm25.toFixed(3)} cos=${e.cosine.toFixed(3)} rel=${e.relevance.toFixed(3)} time=${e.timeDecay.toFixed(3)} status=${e.statusPenalty} valid=${e.validityPenalty ?? 1} ref=${e.refBoost.toFixed(3)} intent=${e.intentBoost} domain=${e.domainBoost.toFixed(3)} fb=${e.feedbackPenalty.toFixed(3)}${e.keyBoost != null ? ` key=${e.keyBoost.toFixed(3)}` : ""}`);
            if (e.matchedKeys?.length)
                console.log(`  keys: ${e.matchedKeys.join(", ")}`);
            if (e.lineage)
                console.log(`  lineage: ${e.lineage}`);
        }
    }
});
program
    .command("route <query...>")
    .description("Retrieval routing — when to read vs search")
    .option("--json", "output JSON")
    .action((queryParts, opts) => {
    const r = routeQuery(queryParts.join(" "));
    if (opts.json)
        console.log(JSON.stringify(r, null, 2));
    else {
        console.log(`action: ${r.action}`);
        console.log(`intent: ${r.intent}`);
        if (r.suggestedType)
            console.log(`suggested_type: ${r.suggestedType}`);
        if (r.suggestedMeta)
            console.log(`suggested_meta: ${JSON.stringify(r.suggestedMeta)}`);
        console.log(`reason: ${r.reason}`);
    }
});
program
    .command("log-session [summary...]")
    .description("Log one session unit to sessions/<stamp>-<writer>-<id>.md")
    .option("-p, --project <slug>", "library id (-p alias)")
    .option("--stdin", "read summary from stdin")
    .option("--title <title>", "session heading")
    .option("--tags <tags>", "comma-separated folksonomy tags (reuse ambient Tags, or mint)")
    .option("--attach <path>", "copy original file into imported/attach and link it")
    .option("--auto", "derive summary from active_context Current Focus (hooks)")
    .action((summaryParts, opts) => {
    const ws = requireLocalWriter();
    let summary;
    if (opts.auto) {
        summary = autoSessionSummary(ws, opts.project);
    }
    else if (opts.stdin) {
        summary = fs.readFileSync(0, "utf8").trim();
    }
    else {
        summary = summaryParts.join(" ");
    }
    const title = opts.title;
    const tags = opts.tags?.split(",").map((t) => t.trim()).filter(Boolean);
    const attach = attachRel(ws, opts.attach, opts.project);
    const r = logSession(ws, { summary, title, tags, attach }, opts.project);
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Session logged: ${r.file} → ## ${r.heading}`);
});
program
    .command("done [summary...]")
    .description("Close-contract alias for log-session (prefer with --tags)")
    .option("-p, --project <slug>", "library id (-p alias)")
    .option("--tags <tags>", "comma-separated folksonomy tags (reuse ambient Tags, or mint)")
    .option("--title <title>", "session heading")
    .option("--attach <path>", "copy original file into imported/attach and link it")
    .action((summaryParts, opts) => {
    const ws = requireLocalWriter();
    const summary = summaryParts.join(" ").trim();
    if (!summary) {
        console.error('Provide a summary: centricmem done --tags VAN68 "what shipped"');
        process.exit(1);
    }
    const tags = opts.tags?.split(",").map((t) => t.trim()).filter(Boolean);
    const attach = attachRel(ws, opts.attach, opts.project);
    const r = logSession(ws, { summary, title: opts.title, tags, attach }, opts.project);
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
    .option("--tags <tags>", "comma-separated folksonomy tags (reuse ambient Tags, or mint)")
    .option("--attach <path>", "copy original file into imported/attach and link it")
    .option("--supersedes <seq>", "sequence number this replaces")
    .option("--refs <seqs>", "comma-separated decision numbers this references, e.g. \"1,4\"")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action((opts) => {
    const ws = requireLocalWriter();
    const r = logDecision(ws, {
        title: opts.title,
        context: opts.context,
        decision: opts.decision,
        consequences: opts.consequences,
        tags: opts.tags?.split(",").map((t) => t.trim()).filter(Boolean),
        attach: attachRel(ws, opts.attach, opts.project),
        supersedes: opts.supersedes ? parseInt(opts.supersedes, 10) : undefined,
        refs: opts.refs
            ?.split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n > 0),
    }, opts.project);
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Decision #${r.seq} logged: ${r.file}`);
});
program
    .command("log-lesson")
    .description("Append durable knowledge to lessons.md (idempotent by title)")
    .requiredOption("--title <title>", "lesson title")
    .requiredOption("--body <text>", "the knowledge: model, fact, logic, or pitfall")
    .option("--tags <tags>", "comma-separated folksonomy tags (reuse ambient Tags, or mint)")
    .option("--attach <path>", "copy original file into imported/attach and link it")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action((opts) => {
    const ws = requireLocalWriter();
    const tags = opts.tags?.split(",").map((t) => t.trim()).filter(Boolean);
    const r = logLesson(ws, {
        title: opts.title, body: opts.body, tags, attach: attachRel(ws, opts.attach, opts.project),
    }, opts.project);
    if (r.status === "skipped") {
        console.log(`Lesson "${opts.title}" already exists — skipped.`);
        return;
    }
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Lesson "${opts.title}" appended to lessons.md`);
});
program
    .command("note")
    .description("Close-contract alias for log-lesson (durable knowledge, not only pitfalls)")
    .requiredOption("--title <title>", "short name for this knowledge")
    .requiredOption("--body <text>", "the knowledge: model, fact, logic, or pitfall")
    .option("--tags <tags>", "comma-separated folksonomy tags (reuse ambient Tags, or mint)")
    .option("--attach <path>", "copy original file into imported/attach and link it")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action((opts) => {
    const ws = requireLocalWriter();
    const tags = opts.tags?.split(",").map((t) => t.trim()).filter(Boolean);
    const r = logLesson(ws, {
        title: opts.title, body: opts.body, tags, attach: attachRel(ws, opts.attach, opts.project),
    }, opts.project);
    if (r.status === "skipped") {
        console.log(`Lesson "${opts.title}" already exists — skipped.`);
        return;
    }
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Note logged: ${opts.title}`);
});
program
    .command("keep <path>")
    .description("Collect any file: searchable stub + attached original (humans download; not FTS)")
    .option("--title <title>", "stub title (default: filename)")
    .option("--tags <tags>", "comma-separated folksonomy tags (reuse ambient Tags, or mint)")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action((src, opts) => {
    const ws = requireLocalWriter();
    const tags = opts.tags?.split(",").map((t) => t.trim()).filter(Boolean);
    const r = keepOriginal(ws, src, { title: opts.title, tags, projectSlug: opts.project });
    buildIndex(resolvePaths(ws, opts.project));
    console.log(`Kept ${r.stubRel}`);
    console.log(`  attach: ${r.attachRel}`);
    console.log(`  download: GET /download?file=…&original=1 (humans)`);
});
program
    .command("show <file>")
    .description("Print a memory card, or --original to stdout for operators (not the agent path)")
    .option("--heading <heading>", "one ## section (lessons / sessions)")
    .option("--original", "operator: write attached original to stdout; agents must not")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action(async (file, opts) => {
    if (isLibrarianGuest()) {
        if (opts.original) {
            console.error("Guest: humans download originals. Do not centricmem show --original.");
            process.exit(1);
        }
        const params = new URLSearchParams({ file });
        if (opts.heading)
            params.set("heading", opts.heading);
        if (opts.project)
            params.set("library", opts.project);
        const res = await librarianRequest(`/show?${params.toString()}`, { library: opts.project });
        const body = (await res.json());
        if (!res.ok || !body.ok) {
            console.error(body.error?.message || `Show failed (${res.status}).`);
            process.exit(1);
        }
        process.stdout.write(body.text || "");
        return;
    }
    const ws = requireWorkspace();
    try {
        if (opts.original) {
            const unit = showMemory(ws, file, {
                heading: opts.heading, original: false, projectSlug: opts.project,
            });
            const attachRel = parseAttachLine(unit);
            if (!attachRel)
                throw new Error(`No Attach line on ${file}`);
            const slug = opts.project ?? getCurrentProjectSlug(ws);
            const buf = await loadAttachOriginal(ws, slug, attachRel);
            if (buf.includes(0)) {
                process.stdout.write(`(binary original, ${buf.length} bytes)\npath: ${attachRel}\n`);
            }
            else {
                process.stdout.write(buf.toString("utf8"));
            }
            return;
        }
        process.stdout.write(showMemory(ws, file, {
            heading: opts.heading, original: false, projectSlug: opts.project,
        }));
    }
    catch (err) {
        console.error(err.message);
        process.exit(1);
    }
});
const skillCmd = program.command("skill").description("Installed Skill vs bundled copy (pull-based updates)");
skillCmd
    .command("status [name]")
    .description("Compare installed Skill to the CLI bundle")
    .option("--path <file>", "installed SKILL.md path (overrides default)")
    .option("--json", "machine-readable output")
    .action((name, opts) => {
    const ws = tryWorkspace();
    if (!ws) {
        const home = getProductHome();
        const skillName = name || "centricmem-agent";
        if (opts.json) {
            console.log(JSON.stringify(formatUninitializedSkillStatus(home, skillName), null, 2));
        }
        else {
            console.log(formatUninitializedSkillStatusText(home, skillName));
        }
        return;
    }
    const result = skillStatus(ws, { name: name || undefined, installPath: opts.path });
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(formatSkillStatusText(result));
    if (result.status !== "ok")
        process.exitCode = 1;
});
const r2cmd = program.command("r2").description("Object store for attach originals (operator)");
r2cmd
    .command("fill-attach")
    .description("Upload files from a local attach directory to R2 using existing imported/attach/ names. Does not create stubs.")
    .requiredOption("--library <id>", "library id (object key prefix), e.g. Academic")
    .requiredOption("--dir <path>", "directory of originals (usually imported/attach)")
    .option("--dry-run", "count files only; do not contact R2")
    .option("--delete-source", "delete each local file after HEAD confirms the object")
    .option("--concurrency <n>", "parallel uploads", "3")
    .action(async (opts) => {
    if (!opts.dryRun && !isR2Enabled()) {
        console.error("R2 is not configured. Set CENTRICMEM_R2_* in the environment.");
        process.exit(1);
    }
    const result = await fillAttachFromDir({
        libraryId: opts.library,
        dir: path.resolve(opts.dir),
        dryRun: Boolean(opts.dryRun),
        deleteSource: Boolean(opts.deleteSource),
        concurrency: opts.concurrency ? parseInt(opts.concurrency, 10) : 3,
    });
    console.log(`${opts.dryRun ? "dry-run" : "fill"} library=${result.libraryId} scanned=${result.scanned} uploaded=${result.uploaded} skipped=${result.skipped} failed=${result.failed} bytes=${result.bytes} deleted=${result.deleted}`);
    if (result.failed > 0)
        process.exitCode = 1;
});
program
    .command("doctor")
    .description("Check CLI, skill, librarian, and whether cwd is linked to a memory project")
    .option("--json", "machine-readable JSON output")
    .action(async (opts) => {
    const home = getProductHome();
    const ws = tryWorkspace();
    const r = await runDoctor(ws ?? home);
    if (opts.json) {
        console.log(JSON.stringify(r, null, 2));
    }
    else {
        console.log(formatDoctorText(r));
    }
    if (!r.ok)
        process.exitCode = 1;
});
program
    .command("ambient")
    .description("Implicit memory preflight block (session start)")
    .option("-p, --project <slug>", "library id (-p alias)")
    .option("--write", "also print the path of the refreshed .ambient.md")
    .action(async (opts) => {
    if (isLibrarianGuest()) {
        const res = await librarianRequest("/ambient", { library: opts.project });
        const body = (await res.json());
        if (!res.ok) {
            console.error(body.error?.message || `Ambient failed (${res.status}).`);
            process.exit(1);
        }
        console.log(body.text || "");
        return;
    }
    const ws = tryWorkspace();
    if (!ws) {
        console.log(formatUninitializedAmbient(getProductHome()).text);
        return;
    }
    const block = buildAmbient(ws, opts.project);
    console.log(block.text);
    const f = writeAmbientFile(ws, block);
    if (opts.write) {
        console.log(f ? `\nWritten: ${path.relative(ws, f)}` : "\nWritten: (skipped — library not writable)");
    }
});
program
    .command("promote")
    .description("Promote recurring patterns to Global Rules")
    .option("--from-distill", "show distill suggestions")
    .option("--pattern <text>", "rule text to promote")
    .option("-p, --project <slug>", "library id (-p alias)")
    .option("--confirm", "write to AGENTS.md (required)")
    .action((opts) => {
    const ws = requireLocalWriter();
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
    if (r.promoted)
        buildIndex(resolvePaths(ws, slug));
});
program
    .command("refs <seq>")
    .description("Show link neighborhood of a decision (refs / mentions / supersedes)")
    .option("--depth <n>", "hops to expand (1-3)", "1")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action((seqArg, opts) => {
    if (isLibrarianGuest()) {
        console.error("Guest: refs reads the leftover hub index. Search HTTP instead.");
        process.exit(1);
    }
    const ws = requireWorkspace();
    const seq = parseInt(seqArg.replace(/^#/, ""), 10);
    if (!Number.isInteger(seq) || seq < 1) {
        console.error("Provide a decision sequence number, e.g. `centricmem refs 3`.");
        process.exit(1);
    }
    const depth = Math.min(Math.max(parseInt(opts.depth ?? "1", 10) || 1, 1), 3);
    const graph = getLinks(resolvePaths(ws, opts.project), seq, depth);
    const root = graph.get(decisionId(seq));
    if (!root || (!root.out.length && !root.in.length && graph.size <= 1)) {
        console.log(`No links found for decision #${String(seq).padStart(4, "0")}. Links come from **Supersedes**, **Refs**, or inline #NNNN mentions (run \`centricmem index\` after editing).`);
        return;
    }
    for (const [id, n] of graph) {
        console.log(`\n${id}${id === decisionId(seq) ? "  (root)" : ""}`);
        for (const e of n.out)
            console.log(`  → ${e.rel.padEnd(10)} ${e.toId}`);
        for (const e of n.in)
            console.log(`  ← ${e.rel.padEnd(10)} ${e.fromFile}`);
        if (!n.out.length && !n.in.length)
            console.log("  (no links)");
    }
});
program
    .command("dismiss <file>")
    .description("Negative feedback — down-rank a memory chunk")
    .option("--heading <heading>", "specific section heading")
    .option("-p, --project <slug>", "library id (-p alias)")
    .action((file, opts) => {
    const ws = requireLocalWriter();
    dismissChunk(resolvePaths(ws, opts.project), file, opts.heading);
    console.log(`Dismissed: ${file}${opts.heading ? ` / ${opts.heading}` : ""}`);
});
program
    .command("status")
    .description("Memory health for current project or workspace")
    .option("-p, --project <slug>", "library id (-p alias)")
    .option("--workspace", "workspace-level health including unclassified backlog")
    .action((opts) => {
    if (isLibrarianGuest()) {
        const cat = loadCatalog();
        console.log(`Guest of ${librarianGuestOrigin()} — leftover hub is not the writer.`);
        console.log(`libraries: ${cat?.libraries.map((lib) => lib.id).join(", ") || "(none)"}`);
        console.log("Use HTTP /ambient or `centricmem doctor`.");
        return;
    }
    const ws = tryWorkspace();
    if (!ws) {
        console.log(formatUninitializedStatus(getProductHome()));
        return;
    }
    if (opts.workspace) {
        const wh = workspaceHealth(ws);
        console.log("CentricMem Workspace Status");
        console.log(`unclassified: ${wh.unclassified.total} items (decisions ${wh.unclassified.decisions}, lessons ${wh.unclassified.lessons}, imported ${wh.unclassified.imported}, sessions ${wh.unclassified.sessions})`);
        if (wh.unclassified.oldestDate)
            console.log(`oldest unclassified: ${wh.unclassified.oldestDate}`);
        for (const p of wh.projects) {
            console.log(`  ${p.slug}: health ${p.score} (${p.issues} issue(s))`);
        }
        if (wh.issues.length) {
            console.log("\nIssues:");
            for (const i of wh.issues)
                console.log(`  • ${i.message}`);
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
    if (!recent.length)
        console.log("  (none yet)");
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
        for (const i of h.issues)
            console.log(`  • ${i.message}`);
    }
});
program
    .command("index")
    .description("Rebuild FTS5 index (and embeddings when --embed)")
    .option("--all", "index all projects")
    .option("-p, --project <slug>", "index one library")
    .option("-q, --quiet", "suppress output")
    .option("--embed", "also embed chunks via API")
    .action(async (opts) => {
    const ws = requireLocalWriter();
    let stats;
    if (opts.all) {
        stats = buildIndexAll(ws, { quiet: opts.quiet });
        if (opts.embed) {
            if (!opts.quiet) {
                console.log("Embedding chunks via API — this may take a while; please wait…");
            }
            let embedded = 0;
            for (const p of listProjects(ws)) {
                embedded += (await buildIndexAsync(resolvePaths(ws, p.slug), { embed: true })).embedded ?? 0;
            }
            stats.embedded = embedded;
            if (!opts.quiet)
                console.log(`Embedding complete: ${embedded} chunk(s).`);
        }
    }
    else {
        const paths = resolvePaths(ws, opts.project);
        const slug = opts.project ?? "current project";
        if (!opts.quiet) {
            logIndexStart(`project "${slug}"`);
            if (opts.embed)
                console.log("Including API embeddings — please wait…");
        }
        stats = opts.embed ? await buildIndexAsync(paths, { embed: true }) : buildIndex(paths);
        if (!opts.quiet)
            logIndexDone(stats);
    }
});
program
    .command("serve")
    .description("Run the librarian HTTP API (Manager starts this automatically)")
    .option("--port <n>", "preferred port", String(DEFAULT_HOST_PORT))
    .option("--bind <addr>", "listen address (default 127.0.0.1; 0.0.0.0 until TLS is behind a proxy)")
    .option("--token <token>", "bind this token to the Inbox library (default: mint/keep catalogue keys)")
    .action(async (opts) => {
    denyGuestHubWrite("serve");
    const ws = tryWorkspace() ?? getProductHome();
    const port = opts.port ? parseInt(opts.port, 10) : DEFAULT_HOST_PORT;
    await listenHostServer({
        home: ws,
        token: opts.token?.trim() || undefined,
        port,
        bind: opts.bind?.trim() || process.env.CENTRICMEM_BIND?.trim(),
    });
    console.error("Librarian is listening. Leave this process running. Pairing keys are in the library catalogue (not printed).");
});
function readAccountPassword(opts) {
    if (opts.passwordFile) {
        const value = fs.readFileSync(path.resolve(opts.passwordFile), "utf8").replace(/^\uFEFF/, "").trim();
        if (!value)
            throw new Error("Password file is empty.");
        return value;
    }
    const env = process.env.CENTRICMEM_ACCOUNT_PASSWORD?.trim();
    if (env)
        return env;
    throw new Error("Set CENTRICMEM_ACCOUNT_PASSWORD or pass --password-file. Do not put the password on the command line.");
}
function librarianUrl(opts) {
    return (opts.url || process.env.CENTRICMEM_URL || `http://127.0.0.1:${DEFAULT_HOST_PORT}`).replace(/\/+$/, "");
}
function accountError(error) {
    if (error instanceof AccountError) {
        console.error(error.message);
        process.exit(error.http >= 500 ? 1 : 1);
    }
    throw error;
}
const account = program.command("account").description("Owner login for a librarian (website register is POST /register)");
account
    .command("bootstrap")
    .description("Create the single owner on this hub. Refuses if one already exists.")
    .requiredOption("--email <email>", "owner email")
    .option("--password-file <path>", "read password from this file (or CENTRICMEM_ACCOUNT_PASSWORD)")
    .action((opts) => {
    denyGuestHubWrite("account bootstrap");
    const ws = requireLocalWriter();
    try {
        const owner = bootstrapOwner(ws, opts.email, readAccountPassword(opts));
        console.log(`Owner ${owner.email} created. Sign in on the website or with centricmem account login.`);
    }
    catch (error) {
        accountError(error);
    }
});
account
    .command("login")
    .description("Sign in to a librarian and store a local session (not an agent pairing key)")
    .requiredOption("--email <email>", "owner email")
    .option("--url <url>", "librarian origin")
    .option("--password-file <path>", "read password from this file (or CENTRICMEM_ACCOUNT_PASSWORD)")
    .action(async (opts) => {
    const url = librarianUrl(opts);
    const password = readAccountPassword(opts);
    const res = await accountFetch(url, undefined, "POST", "/login", { email: opts.email, password });
    const body = res.json;
    if (res.status !== 200 || !body.token || !body.email) {
        console.error(body.error?.message || `Login failed (${res.status}).`);
        process.exit(1);
    }
    saveGuestSession({ url, email: body.email, token: body.token, expiresAt: body.expiresAt || "" });
    console.log(`Signed in as ${body.email} at ${url}. This session is not an agent pairing key.`);
});
account
    .command("forgot")
    .description("Email a password-reset link if this address is the librarian owner")
    .requiredOption("--email <email>", "owner email")
    .option("--url <url>", "librarian origin")
    .action(async (opts) => {
    const url = librarianUrl(opts);
    const res = await accountFetch(url, undefined, "POST", "/forgot-password", { email: opts.email });
    const body = res.json;
    if (res.status !== 200 || !body.ok) {
        console.error(body.error?.message || `Forgot password failed (${res.status}).`);
        process.exit(1);
    }
    console.log(body.message || "If that email is the owner, we sent a reset link.");
});
account
    .command("reset")
    .description("Set a new owner password from a reset token file (do not pass the token on the command line)")
    .requiredOption("--token-file <path>", "file containing the reset token")
    .option("--password-file <path>", "read password from this file (or CENTRICMEM_ACCOUNT_PASSWORD)")
    .option("--url <url>", "librarian origin")
    .action(async (opts) => {
    const url = librarianUrl(opts);
    const token = fs.readFileSync(path.resolve(opts.tokenFile), "utf8").replace(/^\uFEFF/, "").trim();
    if (!token) {
        console.error("Token file is empty.");
        process.exit(1);
    }
    const password = readAccountPassword(opts);
    const res = await accountFetch(url, undefined, "POST", "/reset-password", { token, password });
    const body = res.json;
    if (res.status !== 200 || !body.token || !body.email) {
        console.error(body.error?.message || `Reset failed (${res.status}).`);
        process.exit(1);
    }
    saveGuestSession({ url, email: body.email, token: body.token, expiresAt: body.expiresAt || "" });
    console.log(`Password updated. Signed in as ${body.email} at ${url}.`);
});
account
    .command("logout")
    .description("Drop the local owner session")
    .option("--url <url>", "librarian origin")
    .action(async (opts) => {
    const session = loadGuestSession();
    const url = opts.url || session?.url;
    if (session?.token && url) {
        await accountFetch(url, session.token, "POST", "/account/logout");
    }
    clearGuestSession();
    console.log("Signed out.");
});
account
    .command("status")
    .description("Show the local owner session (no pairing tokens)")
    .action(async () => {
    const session = loadGuestSession();
    if (!session) {
        console.log("Not signed in.");
        return;
    }
    const res = await accountFetch(session.url, session.token, "GET", "/account");
    if (res.status !== 200) {
        console.log(`Session at ${session.url} is not valid (${res.status}).`);
        return;
    }
    const body = res.json;
    console.log(`Signed in as ${body.email || session.email} at ${session.url}`);
    for (const lib of body.libraries ?? []) {
        const live = (lib.keys ?? []).filter((k) => k.active).length;
        console.log(`  ${lib.id}  ${lib.displayName}  ${live} active key(s)`);
    }
});
account
    .command("library")
    .description("Create a library on the signed-in librarian")
    .requiredOption("--create <id>", "new library id")
    .option("--url <url>", "librarian origin")
    .action(async (opts) => {
    const session = loadGuestSession();
    if (!session) {
        console.error("Not signed in. centricmem account login --email …");
        process.exit(1);
    }
    const url = opts.url || session.url;
    const res = await accountFetch(url, session.token, "POST", "/account/libraries", { id: opts.create });
    const body = res.json;
    if (res.status !== 200 || !body.ok) {
        console.error(body.error?.message || `Create failed (${res.status}).`);
        process.exit(1);
    }
    console.log(`Created library ${body.library?.id || opts.create}`);
});
account
    .command("key")
    .description("Mint or revoke a named pairing key (prints a new token once)")
    .option("--library <id>", "library id")
    .option("--create <name>", "mint a named key")
    .option("--revoke <keyId>", "revoke a key id")
    .option("--list", "list key names (no tokens)")
    .option("--url <url>", "librarian origin")
    .action(async (opts) => {
    const session = loadGuestSession();
    if (!session) {
        console.error("Not signed in. centricmem account login --email …");
        process.exit(1);
    }
    if (!opts.library) {
        console.error("Pass --library <id>.");
        process.exit(1);
    }
    const url = opts.url || session.url;
    if (opts.create) {
        const res = await accountFetch(url, session.token, "POST", "/account/keys", {
            library: opts.library,
            name: opts.create,
        });
        const body = res.json;
        if (res.status !== 200 || !body.token) {
            console.error(body.error?.message || `Mint failed (${res.status}).`);
            process.exit(1);
        }
        console.log(`Key ${body.name} (${body.id}) — copy now, it is not shown again:`);
        console.log(body.token);
        return;
    }
    if (opts.revoke) {
        const res = await accountFetch(url, session.token, "POST", "/account/keys/revoke", {
            library: opts.library,
            id: opts.revoke,
        });
        const body = res.json;
        if (res.status !== 200 || !body.ok) {
            console.error(body.error?.message || `Revoke failed (${res.status}).`);
            process.exit(1);
        }
        console.log(`Revoked key ${opts.revoke} on ${opts.library}`);
        return;
    }
    const res = await accountFetch(url, session.token, "GET", "/account");
    const body = res.json;
    const lib = body.libraries?.find((row) => row.id === opts.library);
    if (!lib) {
        console.error(`Unknown library: ${opts.library}`);
        process.exit(1);
    }
    for (const key of lib.keys ?? []) {
        console.log(`${key.active ? " " : "x"} ${key.id}  ${key.name}  ${key.createdAt}`);
    }
});
program.parse();
