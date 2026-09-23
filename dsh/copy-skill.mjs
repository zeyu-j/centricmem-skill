#!/usr/bin/env node
/**
 * Copy skills/centricmem-agent into $DSH_HOME/skills/.
 * dsh-skill-filesystem never scans node_modules, so `dsh plugin add`
 * mounts MCP but leaves the Skill invisible until this runs.
 *
 * MIT — same as the rest of dsh/.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(pkgRoot, "skills", "centricmem-agent");
const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const dest = path.join(dshHome, "skills", "centricmem-agent");

if (!fs.existsSync(path.join(src, "SKILL.md"))) {
  console.error(`copy-skill: missing ${src}/SKILL.md`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (p) => {
    const rel = path.relative(src, p).replaceAll("\\", "/");
    if (!rel || rel === ".") return true;
    const top = rel.split("/")[0];
    return top === "SKILL.md" || top === "REFERENCE.md" || top === "agents";
  },
});
console.log(`copy-skill: ${dest}`);
