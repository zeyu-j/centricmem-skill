/**
 * skill.ts — bundled vs installed Skill status (pull-based updates).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256 } from "./core.js";
import { parseYamlFrontmatter } from "./indexer.js";

export type SkillStatus = "ok" | "outdated" | "missing" | "modified" | "incompatible";

export interface SkillFileInfo {
  name: string | null;
  version: string | null;
  compatible_cli: string | null;
  changelog_url: string | null;
  path: string;
  body_hash: string;
}

export interface SkillStatusResult {
  name: string;
  cli_version: string;
  bundled: SkillFileInfo | null;
  installed: (SkillFileInfo & { modified: boolean }) | null;
  status: SkillStatus;
  changelog_url: string | null;
  hint?: string;
}

export function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function cliVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8")) as { version: string };
  return pkg.version;
}

export function bundledSkillPath(name: string): string {
  return path.join(packageRoot(), "skills", name, "SKILL.md");
}

/** Default path written by `setup --install-skill`. */
export function defaultInstalledSkillPath(workspaceRoot: string, name: string): string {
  return path.join(workspaceRoot, ".cursor", "skills", name, "SKILL.md");
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" ? v : v != null ? String(v) : null;
}

export function readSkillInfo(absPath: string): SkillFileInfo | null {
  if (!fs.existsSync(absPath)) return null;
  const raw = fs.readFileSync(absPath, "utf8");
  const { meta, body } = parseYamlFrontmatter(raw);
  return {
    name: metaString(meta, "name"),
    version: metaString(meta, "version"),
    compatible_cli: metaString(meta, "compatible_cli"),
    changelog_url: metaString(meta, "changelog_url"),
    path: absPath,
    body_hash: sha256(body.trim()),
  };
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

export function satisfiesCliRange(cliVer: string, range: string): boolean {
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(range.trim());
  if (!m) return true;
  const op = m[1] || "=";
  const want = m[2].trim();
  const cmp = compareSemver(cliVer, want);
  switch (op) {
    case ">=":
      return cmp >= 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case "<":
      return cmp < 0;
    case "=":
      return cmp === 0;
    default:
      return true;
  }
}

function displayPath(workspaceRoot: string, abs: string): string {
  const rel = path.relative(workspaceRoot, abs);
  if (rel && !rel.startsWith("..")) return rel.replace(/\\/g, "/");
  return abs.replace(/\\/g, "/");
}

export function skillStatus(
  workspaceRoot: string,
  opts?: { name?: string; installPath?: string },
): SkillStatusResult {
  const name = opts?.name ?? "centricmem-agent";
  const cli = cliVersion();
  const bundled = readSkillInfo(bundledSkillPath(name));
  const installedAbs = opts?.installPath
    ? path.resolve(opts.installPath)
    : defaultInstalledSkillPath(workspaceRoot, name);
  const installedRaw = readSkillInfo(installedAbs);

  const compatible = bundled?.compatible_cli ?? installedRaw?.compatible_cli;
  const changelog_url = bundled?.changelog_url ?? installedRaw?.changelog_url ?? null;

  let status: SkillStatus = "ok";
  let hint: string | undefined;
  let modified = false;

  if (compatible && !satisfiesCliRange(cli, compatible)) {
    status = "incompatible";
    hint = `Upgrade CLI: npm update -g centricmem (need ${compatible}, have ${cli})`;
  } else if (!installedRaw) {
    status = "missing";
    hint = "centricmem setup --install-skill";
  } else if (!bundled) {
    status = "ok";
  } else if (!installedRaw.version || !bundled.version) {
    if (installedRaw.body_hash !== bundled.body_hash) {
      status = "modified";
      modified = true;
      hint = "Installed Skill differs from bundled (no version in frontmatter). Re-install with user confirmation.";
    }
  } else {
    const verCmp = compareSemver(bundled.version, installedRaw.version);
    if (verCmp > 0) {
      status = "outdated";
      hint = `centricmem setup --install-skill (${installedRaw.version} → ${bundled.version})`;
    } else if (verCmp === 0 && installedRaw.body_hash !== bundled.body_hash) {
      status = "modified";
      modified = true;
      hint = "Installed Skill was edited locally. Re-install only with user confirmation.";
    }
  }

  return {
    name,
    cli_version: cli,
    bundled: bundled
      ? { ...bundled, path: `skills/${name}/SKILL.md` }
      : null,
    installed: installedRaw
      ? { ...installedRaw, path: displayPath(workspaceRoot, installedAbs), modified }
      : null,
    status,
    changelog_url,
    hint,
  };
}

export function formatSkillStatusText(r: SkillStatusResult): string {
  const lines = [
    `  skill:     ${r.name}`,
    `  cli:       ${r.cli_version}`,
    `  bundled:   ${r.bundled?.version ?? "(none)"}  (${r.bundled?.path ?? "—"})`,
    `  installed: ${r.installed ? r.installed.version ?? "(no version)" : "(missing)"}  (${r.installed?.path ?? "—"})`,
    `  status:    ${r.status}`,
  ];
  if (r.hint) lines.push("", `  → ${r.hint}`);
  if (r.changelog_url) lines.push(`  → ${r.changelog_url}`);
  return lines.join("\n");
}

export function skillStatusHintLine(r: SkillStatusResult): string | null {
  if (r.status === "ok") return null;
  if (r.status === "outdated" && r.bundled?.version && r.installed?.version) {
    return `Skill: ${r.name} outdated (${r.installed.version} → ${r.bundled.version}). Run: centricmem setup --install-skill`;
  }
  if (r.status === "missing") {
    return `Skill: ${r.name} not installed. Run: centricmem setup --install-skill`;
  }
  if (r.status === "incompatible") {
    return `Skill: ${r.name} needs newer CLI (${r.bundled?.compatible_cli ?? r.installed?.compatible_cli ?? "?"}). Run: npm update -g centricmem`;
  }
  if (r.status === "modified") {
    return `Skill: ${r.name} modified locally (version ${r.installed?.version ?? "?"}).`;
  }
  return r.hint ?? null;
}
