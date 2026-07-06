/**
 * setup.ts — guided workspace setup (Skill companion).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initProject } from "./memory.js";
import { buildIndexAll } from "./indexer.js";
import {
  linkProject,
  discoverLinkableDirs,
  discoverMigrateSources,
  listProjects,
} from "./workspace.js";
import { migrate } from "./migrate.js";

export interface SetupOptions {
  workspace?: string;
  linkAll?: boolean;
  migrateDiscover?: boolean;
  installSkill?: boolean;
  installHooks?: boolean;
  driveMcpHint?: boolean;
}

export interface SetupResult {
  workspaceRoot: string;
  linked: string[];
  migrated: number;
  skillInstalled: boolean;
  hooksInstalled: boolean;
}

export function runSetup(opts: SetupOptions = {}): SetupResult {
  const workspaceRoot = path.resolve(opts.workspace ?? process.cwd());
  initProject(workspaceRoot);

  const linked: string[] = [];
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

  let hooksInstalled = false;
  if (opts.installHooks) {
    hooksInstalled = installCursorHooks(workspaceRoot);
  }

  if (opts.driveMcpHint) {
    printDriveMcpHint(workspaceRoot);
  }

  buildIndexAll(workspaceRoot);

  return { workspaceRoot, linked, migrated, skillInstalled, hooksInstalled };
}

function installSkillToWorkspace(workspaceRoot: string): boolean {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const skillSrc = path.resolve(here, "../skills/centricmem-agent/SKILL.md");
  if (!fs.existsSync(skillSrc)) return false;

  const destDir = path.join(workspaceRoot, ".cursor", "skills", "centricmem-agent");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(destDir, "SKILL.md"));
  return true;
}

/** Install Cursor hooks for implicit memory (sessionStart / sessionEnd). */
export function installCursorHooks(workspaceRoot: string): boolean {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const hooksSrc = path.resolve(here, "../skills/centricmem-agent/hooks");
  if (!fs.existsSync(hooksSrc)) return false;

  const destDir = path.join(workspaceRoot, ".cursor", "hooks");
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of fs.readdirSync(hooksSrc)) {
    if (f.endsWith(".json") || f.endsWith(".sh") || f.endsWith(".mjs")) {
      fs.copyFileSync(path.join(hooksSrc, f), path.join(destDir, f));
    }
  }
  return true;
}

export function printDriveMcpHint(workspaceRoot: string): void {
  console.log("\n--- Optional: Drive MCP for memory sync ---");
  console.log("MCP is for external sync only (not local indexing).");
  console.log("Add a Drive MCP server to your agent config, then sync:");
  console.log(`  ${path.join(workspaceRoot, ".centricmem", "projects")}`);
  console.log("\nReasonix (~/.reasonix/config.json) example:");
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
  console.log("\nSet env: CENTRICMEM_WORKSPACE=" + workspaceRoot);
}

export function printSetupSummary(workspaceRoot: string): void {
  const projects = listProjects(workspaceRoot);
  console.log("\nCentricMem workspace ready.");
  console.log(`  Root: ${workspaceRoot}`);
  console.log(`  Projects (${projects.length}):`);
  for (const p of projects) {
    console.log(`    ${p.current ? "*" : " "} ${p.slug}${p.entry.system ? " (system)" : ""}`);
  }
  console.log("\nNext: read skills/centricmem-agent/SKILL.md or .cursor/skills/centricmem-agent/SKILL.md");
}
