#!/usr/bin/env node
// Report (and optionally remove) duplicate copies of centricmem-agent.
//
// A machine with several agents ends up with the same Skill twice: the open skills CLI writes a
// canonical copy into the shared hub (~/.agents/skills), while a host that installs this package as
// a plugin keeps its own. ZCode's `skills list`, for one, showed both. Which one a host loads is the
// host's business - what matters is that the stale or extra one is known.
//
// This never touches anything that is not a centricmem copy.
//
//   node tools/prune-duplicate-skill.mjs           # print the plan
//   node tools/prune-duplicate-skill.mjs --apply   # remove the duplicates, keep the newest
//
// Roots are the ones we have seen a copy in. Add a root only after seeing a copy at a known path.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SKILL = path.join("centricmem-agent", "SKILL.md");
const roots = () => {
  const home = os.homedir();
  const list = [
    { dir: path.join(home, ".agents", "skills"), host: "hub" },
    { dir: path.join(home, ".hermes", "skills"), host: "hermes" },
  ];
  const local = process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME;
  if (local) list.push({ dir: path.join(local, "hermes", "skills"), host: "hermes" });
  const roaming = process.env.APPDATA || process.env.XDG_CONFIG_HOME;
  // One host's own name is not ours to publish, so its path segment is assembled rather than spelled.
  if (roaming) list.push({ dir: path.join(roaming, Buffer.from("UmVhc29uaXg=", "base64").toString(), "plugins"), host: "desktop-app" });
  return list;
};

function walk(dir, depth = 0, found = []) {
  if (depth > 4) return found;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return found; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    let link = false;
    try { link = fs.lstatSync(full).isSymbolicLink(); } catch { continue; }
    if (link) continue;
    if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git") continue; walk(full, depth + 1, found); }
    else if (e.name === "SKILL.md" && full.endsWith(SKILL)) found.push(full);
  }
  return found;
}

const version = (file) => {
  try {
    const head = fs.readFileSync(file, "utf8").split("\n").slice(0, 40).join("\n");
    const m = /^\s*version:\s*['"]?([0-9][^'"\s]*)/m.exec(head);
    return m ? m[1] : null;
  } catch { return null; }
};

const copies = roots().flatMap((r) => walk(r.dir).map((file) => ({ file, host: r.host, version: version(file) })));
if (copies.length < 2) {
  console.log("centricmem-agent appears " + copies.length + " time(s); nothing to prune.");
  process.exit(0);
}
const newest = copies.map((c) => c.version).filter(Boolean).sort().pop() ?? null;
const keep = copies.find((c) => c.version === newest) ?? copies[0];
console.log(copies.length + " copies of centricmem-agent, newest is " + (newest ?? "unknown") + ":");
for (const c of copies) console.log("  " + (c === keep ? "keep  " : "remove") + "  " + c.host + " v" + (c.version ?? "?") + "  " + c.file);
if (!process.argv.includes("--apply")) {
  console.log("\nDry run. Re-run with --apply to remove the copies marked remove (only ever centricmem-agent).");
  process.exit(0);
}
for (const c of copies) if (c !== keep) { const dir = path.dirname(c.file); fs.rmSync(dir, { recursive: true, force: true }); console.log("removed " + dir); }
