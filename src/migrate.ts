/**
 * migrate.ts — one-way importers → ImportBundle → importBundle().
 */
import fs from "node:fs";
import path from "node:path";
import { slugify } from "./core.js";
import { importBundle, type ImportResult, type ImportBundle } from "./import.js";
import { UNCLASSIFIED, discoverMigrateSources } from "./workspace.js";

export interface MigrateResult {
  from: string;
  imported: string[];
  sources: string[];
}

function parseFrontmatter(content: string): [Record<string, string>, string] {
  const meta: Record<string, string> = {};
  if (!content.startsWith("---")) return [meta, content];
  const end = content.indexOf("\n---", 3);
  if (end === -1) return [meta, content];
  const header = content.slice(3, end).trim();
  for (const line of header.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return [meta, content.slice(end + 4).replace(/^\n/, "")];
}

function listFiles(p: string, exts: string[]): string[] {
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(abs);
    }
  };
  walk(p);
  return out.sort();
}

function stripH1(content: string): string {
  return content.split("\n").filter((l) => !l.startsWith("# ")).join("\n");
}

function splitSections(content: string): { title: string; body: string }[] {
  const lines = content.split("\n");
  const sections: { title: string; body: string }[] = [];
  let title = "";
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (title && body) sections.push({ title, body });
    buf = [];
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      title = line.slice(3).trim();
    } else if (title) {
      buf.push(line);
    }
  }
  flush();
  if (!sections.length) {
    const h1 = lines.find((l) => l.startsWith("# "));
    const t = h1 ? h1.slice(2).trim() : "Imported decisions";
    const body = stripH1(content).trim();
    if (body) sections.push({ title: t, body });
  }
  return sections;
}

function bundleFromCursorRules(workspaceRoot: string, srcPath: string): ImportBundle {
  const files = listFiles(srcPath, [".mdc", ".md", ".cursorrules"]).filter(
    (f) => !f.includes(".centricmem"),
  );
  if (!files.length && fs.statSync(srcPath).isFile()) files.push(srcPath);

  const rules: ImportBundle["rules"] = [];
  const sources: string[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8");
    const [meta, body] = parseFrontmatter(raw);
    const rel = path.relative(workspaceRoot, f);
    let title = meta.description || path.basename(f).replace(/\.(mdc|md|cursorrules)$/, "");
    if (path.basename(f) === ".cursorrules") title = "Cursor Rules";
    let block = body;
    if (meta.globs) block = `**Applies to**: \`${meta.globs}\`\n\n${body}`;
    rules!.push({ title, body: block });
    sources.push(rel);
  }
  return {
    version: 1,
    project: UNCLASSIFIED,
    source: { type: "cursor-rules", name: srcPath },
    rules,
  };
}

function bundleFromMemoryBank(workspaceRoot: string, srcPath: string): ImportBundle {
  const bundle: ImportBundle = {
    version: 1,
    project: UNCLASSIFIED,
    source: { type: "memory-bank", name: srcPath },
    decisions: [],
    rules: [],
    imported: [],
  };
  for (const f of listFiles(srcPath, [".md"])) {
    const base = path.basename(f).toLowerCase();
    const raw = fs.readFileSync(f, "utf8");
    const rel = path.relative(workspaceRoot, f);

    if (base.includes("projectbrief") || base.includes("brief")) {
      bundle.rules!.push({ title: "Project Brief", body: raw });
    } else if (base.includes("activecontext") || base.includes("active_context")) {
      bundle.context = { body: stripH1(raw).trim() };
    } else if (base.includes("progress")) {
      bundle.sessions = bundle.sessions ?? [];
      bundle.sessions.push({
        title: "Imported Progress",
        body: stripH1(raw),
        external_id: rel,
      });
    } else if (base.includes("decisionlog") || base.includes("decisions")) {
      for (const section of splitSections(raw)) {
        bundle.decisions!.push({
          title: section.title,
          context: `Imported from \`${rel}\`.`,
          decision: section.body,
          agent: "migration",
          external_id: `${rel}:${slugify(section.title)}`,
        });
      }
    } else {
      bundle.imported!.push({
        title: path.basename(f, ".md"),
        body: raw,
        external_id: rel,
      });
    }
  }
  return bundle;
}

function bundleFromMarkdown(workspaceRoot: string, srcPath: string): ImportBundle {
  const imported: ImportBundle["imported"] = [];
  for (const f of listFiles(srcPath, [".md"])) {
    const raw = fs.readFileSync(f, "utf8");
    imported!.push({
      title: path.basename(f, ".md"),
      body: raw,
      external_id: path.relative(workspaceRoot, f),
    });
  }
  return {
    version: 1,
    project: UNCLASSIFIED,
    source: { type: "markdown", name: srcPath },
    imported,
  };
}

function resultFromImport(from: string, sources: string[], ir: ImportResult): MigrateResult {
  const imported: string[] = [];
  if (ir.decisions) imported.push(`${ir.decisions} decision(s) → projects/${ir.project}/`);
  if (ir.lessons) imported.push(`${ir.lessons} lesson(s)`);
  if (ir.rules) imported.push(`${ir.rules} rule(s) → AGENTS.md`);
  if (ir.imported) imported.push(`${ir.imported} imported doc(s)`);
  return { from, sources, imported };
}

export function migrate(workspaceRoot: string, from: string, srcPath: string, project?: string): MigrateResult {
  const abs = path.resolve(workspaceRoot, srcPath);
  if (!fs.existsSync(abs)) throw new Error(`Source path not found: ${abs}`);

  let bundle: ImportBundle;
  const sources: string[] = [];
  switch (from) {
    case "cursor-rules": {
      bundle = bundleFromCursorRules(workspaceRoot, abs);
      sources.push(...listFiles(abs, [".mdc", ".md", ".cursorrules"]).map((f) => path.relative(workspaceRoot, f)));
      break;
    }
    case "memory-bank": {
      bundle = bundleFromMemoryBank(workspaceRoot, abs);
      sources.push(...listFiles(abs, [".md"]).map((f) => path.relative(workspaceRoot, f)));
      break;
    }
    case "markdown": {
      bundle = bundleFromMarkdown(workspaceRoot, abs);
      sources.push(...listFiles(abs, [".md"]).map((f) => path.relative(workspaceRoot, f)));
      break;
    }
    default:
      throw new Error(`Unknown migration source: ${from} (expected cursor-rules|memory-bank|markdown)`);
  }
  if (project) bundle.project = project;
  const ir = importBundle(workspaceRoot, bundle);
  return resultFromImport(from, sources, ir);
}

export function migrateDiscover(workspaceRoot: string): MigrateResult[] {
  const found = discoverMigrateSources(workspaceRoot);
  return found.map((s) => migrate(workspaceRoot, s.type, s.path));
}
