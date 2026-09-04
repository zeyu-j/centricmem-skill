/**
 * setup.ts — guided product-home setup (Skill companion).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { initProject } from "./memory.js";
import { buildIndexAll } from "./indexer.js";
import { linkProject, discoverLinkableDirs, discoverMigrateSources, listProjects, loadWorkspace, saveWorkspace, findLocalLegacyHub, isWorkspace, } from "./workspace.js";
import { migrate } from "./migrate.js";
import { ensureHubCatalog } from "./libraries.js";
import { getProductHome, LOCAL_MEM_DIR, skillsDir, ensureDir, assertLibraryPath, persistProductHome, looksLikeClientFolder, HUB_TOP_FILES, HUB_TOP_DIRS, } from "./core.js";
import { isLibrarianGuest, librarianGuestOrigin } from "./guest.js";
import { packageRoot } from "./skill.js";
export function runSetup(opts = {}) {
    const home = path.resolve(opts.workspace ?? getProductHome());
    assertLibraryPath(home);
    const codeRoot = path.resolve(opts.codeRoot ?? process.cwd());
    const guest = isLibrarianGuest();
    const hubMutating = Boolean(opts.bootstrap ||
        opts.migrateHome ||
        opts.migrateFromLocal ||
        opts.migrateDiscover ||
        opts.persistHome ||
        opts.linkAll ||
        opts.linkPaths?.length);
    if (guest && hubMutating) {
        throw new Error(librarianGuestOrigin()
            ? `Guest of ${librarianGuestOrigin()}: setup cannot write the leftover hub. Use --install-skill only.`
            : "Guest setup cannot write the leftover hub.");
    }
    const linkAll = opts.bootstrap ? true : !!opts.linkAll;
    const installSkill = opts.bootstrap ? true : !!opts.installSkill;
    let migratedHome = false;
    let retiredOldHome = false;
    if (opts.migrateHome) {
        const from = path.resolve(opts.fromHome ?? getProductHome());
        migratedHome = migrateProductHome(from, home);
        if (opts.retireOldHome) {
            retiredOldHome = retireMixedHub(from);
        }
    }
    if (!guest) {
        initProject(home, codeRoot);
    }
    let persistedHome = null;
    if (opts.persistHome) {
        persistedHome = persistProductHome(home);
    }
    let migratedFromLocal = false;
    if (opts.migrateFromLocal) {
        migratedFromLocal = migrateFromLocalHub(home, codeRoot);
    }
    const linked = [];
    if (linkAll) {
        for (const sub of discoverLinkableDirs(codeRoot)) {
            const slug = linkProject(home, path.join(codeRoot, sub), codeRoot);
            linked.push(slug);
        }
    }
    for (const p of opts.linkPaths ?? []) {
        const abs = path.resolve(codeRoot, p);
        const slug = linkProject(home, abs, codeRoot);
        if (!linked.includes(slug))
            linked.push(slug);
    }
    if (!guest) {
        try {
            ensureHubCatalog(home);
        }
        catch {
            /* catalog is machine-local; hub still works without it */
        }
    }
    let migrated = 0;
    if (opts.migrateDiscover) {
        for (const s of discoverMigrateSources(codeRoot)) {
            migrate(home, s.type, path.resolve(codeRoot, s.path));
            migrated++;
        }
    }
    let skillInstalled = false;
    if (installSkill) {
        skillInstalled = installSkillToHome(home, guest);
    }
    let academicSkillInstalled = false;
    if (opts.installAcademicSkill) {
        academicSkillInstalled = installAcademicSkillToHome(home);
    }
    let hooksInstalled = false;
    if (opts.installHooks) {
        hooksInstalled = installCursorHooks(codeRoot);
    }
    if (opts.driveMcpHint) {
        printDriveMcpHint(home);
    }
    const legacy = findLocalLegacyHub(codeRoot);
    if (legacy && !opts.migrateFromLocal) {
        console.log(`\nNote: legacy hub found at ${legacy}. Run \`centricmem setup --migrate-from-local\` to move it to ${home}.`);
    }
    if (!guest) {
        buildIndexAll(home);
    }
    return {
        workspaceRoot: home,
        linked,
        migrated,
        migratedFromLocal,
        migratedHome,
        persistedHome,
        retiredOldHome,
        skillInstalled,
        academicSkillInstalled,
        hooksInstalled,
    };
}
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory())
            copyDirRecursive(from, to);
        else
            fs.copyFileSync(from, to);
    }
}
function copyEntryPreservingLinks(src, dest) {
    const st = fs.lstatSync(src);
    if (st.isSymbolicLink()) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) {
            try {
                const dst = fs.lstatSync(dest);
                if (dst.isSymbolicLink())
                    fs.unlinkSync(dest);
                else
                    fs.rmSync(dest, { recursive: true, force: true });
            }
            catch (e) {
                const err = e;
                if (err.code !== "ENOENT")
                    throw e;
            }
        }
        fs.symlinkSync(fs.readlinkSync(src), dest, process.platform === "win32" ? "junction" : undefined);
        return;
    }
    if (st.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(src)) {
            copyEntryPreservingLinks(path.join(src, name), path.join(dest, name));
        }
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}
/**
 * Copy workspace.json / projects / skills / manager.json from one hub to another.
 * When the source is a mixed client+hub folder, only those hub entries are copied.
 */
