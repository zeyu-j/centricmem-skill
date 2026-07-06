/**
 * workspace.ts — multi-project workspace hub (.centricmem/projects/<slug>/).
 */
import fs from "node:fs";
import path from "node:path";
import { MEM_DIR, ensureDir, nowISO, slugify } from "./core.js";
import { agentsTemplate, activeContextTemplate, lessonsTemplate, indexGitignore, } from "./templates.js";
import { healthCheck } from "./memory.js";
export const UNCLASSIFIED = "unclassified";
export const WORKSPACE_FILE = "workspace.json";
export function workspaceFilePath(workspaceRoot) {
    return path.join(workspaceRoot, MEM_DIR, WORKSPACE_FILE);
}
export function isWorkspace(workspaceRoot) {
    return fs.existsSync(workspaceFilePath(workspaceRoot));
}
export function loadWorkspace(workspaceRoot) {
    const file = workspaceFilePath(workspaceRoot);
    if (!fs.existsSync(file)) {
        throw new Error(`No workspace found at ${file}. Run \`centricmem init\` first.`);
    }
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw.version !== 1)
        throw new Error(`Unsupported workspace version: ${raw.version}`);
    return raw;
}
export function saveWorkspace(workspaceRoot, config) {
    ensureDir(path.join(workspaceRoot, MEM_DIR));
    fs.writeFileSync(workspaceFilePath(workspaceRoot), JSON.stringify(config, null, 2) + "\n", "utf8");
}
export function projectSlugFromName(name) {
    return slugify(name).replace(/^-+|-+$/g, "") || "project";
}
/** Walk up from startDir to find a directory containing .centricmem/workspace.json. */
export function findWorkspaceRoot(startDir = process.cwd()) {
    const env = process.env.CENTRICMEM_WORKSPACE;
    if (env && isWorkspace(env))
        return path.resolve(env);
    let dir = path.resolve(startDir);
    while (true) {
        if (isWorkspace(dir))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
export function getCurrentProjectSlug(workspaceRoot) {
    if (process.env.CENTRICMEM_PROJECT)
        return process.env.CENTRICMEM_PROJECT;
    return loadWorkspace(workspaceRoot).current;
}
export function listProjects(workspaceRoot) {
    const ws = loadWorkspace(workspaceRoot);
    return Object.entries(ws.projects).map(([slug, entry]) => ({
        slug,
        entry,
        current: slug === ws.current,
    }));
}
/** Scaffold projects/<slug>/ memory files (no workspace.json). */
export function scaffoldProjectDir(workspaceRoot, slug, displayName) {
    const memDir = path.join(workspaceRoot, MEM_DIR, "projects", slug);
    const decisionsDir = path.join(memDir, "decisions");
    const indexDir = path.join(memDir, ".index");
    const created = [];
    const skipped = [];
    const ts = nowISO();
    ensureDir(decisionsDir);
    ensureDir(indexDir);
    ensureDir(path.join(memDir, "sessions"));
    const writeIfAbsent = (p, content) => {
        if (fs.existsSync(p))
            skipped.push(path.relative(workspaceRoot, p));
        else {
            fs.writeFileSync(p, content, "utf8");
            created.push(path.relative(workspaceRoot, p));
        }
    };
    writeIfAbsent(path.join(memDir, "AGENTS.md"), agentsTemplate(displayName, ts));
    writeIfAbsent(path.join(memDir, "config.json"), JSON.stringify({ decay_rate: 0.01, max_results: 5, ref_weight: 0.1 }, null, 2) + "\n");
    writeIfAbsent(path.join(memDir, "active_context.md"), activeContextTemplate(ts));
    writeIfAbsent(path.join(memDir, "lessons.md"), lessonsTemplate());
    writeIfAbsent(path.join(indexDir, ".gitignore"), indexGitignore());
    return { created, skipped };
}
export function initWorkspace(workspaceRoot) {
    const created = [];
    const skipped = [];
    const wsFile = workspaceFilePath(workspaceRoot);
    if (fs.existsSync(wsFile)) {
        skipped.push(path.relative(workspaceRoot, wsFile));
    }
    else {
        const ts = nowISO();
        const config = {
            version: 1,
            current: UNCLASSIFIED,
            projects: {
                [UNCLASSIFIED]: { path: UNCLASSIFIED, linked_at: ts, system: true },
            },
        };
        saveWorkspace(workspaceRoot, config);
        created.push(path.relative(workspaceRoot, wsFile));
    }
    const proj = scaffoldProjectDir(workspaceRoot, UNCLASSIFIED, UNCLASSIFIED);
    created.push(...proj.created);
    skipped.push(...proj.skipped);
    return { created, skipped };
}
export function linkProject(workspaceRoot, subpath) {
    const abs = path.resolve(workspaceRoot, subpath);
    if (!fs.existsSync(abs))
        throw new Error(`Path not found: ${abs}`);
    const slug = projectSlugFromName(path.basename(abs));
    const ws = loadWorkspace(workspaceRoot);
    if (!ws.projects[slug]) {
        ws.projects[slug] = {
            path: slug,
            linked_at: nowISO(),
            sourceDir: path.relative(workspaceRoot, abs) || ".",
        };
        saveWorkspace(workspaceRoot, ws);
    }
    scaffoldProjectDir(workspaceRoot, slug, slug);
    return slug;
}
export function useProject(workspaceRoot, slug) {
    const ws = loadWorkspace(workspaceRoot);
    if (!ws.projects[slug])
        throw new Error(`Unknown project: ${slug}`);
    ws.current = slug;
    saveWorkspace(workspaceRoot, ws);
}
export function ensureProjectRegistered(workspaceRoot, slug) {
    const ws = loadWorkspace(workspaceRoot);
    if (!ws.projects[slug]) {
        ws.projects[slug] = { path: slug, linked_at: nowISO() };
        saveWorkspace(workspaceRoot, ws);
        scaffoldProjectDir(workspaceRoot, slug, slug);
    }
}
/** Move a file under unclassified project memDir to target project (relative to memDir). */
export function classifyMemory(workspaceRoot, relPath, toSlug) {
    if (toSlug === UNCLASSIFIED)
        throw new Error("Cannot classify into unclassified.");
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(toSlug))
        throw new Error(`Invalid project slug: ${toSlug}`);
    const fromDir = path.join(workspaceRoot, MEM_DIR, "projects", UNCLASSIFIED);
    const toDir = path.join(workspaceRoot, MEM_DIR, "projects", toSlug);
    // Reject path traversal: the resolved source/dest must stay inside their project dirs.
    const src = path.resolve(fromDir, relPath);
    const dest = path.resolve(toDir, relPath);
    if (!src.startsWith(fromDir + path.sep) || !dest.startsWith(toDir + path.sep)) {
        throw new Error(`Invalid path (escapes project memory): ${relPath}`);
    }
    if (!fs.existsSync(src))
        throw new Error(`Not found in unclassified: ${relPath}`);
    ensureProjectRegistered(workspaceRoot, toSlug);
    ensureDir(path.dirname(dest));
    fs.renameSync(src, dest);
    return { moved: [relPath] };
}
/** Scan workspace for linkable subdirectories. */
export function discoverLinkableDirs(workspaceRoot) {
    const out = [];
    if (!fs.existsSync(workspaceRoot))
        return out;
    for (const e of fs.readdirSync(workspaceRoot, { withFileTypes: true })) {
        if (!e.isDirectory())
            continue;
        if (e.name.startsWith(".") || e.name === "node_modules")
            continue;
        const abs = path.join(workspaceRoot, e.name);
        const hasGit = fs.existsSync(path.join(abs, ".git"));
        const hasPkg = fs.existsSync(path.join(abs, "package.json"));
        if (hasGit || hasPkg)
            out.push(e.name);
    }
    return out.sort();
}
/** Discover legacy memory sources under workspace. */
export function discoverMigrateSources(workspaceRoot) {
    const found = [];
    const add = (type, p) => {
        if (fs.existsSync(path.join(workspaceRoot, p)))
            found.push({ type, path: p });
    };
    add("cursor-rules", ".cursorrules");
    add("cursor-rules", ".cursor/rules");
    add("memory-bank", "memory-bank");
    for (const sub of discoverLinkableDirs(workspaceRoot)) {
        add("cursor-rules", path.join(sub, ".cursor/rules"));
        add("memory-bank", path.join(sub, "memory-bank"));
    }
    return found;
}
function tokenize(s) {
    const words = s.toLowerCase().match(/[a-z][a-z0-9_-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
    return new Set(words);
}
/** Suggest target project for an unclassified memory file. */
export function suggestClassify(workspaceRoot, relPath) {
    const fromDir = path.join(workspaceRoot, MEM_DIR, "projects", UNCLASSIFIED);
    const src = path.resolve(fromDir, relPath);
    if (!src.startsWith(fromDir + path.sep)) {
        throw new Error(`Invalid path (escapes project memory): ${relPath}`);
    }
    if (!fs.existsSync(src))
        throw new Error(`Not found in unclassified: ${relPath}`);
    const content = fs.readFileSync(src, "utf8");
    const fileTokens = tokenize(`${relPath} ${content.slice(0, 2000)}`);
    const ws = loadWorkspace(workspaceRoot);
    const scores = [];
    for (const [slug, entry] of Object.entries(ws.projects)) {
        if (slug === UNCLASSIFIED)
            continue;
        const slugTokens = tokenize(slug);
        const nameTokens = tokenize(entry.sourceDir ?? slug);
        let overlap = 0;
        for (const t of fileTokens) {
            if (slugTokens.has(t) || nameTokens.has(t))
                overlap++;
        }
        const tagMatch = (content.match(/\*\*Tags\*\*:\s*(.+)/)?.[1] ?? "")
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
        for (const tag of tagMatch) {
            if (slugTokens.has(tag) || nameTokens.has(tag))
                overlap += 2;
        }
        if (overlap > 0) {
            scores.push({
                slug,
                score: overlap,
                reason: `token overlap with project "${slug}"`,
            });
        }
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, 3);
}
/** Workspace-level health including unclassified backlog. */
export function workspaceHealth(workspaceRoot, opts) {
    const backlogThreshold = opts?.backlogThreshold ?? 10;
    const staleDays = opts?.staleDays ?? 30;
    const unclassifiedDir = path.join(workspaceRoot, MEM_DIR, "projects", UNCLASSIFIED);
    const issues = [];
    const countMd = (subdir) => {
        const d = path.join(unclassifiedDir, subdir);
        if (!fs.existsSync(d))
            return { count: 0, oldest: null };
        const files = fs.readdirSync(d).filter((f) => f.endsWith(".md"));
        let oldest = null;
        for (const f of files) {
            const m = fs.statSync(path.join(d, f)).mtime.toISOString();
            if (!oldest || m < oldest)
                oldest = m;
        }
        return { count: files.length, oldest };
    };
    const dec = countMd("decisions");
    const impDir = path.join(unclassifiedDir, "imported");
    let impCount = 0;
    let impOldest = null;
    if (fs.existsSync(impDir)) {
        const walk = (dir) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const abs = path.join(dir, e.name);
                if (e.isDirectory())
                    walk(abs);
                else if (e.name.endsWith(".md")) {
                    impCount++;
                    const m = fs.statSync(abs).mtime.toISOString();
                    if (!impOldest || m < impOldest)
                        impOldest = m;
                }
            }
        };
        walk(impDir);
    }
    const sessDir = path.join(unclassifiedDir, "sessions");
    let sessCount = 0;
    let sessOldest = null;
    if (fs.existsSync(sessDir)) {
        for (const f of fs.readdirSync(sessDir).filter((x) => x.endsWith(".md"))) {
            sessCount++;
            const m = fs.statSync(path.join(sessDir, f)).mtime.toISOString();
            if (!sessOldest || m < sessOldest)
                sessOldest = m;
        }
    }
    const lessonsFile = path.join(unclassifiedDir, "lessons.md");
    let lessonsCount = 0;
    if (fs.existsSync(lessonsFile)) {
        lessonsCount = (fs.readFileSync(lessonsFile, "utf8").match(/^##\s+/gm) ?? []).length;
    }
    const total = dec.count + impCount + lessonsCount + sessCount;
    const oldestCandidates = [dec.oldest, impOldest, sessOldest].filter(Boolean);
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
    const projects = [];
    for (const slug of Object.keys(ws.projects)) {
        if (slug === UNCLASSIFIED)
            continue;
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
