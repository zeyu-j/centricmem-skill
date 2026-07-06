/**
 * setup.ts — guided workspace setup (Skill companion).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initProject } from "./memory.js";
import { buildIndexAll } from "./indexer.js";
import { linkProject, discoverLinkableDirs, discoverMigrateSources, listProjects, } from "./workspace.js";
import { migrate } from "./migrate.js";
export function runSetup(opts = {}) {
    const workspaceRoot = path.resolve(opts.workspace ?? process.cwd());
    initProject(workspaceRoot);
    const linked = [];
    if (opts.linkAll) {
        for (const sub of discoverLinkableDirs(workspaceRoot)) {
            const slug = linkProject(workspaceRoot, sub);
            linked.push(slug);
        }
    }
    let migrated = 0;
    if (opts.migrateDiscover) {
        for (const s of discoverMigrateSources(workspaceRoot)) {
            migrate(workspaceRoot, s.type, s.path);
            migrated++;
        }
    }
    let skillInstalled = false;
    if (opts.installSkill) {
        skillInstalled = installSkillToWorkspace(workspaceRoot);
    }
    let academicSkillInstalled = false;
    if (opts.installAcademicSkill) {
        academicSkillInstalled = installAcademicSkillToWorkspace(workspaceRoot);
    }
    let hooksInstalled = false;
    if (opts.installHooks) {
        hooksInstalled = installCursorHooks(workspaceRoot);
    }
    if (opts.driveMcpHint) {
        printDriveMcpHint(workspaceRoot);
    }
    buildIndexAll(workspaceRoot);
    return { workspaceRoot, linked, migrated, skillInstalled, academicSkillInstalled, hooksInstalled };
}
function installAcademicSkillToWorkspace(workspaceRoot) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const skillSrc = path.resolve(here, "../skills/academic-db-agent/SKILL.md");
    if (!fs.existsSync(skillSrc))
        return false;
    const destDir = path.join(workspaceRoot, ".centricmem", "skills", "academic-db-agent");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(skillSrc, path.join(destDir, "SKILL.md"));
    return true;
}
function installSkillToWorkspace(workspaceRoot) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const skillSrc = path.resolve(here, "../skills/centricmem-agent/SKILL.md");
    if (!fs.existsSync(skillSrc))
        return false;
    const destDir = path.join(workspaceRoot, ".centricmem", "skills", "centricmem-agent");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(skillSrc, path.join(destDir, "SKILL.md"));
    return true;
}
/** Cursor-only convenience: copy lifecycle hooks from integrations/ to `.cursor/hooks/`. */
export function installCursorHooks(workspaceRoot) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const hooksFile = path.resolve(here, "../skills/centricmem-agent/integrations/cursor-hooks.json");
    if (!fs.existsSync(hooksFile))
        return false;
    const destDir = path.join(workspaceRoot, ".cursor", "hooks");
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(hooksFile, path.join(destDir, "hooks.json"));
    return true;
}
export function printDriveMcpHint(workspaceRoot) {
    console.log("\n--- Optional: Drive MCP for memory sync ---");
    console.log("MCP is for external sync only (not local indexing).");
    console.log("Add a Drive MCP server to your agent config, then sync:");
    console.log(`  ${path.join(workspaceRoot, ".centricmem", "projects")}`);
    console.log("\nAgent MCP config example (merge into your agent's mcpServers):");
    console.log(JSON.stringify({
        mcpServers: {
            centricmem: {
                command: "centricmem-mcp",
                env: {
                    CENTRICMEM_WORKSPACE: workspaceRoot,
                },
            },
            "google-drive": {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-gdrive"],
            },
        },
    }, null, 2));
    console.log("\nSet env: CENTRICMEM_WORKSPACE=" + workspaceRoot);
    console.log("See skills/centricmem-agent/integrations/mcp-config.snippet.json for more.");
}
export function printSetupSummary(workspaceRoot) {
    const projects = listProjects(workspaceRoot);
    console.log("\nCentricMem workspace ready.");
    console.log(`  Root: ${workspaceRoot}`);
    console.log(`  Projects (${projects.length}):`);
    for (const p of projects) {
        console.log(`    ${p.current ? "*" : " "} ${p.slug}${p.entry.system ? " (system)" : ""}`);
    }
    console.log("\nNext: read .centricmem/skills/centricmem-agent/SKILL.md");
}