export function migrateProductHome(fromHome, toHome) {
    const from = path.resolve(fromHome);
    const to = path.resolve(toHome);
    if (from === to) {
        throw new Error(`--migrate-home source and destination are the same: ${to}`);
    }
    if (!fs.existsSync(path.join(from, "workspace.json"))) {
        throw new Error(`No workspace.json at ${from} — nothing to migrate`);
    }
    assertLibraryPath(to);
    ensureDir(to);
    for (const name of HUB_TOP_FILES) {
        const src = path.join(from, name);
        if (!fs.existsSync(src))
            continue;
        fs.copyFileSync(src, path.join(to, name));
    }
    for (const name of HUB_TOP_DIRS) {
        const src = path.join(from, name);
        if (!fs.existsSync(src))
            continue;
        copyEntryPreservingLinks(src, path.join(to, name));
    }
    console.log(`Migrated memory library ${from} → ${to}`);
    return true;
}
/** After a successful migrate, stop treating a client folder as a hub. */
export function retireMixedHub(dir) {
    const root = path.resolve(dir);
    if (!looksLikeClientFolder(root))
        return false;
    const ws = path.join(root, "workspace.json");
    if (!fs.existsSync(ws))
        return false;
    fs.renameSync(ws, path.join(root, "workspace.json.bak-library-moved"));
    return true;
}
export function retargetJunction(linkPath, newTarget) {
    const link = path.resolve(linkPath);
    const target = path.resolve(newTarget);
    if (!fs.existsSync(target)) {
        throw new Error(`Junction target does not exist: ${target}`);
    }
    if (fs.existsSync(link) || fs.lstatSync(link, { throwIfNoEntry: false })) {
        try {
            const st = fs.lstatSync(link);
            if (st.isSymbolicLink())
                fs.unlinkSync(link);
            else
                fs.rmSync(link, { recursive: true, force: true });
        }
        catch (e) {
            const err = e;
            if (err.code !== "ENOENT")
                throw e;
        }
    }
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : undefined);
}
/**
 * Copy repo/.centricmem → product home; fix sourceDir to absolute code path; remove local hub.
 */
