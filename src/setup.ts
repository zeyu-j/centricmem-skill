/**
 * setup.ts — guided product-home setup (Skill companion).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { initProject } from "./memory.js";
import { buildIndexAll } from "./indexer.js";
import {
  linkProject,
  discoverLinkableDirs,
  discoverMigrateSources,
  listProjects,
  loadWorkspace,
  saveWorkspace,
  findLocalLegacyHub,
  isWorkspace,
} from "./workspace.js";
import { migrate } from "./migrate.js";
import { getProductHome, LOCAL_MEM_DIR, skillsDir, ensureDir } from "./core.js";

export interface SetupOptions {
  /** Override product home (default getProductHome()). */
  workspace?: string;
  /** Code directory for link/hooks/pointers (default cwd). */
  codeRoot?: string;
  linkAll?: boolean;
  migrateDiscover?: boolean;
  migrateFromLocal?: boolean;
  installSkill?: boolean;
  installAcademicSkill?: boolean;
  installHooks?: boolean;
  driveMcpHint?: boolean;
}

export interface SetupResult {
  workspaceRoot: string;
  linked: string[];
  migrated: number;
  migratedFromLocal: boolean;
  skillInstalled: boolean;
  academicSkillInstalled: boolean;
  hooksInstalled: boolean;
}

export function runSetup(opts: SetupOptions = {}): SetupResult {
  const home = path.resolve(opts.workspace ?? getProductHome());
  const codeRoot = path.resolve(opts.codeRoot ?? process.cwd());
  initProject(home, codeRoot);

  let migratedFromLocal = false;
  if (opts.migrateFromLocal) {
    migratedFromLocal = migrateFromLocalHub(home, codeRoot);
  }

  const linked: string[] = [];
  if (opts.linkAll) {
    for (const sub of discoverLinkableDirs(codeRoot)) {
      const slug = linkProject(home, path.join(codeRoot, sub), codeRoot);
      linked.push(slug);
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
  if (opts.installSkill) {
    skillInstalled = installSkillToHome(home);
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
    console.log(
      `\nNote: legacy hub found at ${legacy}. Run \`centricmem setup --migrate-from-local\` to move it to ${home}.`,
    );
  }

  buildIndexAll(home);

  return {
    workspaceRoot: home,
    linked,
    migrated,
    migratedFromLocal,
    skillInstalled,
    academicSkillInstalled,
    hooksInstalled,
  };
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

/**
 * Copy repo/.centricmem → product home; fix sourceDir to absolute code path; remove local hub.
 */
export function migrateFromLocalHub(productHome: string, codeRoot: string): boolean {
  const local = path.join(codeRoot, LOCAL_MEM_DIR);
  if (!fs.existsSync(path.join(local, "workspace.json"))) return false;

  ensureDir(productHome);
  initProject(productHome, codeRoot);

  // Merge workspace.json projects
  const localWs = JSON.parse(fs.readFileSync(path.join(local, "workspace.json"), "utf8")) as {
    current?: string;
    projects?: Record<string, { path: string; linked_at: string; system?: boolean; sourceDir?: string }>;
  };
  const homeWs = loadWorkspace(productHome);
  for (const [slug, entry] of Object.entries(localWs.projects ?? {})) {
    const srcProj = path.join(local, "projects", slug);
    const destProj = path.join(productHome, "projects", slug);
    if (fs.existsSync(srcProj)) {
      copyDirRecursive(srcProj, destProj);
    }
    if (slug === "unclassified" && homeWs.projects[slug]?.system) continue;
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
  if (localWs.current) homeWs.current = localWs.current;
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

function installAcademicSkillToHome(productHome: string): boolean {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const skillSrc = path.resolve(here, "../skills/academic-db-agent/SKILL.md");
  if (!fs.existsSync(skillSrc)) return false;

  const destDir = path.join(skillsDir(productHome), "academic-db-agent");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(destDir, "SKILL.md"));
  return true;
}

function installSkillToHome(productHome: string): boolean {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const skillSrc = path.resolve(here, "../skills/centricmem-agent/SKILL.md");
  if (!fs.existsSync(skillSrc)) return false;

  const destDir = path.join(skillsDir(productHome), "centricmem-agent");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(destDir, "SKILL.md"));

  const integrationsSrc = path.resolve(here, "../skills/centricmem-agent/integrations");
  if (fs.existsSync(integrationsSrc)) {
    copyDirRecursive(integrationsSrc, path.join(destDir, "integrations"));
  }

  // User-level Cursor skill (Agent side — never written into git repos)
  const cursorSkills = path.join(os.homedir(), ".cursor", "skills", "centricmem-agent");
  fs.mkdirSync(cursorSkills, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(cursorSkills, "SKILL.md"));
  if (fs.existsSync(integrationsSrc)) {
    copyDirRecursive(integrationsSrc, path.join(cursorSkills, "integrations"));
  }

  return true;
}

/** Cursor-only convenience: copy lifecycle hooks to the code project's `.cursor/hooks/`. */
export function installCursorHooks(codeRoot: string): boolean {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const hooksFile = path.resolve(here, "../skills/centricmem-agent/integrations/cursor-hooks.json");
  if (!fs.existsSync(hooksFile)) return false;

  const destDir = path.join(codeRoot, ".cursor", "hooks");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(hooksFile, path.join(destDir, "hooks.json"));
  return true;
}

export function printDriveMcpHint(productHome: string): void {
  const projectsDir = path.join(productHome, "projects");
  console.log("\n--- Optional L2: Drive MCP (external replica sync) ---");
  console.log("Product home Markdown remains the source of truth. Drive MCP backs up project folders only.");
  console.log("Sync this directory (not a local search path):");
  console.log(`  ${projectsDir}`);
  console.log("\nExample Drive MCP server (merge into your agent's mcpServers):");
  console.log(JSON.stringify(
    {
      mcpServers: {
        "google-drive": {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-gdrive"],
        },
      },
    },
    null,
    2,
  ));
  console.log("\nConflict rule: local wins — never auto-merge decisions/. See SYNC.md.");
  console.log(
    "\nOptional legacy: `centricmem-mcp` wraps CLI tools for agents that prefer MCP; prefer Skill + CLI for local search/write.",
  );
  console.log(`See ${path.join(productHome, "skills", "centricmem-agent", "integrations")}`);
}

export function printSetupSummary(workspaceRoot: string): void {
  const projects = listProjects(workspaceRoot);
  console.log("\nCentricMem product home ready.");
  console.log(`  Home: ${workspaceRoot}`);
  console.log(`  Projects (${projects.length}):`);
  for (const p of projects) {
    console.log(`    ${p.current ? "*" : " "} ${p.slug}${p.entry.system ? " (system)" : ""}${p.entry.sourceDir ? ` → ${p.entry.sourceDir}` : ""}`);
  }
  console.log(`\nNext: read ${path.join(workspaceRoot, "skills", "centricmem-agent", "SKILL.md")}`);
}

export { isWorkspace };
