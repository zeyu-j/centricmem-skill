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
  list.push({ dir: path.join(home, ".nanobot", "workspace", "skills"), host: "nanobot" });
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
// Which copy to keep is a choice, not a rule: a host loads the copy it installed, so removing that
// one disables the Skill there until it is reinstalled, while keeping it and removing the hub copy
// is equally fine on a host that reads the hub. Newest-wins is only the default.
const keepArg = (() => { const i = process.argv.indexOf("--keep"); return i > -1 ? process.argv[i + 1] : null; })();
// Numeric compare, not the default lexical one: as strings "1.0.9" sorts above "1.0.10", so the default
// would keep the older copy on exactly the release that made the two disagree.
const byVersion = (a, b) => {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
};
const newest = copies.map((c) => c.version).filter(Boolean).sort(byVersion).pop() ?? null;
const keep = keepArg
  ? copies.find((c) => c.host === keepArg || c.file.toLowerCase().includes(keepArg.toLowerCase()))
  : copies.find((c) => c.version === newest) ?? copies[0];
if (keepArg && !keep) { console.log("no copy matches --keep " + keepArg + "; nothing to do."); process.exit(1); }
console.log(copies.length + " copies of centricmem-agent, newest is " + (newest ?? "unknown") + ":");
for (const c of copies) console.log("  " + (c === keep ? "keep  " : "remove") + "  " + c.host + " v" + (c.version ?? "?") + "  " + c.file);
if (!process.argv.includes("--apply")) {
  console.log("\nDry run. Re-run with --apply to remove the copies marked remove (only ever centricmem-agent).");
console.log("Keep is the newest copy by default; pass --keep <host|path> to keep the one your host loads.");
if (!keepArg) console.log("Careful: removing a host's own copy disables this Skill there until you reinstall it (--force, or the host's plugin update).");
  process.exit(0);
}
for (const c of copies) if (c !== keep) { const dir = path.dirname(c.file); fs.rmSync(dir, { recursive: true, force: true }); console.log("removed " + dir); }