export function migrateFromLocalHub(productHome, codeRoot) {
    const local = path.join(codeRoot, LOCAL_MEM_DIR);
    if (!fs.existsSync(path.join(local, "workspace.json")))
        return false;
    ensureDir(productHome);
    initProject(productHome, codeRoot);
    // Merge workspace.json projects
    const localWs = JSON.parse(fs.readFileSync(path.join(local, "workspace.json"), "utf8"));
    const homeWs = loadWorkspace(productHome);
    for (const [slug, entry] of Object.entries(localWs.projects ?? {})) {
        const srcProj = path.join(local, "projects", slug);
        const destProj = path.join(productHome, "projects", slug);
        if (fs.existsSync(srcProj)) {
            copyDirRecursive(srcProj, destProj);
        }
        if (slug === "unclassified" && homeWs.projects[slug]?.system)
            continue;
        let sourceDir = entry.sourceDir;
        if (sourceDir && !path.isAbsolute(sourceDir)) {
            sourceDir = path.resolve(codeRoot, sourceDir === "." ? "." : sourceDir);
        }
        if (!sourceDir && slug === path.basename(codeRoot)) {
            sourceDir = codeRoot;
        }
        homeWs.projects[slug] = {
            path: entry.path ?? slug,
            linked_at: entry.linked_at ?? new Date().toISOString(),
            system: entry.system,
            sourceDir: sourceDir ?? homeWs.projects[slug]?.sourceDir,
        };
    }
    if (localWs.current)
        homeWs.current = localWs.current;
    // Ensure this code root is linked
    const selfSlug = path.basename(codeRoot).toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "project";
    if (homeWs.projects[selfSlug] && !homeWs.projects[selfSlug].sourceDir) {
        homeWs.projects[selfSlug].sourceDir = codeRoot;
    }
    saveWorkspace(productHome, homeWs);
    const localSkills = path.join(local, "skills");
    if (fs.existsSync(localSkills)) {
        copyDirRecursive(localSkills, skillsDir(productHome));
    }
    // Remove local product data from the code repo
    fs.rmSync(local, { recursive: true, force: true });
    console.log(`Migrated ${local} → ${productHome}`);
    return true;
}
function installAcademicSkillToHome(productHome) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const skillSrc = path.resolve(here, "../skills/academic-db-agent/SKILL.md");
    if (!fs.existsSync(skillSrc))
        return false;
    const destDir = path.join(skillsDir(productHome), "academic-db-agent");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(skillSrc, path.join(destDir, "SKILL.md"));
    const cursorDest = path.join(os.homedir(), ".cursor", "skills", "academic-db-agent");
    fs.mkdirSync(cursorDest, { recursive: true });
    fs.copyFileSync(skillSrc, path.join(cursorDest, "SKILL.md"));
    return true;
}
function copySkillFiles(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of ["SKILL.md", "REFERENCE.md"]) {
        const src = path.join(srcDir, name);
        if (fs.existsSync(src))
            fs.copyFileSync(src, path.join(destDir, name));
    }
    const integrationsSrc = path.join(srcDir, "integrations");
    if (fs.existsSync(integrationsSrc)) {
        copyDirRecursive(integrationsSrc, path.join(destDir, "integrations"));
    }
}
function installSkillToHome(productHome, guest = false) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const skillDir = path.resolve(here, "../skills/centricmem-agent");
    if (!fs.existsSync(path.join(skillDir, "SKILL.md")))
        return false;
    if (!guest) {
        copySkillFiles(skillDir, path.join(skillsDir(productHome), "centricmem-agent"));
    }
    const home = os.homedir();
    for (const rel of [
        [".cursor", "skills", "centricmem-agent"],
        [".codex", "skills", "centricmem-agent"],
        [".agents", "skills", "centricmem-agent"],
    ]) {
        copySkillFiles(skillDir, path.join(home, ...rel));
    }
    return true;
}
/** Cursor-only convenience: copy lifecycle hooks to the code project's `.cursor/hooks/`. */
export function installCursorHooks(codeRoot) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const hooksFile = path.resolve(here, "../skills/centricmem-agent/integrations/cursor-hooks.json");
    if (!fs.existsSync(hooksFile))
        return false;
    const destDir = path.join(codeRoot, ".cursor", "hooks");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(hooksFile, path.join(destDir, "hooks.json"));
    return true;
}
export function printDriveMcpHint(productHome) {
    const projectsDir = path.join(productHome, "projects");
    console.log("\n--- Backup (not product sync) ---");
    console.log("The librarian disk is the source of truth. Do not rsync/Drive a second writable hub.");
    console.log("Operator disaster recovery: restic → a separate R2 bucket. Skip .index/ (rebuild after restore).");
    console.log("Markdown lives here:");
    console.log(`  ${projectsDir}`);
    console.log("\nConflict rule: never auto-merge decisions/. Humans pull-only. See SYNC.md.");
    console.log("\nAgents: Skill + librarian HTTP. Host MCP (`centricmem-host`) proxies that URL. `centricmem-mcp` is legacy.");
    console.log(`See ${path.join(productHome, "skills", "centricmem-agent", "integrations")}`);
}
export function printSetupSummary(workspaceRoot) {
    const projects = listProjects(workspaceRoot);
    console.log("\nCentricMem library ready.");
    console.log(`  Client:  ${packageRoot()}`);
    console.log(`  Library: ${workspaceRoot}`);
    console.log(`  Projects (${projects.length}):`);
    for (const p of projects) {
        console.log(`    ${p.current ? "*" : " "} ${p.slug}${p.entry.system ? " (system)" : ""}${p.entry.sourceDir ? ` → ${p.entry.sourceDir}` : ""}`);
    }
    console.log(`\nNext: read ${path.join(workspaceRoot, "skills", "centricmem-agent", "SKILL.md")}`);
}
export { isWorkspace };
