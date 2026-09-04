/**
 * indexer.ts — SQLite FTS5 index over .centricmem/ Markdown files.
 *
 * Design:
 * - Memory-aware chunking: decision files are one chunk each; other .md files
 *   are split by `##` headings (falling back to whole file).
 * - Incremental indexing: per-file content SHA256 stored in `files`; unchanged
 *   files are skipped, changed files have their chunks replaced.
 * - Temporal-aware ranking: score = relevance × time_decay × status × validity × ref × intent × domain × feedback × keyBoost
 * - --semantic: dual-list RRF (BM25 ranks ∪ vector ranks), then same multipliers
 * - DB connection: CLI opens/closes per command; MCP server reuses a single
 *   connection via getDb() for the process lifetime.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { sha256, ensureDir, loadConfig, resolvePaths } from "./core.js";
import { getCurrentProjectSlug, loadWorkspace } from "./workspace.js";
import { embedTexts, isEmbeddingEnabled, vectorToBlob, blobToVector, cosineSimilarity, } from "./embedding.js";
/** User-facing hint before a potentially slow index pass. */
export function logIndexStart(scope) {
    console.log(`\nIndexing ${scope} — building the search index. First run or large imports may take a minute or more; please wait…`);
}
export function logIndexDone(stats) {
    const emb = stats.embedded ? `, ${stats.embedded} embedded` : "";
    const removed = stats.removed ? `, ${stats.removed} removed` : "";
    console.log(`Index complete: ${stats.scanned} file(s) scanned, ${stats.indexed} updated${removed}, ${stats.chunks} chunk(s)${emb}.`);
}
// ---------------------------------------------------------------------------
// YAML frontmatter (corpus metadata)
// ---------------------------------------------------------------------------
const HOT_COLUMN_SQL = {
    civilization: "meta_civilization",
    type: "meta_type",
    has_incantation: "meta_has_incantation",
};
/** Parse a minimal YAML block (scalars, booleans, inline lists, block lists). */
function parseSimpleYaml(yaml) {
    const meta = {};
    let listKey = null;
    for (const rawLine of yaml.split("\n")) {
        const listItem = listKey ? /^[ \t]*-\s+(.+)$/.exec(rawLine) : null;
        if (listItem) {
            const arr = Array.isArray(meta[listKey]) ? [...meta[listKey]] : [];
            arr.push(listItem[1].trim().replace(/^['"]|['"]$/g, ""));
            meta[listKey] = arr;
            continue;
        }
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            listKey = null;
            continue;
        }
        const m = /^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/.exec(trimmed);
        if (!m) {
            listKey = null;
            continue;
        }
        const key = m[1];
        const val = m[2].trim();
        if (!val) {
            listKey = key;
            meta[key] = [];
            continue;
        }
        listKey = null;
        if (val.startsWith("[") && val.endsWith("]")) {
            meta[key] = val
                .slice(1, -1)
                .split(",")
                .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
                .filter(Boolean);
        }
        else if (val === "true" || val === "false") {
            meta[key] = val === "true";
        }
        else {
            meta[key] = val.replace(/^['"]|['"]$/g, "");
        }
    }
    return meta;
}
/** Split leading `---` YAML frontmatter from markdown body. */
export function parseYamlFrontmatter(content) {
    if (!content.startsWith("---"))
        return { meta: {}, body: content };
    const end = content.indexOf("\n---", 3);
    if (end === -1)
        return { meta: {}, body: content };
    const yamlBlock = content.slice(3, end).trim();
    const body = content.slice(end + 4).replace(/^\n/, "");
    return { meta: parseSimpleYaml(yamlBlock), body };
}
function hotColumnValues(meta, hotCols) {
    let civilization = null;
    let type = null;
    let has_incantation = null;
    if (hotCols.includes("civilization") && typeof meta.civilization === "string")
        civilization = meta.civilization;
    if (hotCols.includes("type") && typeof meta.type === "string")
        type = meta.type;
    if (hotCols.includes("has_incantation")) {
        const v = meta.has_incantation;
        if (v === true || v === "true" || v === 1 || v === "1")
            has_incantation = 1;
        else if (v === false || v === "false" || v === 0 || v === "0")
            has_incantation = 0;
    }
    return { civilization, type, has_incantation };
}
function domainBoostForFile(file, query, config) {
    const dims = config.domain_boost?.dimensions;
    if (!dims)
        return 1;
    const q = query.toLowerCase();
    const normFile = normalizeRelPath(file);
    const defaultBoost = config.domain_boost?.default_boost ?? 1.5;
    let boost = 1;
    for (const dim of Object.values(dims)) {
        const prefix = dim.path_prefix.replace(/\\/g, "/");
        const hit = dim.keywords.some((kw) => q.includes(kw.toLowerCase()));
        if (hit && normFile.startsWith(prefix))
            boost = Math.max(boost, dim.boost ?? defaultBoost);
    }
    return boost;
}
/** Prefer recipe/reference cards over dump catalogs in BM25 ranking. */
export function pathRetrievalBoost(file) {
    const n = normalizeRelPath(file);
    const base = path.posix.basename(n).toLowerCase();
    if (base === "_index.md" || base === "_catalog.md" || base === "_readme.md" || base === "_manifest.md") {
        return 0.45;
    }
    if (n.includes("/corpus/references/") || n.includes("/corpus/recipes/"))
        return 1.35;
    if (n.includes("/corpus/rituals/"))
        return 1.2;
    if (n.includes("/corpus/works/"))
        return 0.55;
    return 1;
}
/** Extra boost/penalty from corpus work-unification fields (`work`, `card_role`). */
export function corpusRetrievalBoost(meta) {
    const role = scalarMetaString(meta, "card_role")?.toLowerCase();
    if (role === "superseded" || role === "stub")
        return 0.35;
    if (role === "volume" || role === "canonical")
        return 1.45;
    if (role === "chapter")
        return 1.05;
    if (role === "slice")
        return 0.85;
    return 1;
}
export function workIdFromMeta(meta) {
    return scalarMetaString(meta, "work");
}
/**
 * One ranked hit per bibliographic `work` id. Parallel ingest paths (dump volume +
 * chapter cards + recipe cards) share a work id; search surfaces the best match and
 * reports how many sibling cards were collapsed.
 */
export function dedupeSearchByWork(results) {
    const workGroups = new Map();
    const noWork = [];
    for (const r of results) {
        if (!r.work) {
            noWork.push(r);
            continue;
        }
        const g = workGroups.get(r.work) ?? [];
        g.push(r);
        workGroups.set(r.work, g);
    }
    const deduped = [...noWork];
    for (const [work, hits] of workGroups) {
        hits.sort((a, b) => b.score - a.score);
        const best = { ...hits[0], work };
        if (hits.length > 1)
            best.workSiblings = hits.length - 1;
        deduped.push(best);
    }
    deduped.sort((a, b) => b.score - a.score);
    return deduped;
}
function metaFilterSql(key, value, hotEnabled, hotCols) {
    const hotCol = hotEnabled && hotCols.includes(key) ? HOT_COLUMN_SQL[key] : undefined;
    if (hotCol === "meta_has_incantation") {
        const n = value === "true" || value === "1" ? 1 : 0;
        return { sql: `c.${hotCol} = ?`, param: n };
    }
    if (hotCol)
        return { sql: `c.${hotCol} = ?`, param: value };
    if (value === "true" || value === "false") {
        return { sql: `json_extract(cm.meta_json, '$.${key}') = ?`, param: value === "true" ? 1 : 0 };
    }
    return { sql: `json_extract(cm.meta_json, '$.${key}') = ?`, param: value };
}
// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------
/** Parse `- **Tags**: a, b` from a markdown chunk. */
export function parseTagsLine(content) {
    const m = content.match(/^- \*\*Tags\*\*:\s*(.+)$/m);
    if (!m)
        return [];
    return m[1].split(",").map((t) => t.trim()).filter(Boolean);
}
const SKIP_FOLK_TAGS = new Set(["none", "null", "undefined", "nan"]);
/** Turn a YAML scalar into one or more retrieval tags (civilization aliases, split types). */
export function slugFolksonomyTag(raw) {
    const s = raw.trim();
    if (!s)
        return [];
    const lower = s.toLowerCase();
    if (SKIP_FOLK_TAGS.has(lower))
        return [];
    if (lower === "babylonia")
        return ["babylonian"];
    if (/[/+&]/.test(s) || /\band\b/i.test(s)) {
        const parts = s.split(/[/+&]|\band\b/i).map((p) => p.trim()).filter(Boolean);
        if (parts.length > 1)
            return parts.flatMap(slugFolksonomyTag);
    }
    if (/[\u4e00-\u9fff]/.test(s) && !/[A-Za-z]/.test(s))
        return [s];
    const slug = s
        .replace(/\+/g, "-")
        .replace(/[/_]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
    if (!slug || SKIP_FOLK_TAGS.has(slug))
        return [];
    const extra = [slug];
    if (slug.includes("babylon"))
        extra.push("babylonian");
    if (slug.includes("assyria"))
        extra.push("neo-assyrian", "mesopotamian");
    if (slug === "early-chinese")
        extra.push("chinese");
    if (slug === "reference-entry" || slug === "text-edition")
        extra.push("reference");
    if (slug === "incantation-ritual")
        extra.push("incantation", "ritual");
    return extra;
}
function listMetaStrings(meta, key) {
    const v = meta[key];
    if (typeof v === "string")
        return [v];
    if (Array.isArray(v))
        return v.filter((x) => typeof x === "string" && x.trim().length > 0);
    return [];
}
/**
 * Folksonomy for corpus cards: YAML `tags` plus structured fields and path
 * (recipe / ritual / bam10 / civilization). Lets `--tag head` hit `body_parts`.
 */
export function folksonomyFromCorpusMeta(meta, file = "") {
    const seen = new Set();
    const out = [];
    const add = (raw) => {
        for (const t of slugFolksonomyTag(raw)) {
            const n = normalizeKey(t);
            if (!n || seen.has(n))
                continue;
            seen.add(n);
            out.push(t);
        }
    };
    if (meta) {
        for (const v of listMetaStrings(meta, "tags")) {
            const n = normalizeKey(v);
            if (n && !seen.has(n)) {
                seen.add(n);
                out.push(v.trim());
            }
            for (const t of slugFolksonomyTag(v)) {
                const tn = normalizeKey(t);
                if (!tn || seen.has(tn))
                    continue;
                seen.add(tn);
                out.push(t);
            }
        }
        for (const key of ["body_parts", "methods", "drug_categories"]) {
            for (const v of listMetaStrings(meta, key))
                add(v);
        }
        for (const key of ["card_role", "type", "subtype", "civilization"]) {
            const v = meta[key];
            if (typeof v === "string")
                add(v);
        }
    }
    const pathNorm = file.replace(/\\/g, "/").toLowerCase();
    const pathTags = [
        ["bam10", "bam10"],
        ["bam-10", "bam10"],
        ["bam7", "bam7"],
        ["bam9", "bam9"],
        ["bam12", "bam12"],
        ["bam13", "bam13"],
        ["wuwei", "wuwei"],
        ["mawangdui", "mawangdui"],
        ["tianhui", "tianhui"],
        ["zhoujiatai", "zhoujiatai"],
        ["sakikku", "sakikku"],
        ["cmawr", "cmawr"],
        ["/recipes/", "recipe"],
        ["/rituals/", "ritual"],
        ["/references/", "reference"],
        ["/cases/", "case"],
    ];
    for (const [needle, tag] of pathTags) {
        if (pathNorm.includes(needle))
            add(tag);
    }
    return out;
}
/** Parse `- **Attach**: imported/foo` from a markdown chunk. */
export function parseAttachLine(content) {
    const m = content.match(/^- \*\*Attach\*\*:\s*`?([^\n`]+)`?\s*$/m);
    const v = m?.[1]?.trim();
    return v || undefined;
}
function mergeChunkMeta(base, content, file = "") {
    const lineTags = parseTagsLine(content);
    const attach = parseAttachLine(content);
    const mergedBase = { ...(base ?? {}) };
    if (lineTags.length)
        mergedBase.tags = lineTags;
    const folk = folksonomyFromCorpusMeta(mergedBase, file);
    if (!folk.length && !attach && !Object.keys(mergedBase).length)
        return undefined;
    const out = { ...mergedBase };
    if (folk.length)
        out.tags = folk;
    if (attach)
        out.attach = attach;
    return Object.keys(out).length ? out : undefined;
}
function classifyDocType(relPath) {
    if (relPath.startsWith("decisions/") || relPath.startsWith("decisions\\"))
        return "decision";
    if (relPath === "active_context.md")
        return "context";
    if (relPath === "AGENTS.md")
        return "rules";
    if (relPath === "lessons.md")
        return "lessons";
    if (relPath.startsWith("sessions/") || relPath.startsWith("sessions\\"))
        return "session";
    if (relPath.startsWith("imported/"))
        return "imported";
    return "other";
}
function extractMeta(content) {
    const meta = {};
    const st = /\*\*Status\*\*:\s*(Superseded|Deprecated|Historical)/i.exec(content);
    if (st)
        meta.status = st[1].toLowerCase();
    const sb = /\*\*Superseded by\*\*:\s*#?(\d+)/.exec(content);
    if (sb)
        meta.supersededBy = sb[1];
    const at = /\*\*Logged at\*\*:\s*(\S+)/.exec(content) ||
        /updated_at=(\S+?)(?:\s|-->)/.exec(content) ||
        /imported_at=(\S+?)(?:\s|-->)/.exec(content);
    if (at)
        meta.loggedAt = at[1];
    const by = /\*\*Logged by\*\*:\s*(\S+)/.exec(content) ||
        /updated_by=(\S+?)(?:\s|-->)/.exec(content) ||
        /logged_by=(\S+?)(?:\s|-->)/.exec(content);
    if (by)
        meta.agent = by[1];
    const vf = /\*\*Valid from\*\*:\s*(\S+)/i.exec(content) ||
        /valid_from[=:\s]+(\S+)/i.exec(content);
    if (vf)
        meta.validFrom = vf[1].replace(/[",]/g, "");
    const vu = /\*\*Valid until\*\*:\s*(\S+)/i.exec(content) ||
        /valid_until[=:\s]+(\S+)/i.exec(content);
    if (vu)
        meta.validUntil = vu[1].replace(/[",]/g, "");
    return meta;
}
function scalarMetaString(meta, key) {
    if (!meta)
        return undefined;
    const v = meta[key] ?? meta[key.replace(/_/g, "")];
    if (typeof v === "string" && v.trim())
        return v.trim();
    return undefined;
}
/** Soft penalty when outside validity window (1 = ok, ~0.05 = outside). */
export function validityPenalty(validFrom, validUntil, nowMs = Date.now()) {
    if (validFrom) {
        const t = Date.parse(validFrom);
        if (!Number.isNaN(t) && nowMs < t)
            return 0.05;
    }
    if (validUntil) {
        const t = Date.parse(validUntil);
        if (!Number.isNaN(t) && nowMs > t)
            return 0.05;
    }
    return 1;
}
const HISTORY_QUERY = /上个月|去年|当时|以前|曾经|那时|历史|last\s+month|last\s+year|previously|at\s+the\s+time|what\s+was|used\s+to|historical|back\s+then/i;
export function isHistoricalQuery(query) {
    return HISTORY_QUERY.test(query);
}
function statusPenaltyFor(status, historicalQuery) {
    if (status === "active")
        return 1;
    return historicalQuery ? 0.5 : 0.1;
}
/** Split a markdown body by `##` headings, keeping the preamble as its own chunk. */
function splitByHeadings(content) {
    const lines = content.split("\n");
    const chunks = [];
    let heading = "";
    let buf = [];
    let inFence = false;
    const h1 = lines.find((l) => l.startsWith("# "));
    if (h1)
        heading = h1.slice(2).trim();
    const flush = () => {
        const body = buf.join("\n").trim();
        if (body)
            chunks.push({ heading, body });
        buf = [];
    };
    for (const line of lines) {
        if (line.trim().startsWith("```"))
            inFence = !inFence;
        if (!inFence && line.startsWith("## ")) {
            flush();
            heading = line.slice(3).trim();
        }
        buf.push(line);
    }
    flush();
    return chunks.length ? chunks : [{ heading, body: content.trim() }];
}
export function chunkFile(memDir, relPath) {
    const abs = path.join(memDir, relPath);
    const raw = fs.readFileSync(abs, "utf8");
    const { meta: fmMeta, body } = parseYamlFrontmatter(raw);
    const content = Object.keys(fmMeta).length ? body : raw;
    const docType = classifyDocType(relPath);
    const metaExtract = extractMeta(content);
    const mtime = fs.statSync(abs).mtime.toISOString();
    const loggedAt = metaExtract.loggedAt || mtime;
    const agent = metaExtract.agent || "unknown";
    const status = metaExtract.status || "active";
    const supersededBy = metaExtract.supersededBy || "";
    const validFrom = scalarMetaString(fmMeta, "valid_from") ||
        scalarMetaString(fmMeta, "validFrom") ||
        metaExtract.validFrom;
    const validUntil = scalarMetaString(fmMeta, "valid_until") ||
        scalarMetaString(fmMeta, "validUntil") ||
        metaExtract.validUntil;
    const meta = (() => {
        const base = Object.keys(fmMeta).length ? { ...fmMeta } : {};
        if (validFrom)
            base.valid_from = validFrom;
        if (validUntil)
            base.valid_until = validUntil;
        return Object.keys(base).length ? base : undefined;
    })();
    if (docType === "decision") {
        const h1 = content.split("\n").find((l) => l.startsWith("# "));
        // Strip the H1 and metadata bullet lines from the indexed body so FTS5
        // snippets start at the real content (Context/Decision) instead of
        // "- **Status**: Accepted - **Logged at**: …". Metadata stays searchable
        // via the heading and structured columns.
        const bodyText = content
            .split("\n")
            .filter((l) => !l.startsWith("# ") && !/^- \*\*(Status|Logged at|Logged by|Tags|Attach|Supersedes|Superseded by|Valid from|Valid until)\*\*:/.test(l))
            .join("\n")
            .trim();
        // Append tags as hidden searchable text so FTS5 can match tag words
        // even when the decision body doesn't contain them explicitly.
        const folk = folksonomyFromCorpusMeta(mergeChunkMeta(meta, content, relPath), relPath);
        const tagsText = folk.length ? "\ntags: " + folk.join(" ") : "";
        return [{
                file: relPath,
                heading: h1 ? h1.slice(2).trim() : relPath,
                content: (bodyText || content) + tagsText,
                docType,
                loggedAt,
                agent,
                status,
                supersededBy,
                validFrom,
                validUntil,
                meta: mergeChunkMeta(meta, content, relPath),
            }];
    }
    const sections = splitByHeadings(content).filter((c) => !/^opening\s*\(ocr\)/i.test(c.heading));
    return (sections.length ? sections : splitByHeadings(content)).map((c) => {
        // Per-chunk agent attribution: imported rule blocks carry their own
        // provenance line, e.g. "> Source: `...` (imported <ISO> by migration)".
        const imp = /\(imported\s+(\S+?)\s+by\s+([\w-]+)\)/.exec(c.body);
        const inheritFileMeta = docType === "imported";
        const fileAttach = inheritFileMeta ? parseAttachLine(content) : undefined;
        const fileTags = inheritFileMeta ? parseTagsLine(content) : [];
        const baseMeta = (() => {
            const extra = { ...(meta ?? {}) };
            if (fileAttach)
                extra.attach = fileAttach;
            if (fileTags.length)
                extra.tags = fileTags;
            return Object.keys(extra).length ? extra : undefined;
        })();
        const folk = folksonomyFromCorpusMeta(mergeChunkMeta(baseMeta, c.body, relPath), relPath);
        const tagsText = folk.length ? "\ntags: " + folk.join(" ") : "";
        const idVal = scalarMetaString(fmMeta, "id");
        const idText = idVal ? "\nid: " + idVal : "";
        return {
            file: relPath,
            heading: c.heading,
            content: c.body + tagsText + idText,
            docType,
            loggedAt: imp?.[1] ?? loggedAt,
            agent: imp?.[2] ?? agent,
            status,
            supersededBy,
            validFrom,
            validUntil,
            meta: mergeChunkMeta(baseMeta, c.body, relPath),
        };
    });
}
/** Normalize a decision sequence number to its canonical node id. */
export function decisionId(seq) {
    return `decision:${String(seq).padStart(4, "0")}`;
}
/** Extract seq from a decisions/NNNN-slug.md path, or null. */
export function seqFromDecisionPath(relPath) {
    const m = /^decisions[\\/](\d{4})-/.exec(relPath);
    return m ? parseInt(m[1], 10) : null;
}
/** Bare tokens that must not become type/project filters — FTS only. */
export const GENERIC_BARE_TOKENS = new Set([
    "work", "ops", "decision", "research", "lesson", "lessons", "rule", "rules",
    "session", "imported", "context",
]);
export function normalizeKey(key) {
    const t = key.trim();
    if (!t)
        return "";
    return /[A-Za-z]/.test(t) ? t.toLowerCase() : t;
}
function padDecisionId(raw) {
    if (/^\d{1,4}$/.test(raw))
        return raw.padStart(4, "0");
    return raw;
}
function keysForChunk(c, projectSlug) {
    const seen = new Set();
    const out = [];
    const add = (kind, key) => {
        const k = key.trim();
        if (!k)
            return;
        const keyNorm = normalizeKey(k);
        const id = `${kind}|${keyNorm}`;
        if (seen.has(id))
            return;
        seen.add(id);
        out.push({ kind, key: k, keyNorm });
    };
    add("project", projectSlug);
    add("type", c.docType);
    if (c.docType === "lessons")
        add("type", "lesson");
    if (c.docType === "rules")
        add("type", "rule");
    add("status", c.status);
    if (c.agent && c.agent !== "unknown")
        add("agent", c.agent);
    const metaTags = folksonomyFromCorpusMeta(c.meta, c.file);
    for (const t of metaTags.length ? metaTags : parseTagsLine(c.content))
        add("tag", t);
    const seq = seqFromDecisionPath(c.file);
    if (seq !== null) {
        const pad = String(seq).padStart(4, "0");
        add("id", pad);
        add("id", String(seq));
        add("id", `decision:${pad}`);
        add("id", `cm:${projectSlug}:decision:${pad}`);
    }
    const yamlId = c.meta ? scalarMetaString(c.meta, "id") : undefined;
    if (yamlId)
        add("id", yamlId);
    return out;
}
/** Split a search string into FTS remainder + addressing prefixes. */
export function parseAddressQuery(query) {
    const projectScopes = [];
    const andTokens = [];
    const boostTokens = [];
    const ftsParts = [];
    let type;
    let status;
    let agent;
    for (const raw of query.trim().split(/\s+/).filter(Boolean)) {
        const hash = /^#(\d{1,4})$/.exec(raw);
        if (hash) {
            andTokens.push(padDecisionId(hash[1]));
            continue;
        }
        const pref = /^(project|type|status|id|tag|agent):(.+)$/i.exec(raw);
        if (pref) {
            const kind = pref[1].toLowerCase();
            const val = pref[2].trim();
            if (!val)
                continue;
            if (kind === "project")
                projectScopes.push(val);
            else if (kind === "type")
                type = val;
            else if (kind === "status")
                status = val;
            else if (kind === "agent")
                agent = val;
            else if (kind === "id")
                andTokens.push(padDecisionId(val));
            else
                andTokens.push(val);
            continue;
        }
        const cm = /^cm:[^:]+:[^:]+:.+$/i.exec(raw);
        if (cm) {
            andTokens.push(raw);
            const last = raw.split(":").pop() ?? "";
            if (/^\d{1,4}$/.test(last))
                andTokens.push(padDecisionId(last));
            continue;
        }
        ftsParts.push(raw);
        if (!GENERIC_BARE_TOKENS.has(raw.toLowerCase()))
            boostTokens.push(raw);
    }
    return {
        ftsQuery: ftsParts.join(" "),
        type,
        status,
        agent,
        projectScopes,
        andTokens,
        boostTokens,
    };
}
/** Which project indexes to query. `project:slug` jumps scope; `-p` ANDs with prefixes. */
export function resolveSearchSlugs(workspaceRoot, parsed, opts) {
    const ws = loadWorkspace(workspaceRoot);
    const known = Object.keys(ws.projects);
    const prefixed = parsed.projectScopes.filter((s) => known.includes(s));
    if (parsed.projectScopes.length && !prefixed.length)
        return [];
    if (opts?.all && !prefixed.length)
        return known;
    if (prefixed.length && opts?.project)
        return prefixed.filter((s) => s === opts.project);
    if (prefixed.length)
        return [...new Set(prefixed)];
    if (opts?.all)
        return known;
    if (opts?.project)
        return [opts.project];
    return [getCurrentProjectSlug(workspaceRoot)];
}
const KEY_BOOST = {
    id: 0.25,
    tag: 0.18,
    agent: 0.08,
    type: 0.06,
    status: 0.04,
    project: 0.04,
};
function keyBoostFromKinds(kinds) {
    let extra = 0;
    const seen = new Set();
    for (const k of kinds) {
        if (seen.has(k))
            continue;
        seen.add(k);
        extra += KEY_BOOST[k] ?? 0;
    }
    return 1 + extra;
}
/**
 * Extract typed links from a decision file:
 * - `**Supersedes**: #NNNN`        → rel=supersedes
 * - `- **Refs**: #NNNN, #NNNN`     → rel=refs (explicit curation)
 * - inline `#NNNN` in the body     → rel=mentions (automatic, zero effort)
 * Self-references and duplicate (rel, target) pairs are dropped; an explicit
 * ref suppresses the weaker mentions edge for the same target.
 */
export function extractDecisionLinks(relPath, content) {
    const selfSeq = seqFromDecisionPath(relPath);
    const from = normalizeRelPath(relPath);
    const links = new Map();
    const add = (rel, seq) => {
        if (selfSeq !== null && seq === selfSeq)
            return;
        const toId = decisionId(seq);
        links.set(`${rel}|${toId}`, { fromFile: from, rel, toId });
    };
    const supersedes = /^- \*\*Supersedes\*\*:\s*#?(\d+)/m.exec(content);
    if (supersedes)
        add("supersedes", parseInt(supersedes[1], 10));
    const refsLine = /^- \*\*Refs\*\*:\s*(.+)$/m.exec(content);
    if (refsLine) {
        for (const m of refsLine[1].matchAll(/#?(\d{1,4})\b/g))
            add("refs", parseInt(m[1], 10));
    }
    // Body mentions: skip metadata bullet lines so Supersedes/Refs/Superseded-by
    // pointers don't double-count as mentions.
    const body = content
        .split("\n")
        .filter((l) => !/^- \*\*(Status|Logged at|Logged by|Tags|Supersedes|Superseded by|Refs)\*\*:/.test(l))
        .join("\n");
    for (const m of body.matchAll(/#(\d{4})\b/g)) {
        const seq = parseInt(m[1], 10);
        const toId = decisionId(seq);
        if (links.has(`refs|${toId}`) || links.has(`supersedes|${toId}`))
            continue;
        add("mentions", seq);
    }
    return [...links.values()];
}
/**
 * Read the link neighborhood of a decision from the index, expanding outward
 * up to `depth` hops (depth applies to outgoing edges; incoming edges are
 * reported for the root node only).
 */
export function getLinks(paths, seq, depth = 1) {
    const db = openDb(paths);
    try {
        const outStmt = db.prepare("SELECT rel, to_id FROM links WHERE from_file LIKE ?");
        const inStmt = db.prepare("SELECT rel, from_file FROM links WHERE to_id = ?");
        const fileFor = (s) => {
            const row = db
                .prepare("SELECT DISTINCT file FROM chunks WHERE file LIKE ? LIMIT 1")
                .get(`decisions/${String(s).padStart(4, "0")}-%`);
            return row?.file ?? null;
        };
        const result = new Map();
        const maxDepth = Math.min(Math.max(depth, 1), 3);
        let frontier = [seq];
        const visited = new Set();
        for (let d = 0; d < maxDepth && frontier.length; d++) {
            const next = [];
            for (const s of frontier) {
                if (visited.has(s))
                    continue;
                visited.add(s);
                const id = decisionId(s);
                const file = fileFor(s);
                const out = file
                    ? outStmt.all(`decisions/${String(s).padStart(4, "0")}-%`)
                        .map((r) => ({ rel: r.rel, toId: r.to_id }))
                    : [];
                const inbound = inStmt.all(id)
                    .map((r) => ({ rel: r.rel, fromFile: r.from_file }));
                result.set(id, { out, in: inbound });
                for (const e of out) {
                    const m = /^decision:(\d{4})$/.exec(e.toId);
                    if (m)
                        next.push(parseInt(m[1], 10));
                }
                // Follow inbound edges too so "who references me" chains are walkable.
                for (const e of inbound) {
                    const s2 = seqFromDecisionPath(e.fromFile);
                    if (s2 !== null)
                        next.push(s2);
                }
            }
            frontier = next.filter((s) => !visited.has(s));
        }
        return result;
    }
    finally {
        db.close();
    }
}
// ---------------------------------------------------------------------------
// Database — schema and connection helpers
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL,
  heading TEXT NOT NULL,
  content TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  logged_at TEXT NOT NULL,
  agent TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  superseded_by TEXT NOT NULL DEFAULT '',
  meta_civilization TEXT,
  meta_type TEXT,
  meta_has_incantation INTEGER
);
CREATE TABLE IF NOT EXISTS chunk_meta (
  chunk_id INTEGER PRIMARY KEY,
  meta_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS refs (
  file TEXT NOT NULL,
  heading TEXT NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (file, heading)
);
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id INTEGER PRIMARY KEY,
  content_hash TEXT NOT NULL,
  embedding BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS chunk_feedback (
  file TEXT NOT NULL,
  heading TEXT NOT NULL,
  downvotes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (file, heading)
);
-- Memory Links: typed edges between memory units, extracted from Markdown
-- (Supersedes line, explicit Refs line, and inline #NNNN mentions in decision
-- bodies). Fully derivative — rebuilt from source files on every index pass.
CREATE TABLE IF NOT EXISTS links (
  from_file TEXT NOT NULL,
  rel TEXT NOT NULL,
  to_id TEXT NOT NULL,
  PRIMARY KEY (from_file, rel, to_id)
);
-- Addressing plane: derived + folksonomy keys. Rebuilds with the index.
CREATE TABLE IF NOT EXISTS chunk_keys (
  chunk_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  key_norm TEXT NOT NULL,
  PRIMARY KEY (chunk_id, kind, key_norm)
);
CREATE INDEX IF NOT EXISTS chunk_keys_norm ON chunk_keys(key_norm);
-- Standalone FTS table (not content=chunks): we index a CJK-bigram-segmented
-- copy of the text in 'seg' so compound CJK queries match, while 'heading' and
-- 'content' hold the raw text for snippets. Kept in sync manually in buildIndex.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  heading, content, seg, tokenize='unicode61'
);
`;
/** Schema version: bump when the FTS layout changes to force a clean rebuild. */
const SCHEMA_VERSION = 8;
/** Open (or create) the index database and apply the schema. */
export function openDb(paths) {
    ensureDir(paths.indexDir);
    const db = new Database(paths.dbFile, { timeout: 120000 });
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 120000");
    // Version check: the index is fully derivative, so on any schema change we
    // simply drop everything and let buildIndex repopulate from Markdown.
    const version = db.pragma("user_version", { simple: true });
    if (version !== SCHEMA_VERSION) {
        db.exec(`
      DROP TABLE IF EXISTS chunks_fts;
      DROP TRIGGER IF EXISTS chunks_ai;
      DROP TRIGGER IF EXISTS chunks_ad;
      DROP TABLE IF EXISTS chunk_meta;
      DROP TABLE IF EXISTS chunk_embeddings;
      DROP TABLE IF EXISTS links;
      DROP TABLE IF EXISTS chunk_keys;
      DROP TABLE IF EXISTS chunks;
      DROP TABLE IF EXISTS files;
    `);
        db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }
    db.exec(SCHEMA);
    return db;
}
/**
 * Return a cached db connection for long-lived processes (e.g. MCP server).
 * CLI commands should use openDb() + db.close() directly.
 */
const _dbCache = new Map();
export function getDb(paths) {
    let db = _dbCache.get(paths.dbFile);
    if (!db || !db.open) {
        db = openDb(paths);
        _dbCache.set(paths.dbFile, db);
    }
    return db;
}
/** Close all cached DB connections (call on process exit). */
export function closeAllCached() {
    for (const [key, db] of _dbCache) {
        try {
            if (db.open)
                db.close();
        }
        catch { /* ignore */ }
        _dbCache.delete(key);
    }
}
function normalizeRelPath(rel) {
    return rel.replace(/\\/g, "/");
}
const SKIP_INDEX_DIRS = [
    "imported/attach",
    "imported/_flat_dump",
    "imported/academic/_scripts",
    /** Dirty Strahil OCR tree. Retrieval grain is corpus/ cards. Files stay on disk. */
    "imported/academic/sources/strahil-medical-md",
];
const CATALOG_BASENAMES = new Set([
    "_index.md",
    "_catalog.md",
    "_readme.md",
    "_manifest.md",
]);
/** Per-work `_index.md` / `_catalog.md` under corpus/<kind>/<slug>/ — file lists that steal ranking. */
export function isCorpusLeafCatalog(rel) {
    const n = normalizeRelPath(rel);
    const base = path.posix.basename(n).toLowerCase();
    if (base !== "_index.md" && base !== "_catalog.md")
        return false;
    const parts = path.posix.dirname(n).split("/");
    const i = parts.indexOf("corpus");
    return i >= 0 && parts.length >= i + 3;
}
/** Dirs that must not enter FTS (binaries, exporter scripts, archived flat dumps, raw OCR). */
export function shouldSkipIndexDir(rel) {
    const n = normalizeRelPath(rel);
    if (SKIP_INDEX_DIRS.some((skip) => n === skip || n.startsWith(`${skip}/`)))
        return true;
    // Ephemeral reading copies of already-split dumps.
    const parts = n.split("/");
    if (parts.includes("reading"))
        return true;
    return false;
}
/** Helper extracts, OCR audit notes, and secondary dumps (cards are the retrieval grain). */
export function shouldSkipIndexFile(rel) {
    const n = normalizeRelPath(rel);
    const base = path.posix.basename(n).toLowerCase();
    if (base === "_resume-slice.md")
        return true;
    if (base.startsWith("ocr_completion"))
        return true;
    if (base === "ocr_quality_notes.md")
        return true;
    if (base === "_ocr-verification.md")
        return true;
    if (base === "_sumerogram-concordance.md")
        return true;
    if (isCorpusLeafCatalog(n))
        return true;
    // Babylonian article OCR; early-chinese `_fulltext.md` stays (excavated transcriptions).
    if (base === "_fulltext_complete.md")
        return true;
    if (base.startsWith("_fulltext") && n.includes("/sources/babylonian/"))
        return true;
    // Keep secondary catalogs searchable; skip the OCR dumps themselves.
    if (n.startsWith("imported/academic/secondary/") && !CATALOG_BASENAMES.has(base)) {
        return true;
    }
    return false;
}
function listMarkdownFiles(memDir) {
    const out = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith("."))
                continue;
            const abs = path.join(dir, entry.name);
            const rel = normalizeRelPath(path.relative(memDir, abs));
            const isDir = entry.isDirectory() || (entry.isSymbolicLink() && safeIsDir(abs));
            if (isDir) {
                if (shouldSkipIndexDir(rel))
                    continue;
                walk(abs);
            }
            else if (entry.name.endsWith(".md") && !shouldSkipIndexFile(rel)) {
                out.push(rel);
            }
        }
    };
    walk(memDir);
    return out;
}
function safeIsDir(abs) {
    try {
        return fs.statSync(abs).isDirectory();
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Memory Map auto-update
// ---------------------------------------------------------------------------
const MAP_BLOCK_RE = /<!-- (?:centricmem|memproject):map -->[\s\S]*?<!-- \/(?:centricmem|memproject):map -->/;
/**
 * Regenerate the <!-- centricmem:map --> block in AGENTS.md after indexing.
 * If the markers are absent, inserts them under ## Memory Map (or appends at EOF).
 */
export function updateMemoryMap(paths, stats, totals) {
    if (!fs.existsSync(paths.agentsFile))
        return;
    const agentsContent = fs.readFileSync(paths.agentsFile, "utf8");
    // Count decisions and their statuses from the decisions/ dir.
    let totalDecisions = 0;
    let activeDecisions = 0;
    let supersededDecisions = 0;
    let lastDecisionDate = "\u2014";
    if (fs.existsSync(paths.decisionsDir)) {
        const files = fs.readdirSync(paths.decisionsDir).filter((f) => f.endsWith(".md")).sort();
        totalDecisions = files.length;
        for (const f of files) {
            const content = fs.readFileSync(path.join(paths.decisionsDir, f), "utf8");
            const st = /\*\*Status\*\*:\s*(\S+)/i.exec(content)?.[1]?.toLowerCase() ?? "accepted";
            if (/superseded|deprecated|historical/.test(st))
                supersededDecisions++;
            else
                activeDecisions++;
            const at = /\*\*Logged at\*\*:\s*(\S+)/.exec(content)?.[1];
            if (at && (lastDecisionDate === "\u2014" || at > lastDecisionDate))
                lastDecisionDate = at.slice(0, 10);
        }
    }
    // Count rules: bullet lines in Global Rules + imported rule sections
    // ("## Imported: …" / sections carrying an "imported … by" provenance line).
    const rulesSection = /## Global Rules\n([\s\S]*?)(?:\n## |$)/.exec(agentsContent)?.[1] ?? "";
    let rulesCount = (rulesSection.match(/^[-*]\s+/gm) ?? []).length;
    rulesCount += (agentsContent.match(/^> Source: .*\(imported .* by [\w-]+\)/gm) ?? []).length;
    // Count lessons headings.
    let lessonsCount = 0;
    if (fs.existsSync(paths.lessonsFile)) {
        const lc = fs.readFileSync(paths.lessonsFile, "utf8");
        lessonsCount = (lc.match(/^##\s+/gm) ?? []).length;
    }
    // Count imported files actually in the FTS file list (not skipped dumps).
    const importedDir = path.join(paths.memDir, "imported");
    let importedCount = totals?.imported;
    if (importedCount === undefined) {
        importedCount = 0;
        if (fs.existsSync(importedDir)) {
            const walk = (dir) => {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.isDirectory())
                        walk(path.join(dir, e.name));
                    else if (e.name.endsWith(".md"))
                        importedCount++;
                }
            };
            walk(importedDir);
        }
    }
    let sessionsCount = 0;
    const sessionsDir = path.join(paths.memDir, "sessions");
    if (fs.existsSync(sessionsDir)) {
        sessionsCount = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".md")).length;
    }
    const decisionLabel = supersededDecisions > 0
        ? `${totalDecisions} (${activeDecisions} active, ${supersededDecisions} superseded)`
        : String(totalDecisions);
    const now = new Date().toISOString();
    const block = [
        "<!-- centricmem:map -->",
        "| Type | Count | Last Updated |",
        "|------|-------|--------------|",
        `| Decisions | ${decisionLabel} | ${lastDecisionDate} |`,
        `| Rules | ${rulesCount} | \u2014 |`,
        `| Lessons | ${lessonsCount} | \u2014 |`,
        `| Imported | ${importedCount} | \u2014 |`,
        `| Sessions | ${sessionsCount} | \u2014 |`,
        "",
        `Last indexed: ${now} | Indexed files: ${stats.scanned} | Chunks: ${totals?.chunks ?? stats.chunks}`,
        "<!-- /centricmem:map -->",
    ].join("\n");
    let updated;
    if (MAP_BLOCK_RE.test(agentsContent)) {
        updated = agentsContent.replace(MAP_BLOCK_RE, block);
    }
    else {
        // Insert under ## Memory Map heading, or append at EOF.
        const mapHeading = /^## Memory Map$/m.exec(agentsContent);
        if (mapHeading) {
            const insertAt = (mapHeading.index ?? 0) + mapHeading[0].length;
            updated = agentsContent.slice(0, insertAt) + "\n\n" + block + agentsContent.slice(insertAt);
        }
        else {
            updated = agentsContent.trimEnd() + "\n\n## Memory Map\n\n" + block + "\n";
        }
    }
    fs.writeFileSync(paths.agentsFile, updated, "utf8");
}
/** Incrementally (re)build the index. Always opens its own connection and closes it. */
export function buildIndex(paths) {
    const db = openDb(paths);
    const config = loadConfig(paths);
    const hotEnabled = config.metadata?.hot_columns_enabled ?? false;
    const hotCols = config.metadata?.hot_columns ?? ["civilization", "type", "has_incantation"];
    const files = listMarkdownFiles(paths.memDir);
    const stats = { scanned: files.length, indexed: 0, removed: 0, chunks: 0 };
    const getHash = db.prepare("SELECT hash FROM files WHERE path = ?");
    const upsertFile = db.prepare("INSERT INTO files(path, hash, indexed_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET hash=excluded.hash, indexed_at=excluded.indexed_at");
    const selChunkIds = db.prepare("SELECT id FROM chunks WHERE file = ?");
    const delMeta = db.prepare("DELETE FROM chunk_meta WHERE chunk_id = ?");
    const delEmb = db.prepare("DELETE FROM chunk_embeddings WHERE chunk_id = ?");
    const delKeys = db.prepare("DELETE FROM chunk_keys WHERE chunk_id = ?");
    const delFts = db.prepare("DELETE FROM chunks_fts WHERE rowid = ?");
    const delChunksStmt = db.prepare("DELETE FROM chunks WHERE file = ?");
    const delChunks = (rel) => {
        for (const r of selChunkIds.all(rel)) {
            delMeta.run(r.id);
            delFts.run(r.id);
            delEmb.run(r.id);
            delKeys.run(r.id);
        }
        delChunksStmt.run(rel);
    };
    const insChunk = db.prepare("INSERT INTO chunks(file, heading, content, doc_type, logged_at, agent, status, superseded_by, meta_civilization, meta_type, meta_has_incantation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insMeta = db.prepare("INSERT INTO chunk_meta(chunk_id, meta_json) VALUES (?, ?)");
    const insKey = db.prepare("INSERT INTO chunk_keys(chunk_id, kind, key, key_norm) VALUES (?, ?, ?, ?) ON CONFLICT(chunk_id, kind, key_norm) DO NOTHING");
    const insFts = db.prepare("INSERT INTO chunks_fts(rowid, heading, content, seg) VALUES (?, ?, ?, ?)");
    const delLinks = db.prepare("DELETE FROM links WHERE from_file = ?");
    const insLink = db.prepare("INSERT INTO links(from_file, rel, to_id) VALUES (?, ?, ?) ON CONFLICT(from_file, rel, to_id) DO NOTHING");
    const tx = db.transaction(() => {
        for (const rel of files) {
            const content = fs.readFileSync(path.join(paths.memDir, rel), "utf8");
            const hash = sha256(content);
            const row = getHash.get(rel);
            if (row && row.hash === hash)
                continue;
            delChunks(rel);
            delLinks.run(rel);
            for (const c of chunkFile(paths.memDir, rel)) {
                const hot = c.meta && hotEnabled ? hotColumnValues(c.meta, hotCols) : { civilization: null, type: null, has_incantation: null };
                const info = insChunk.run(c.file, c.heading, c.content, c.docType, c.loggedAt, c.agent, c.status, c.supersededBy, hot.civilization, hot.type, hot.has_incantation);
                const chunkId = info.lastInsertRowid;
                if (c.meta && Object.keys(c.meta).length) {
                    insMeta.run(chunkId, JSON.stringify(c.meta));
                }
                for (const k of keysForChunk(c, paths.projectSlug)) {
                    insKey.run(chunkId, k.kind, k.key, k.keyNorm);
                }
                insFts.run(chunkId, c.heading, c.content, segmentCjk(`${c.heading}\n${c.content}`));
                stats.chunks++;
            }
            if (classifyDocType(rel) === "decision") {
                for (const l of extractDecisionLinks(rel, content))
                    insLink.run(l.fromFile, l.rel, l.toId);
            }
            upsertFile.run(rel, hash, new Date().toISOString());
            stats.indexed++;
        }
        const known = db.prepare("SELECT path FROM files").all().map((r) => r.path);
        const live = new Set(files);
        for (const p of known) {
            if (!live.has(p)) {
                delChunks(p);
                delLinks.run(p);
                db.prepare("DELETE FROM files WHERE path = ?").run(p);
                stats.removed++;
            }
        }
    });
    tx();
    const totalChunks = db.prepare("SELECT COUNT(*) AS n FROM chunks").get().n;
    const importedIndexed = files.filter((f) => /(^|\/)imported\//.test(normalizeRelPath(f))).length;
    // Invalidate any cached connection so next getDb() picks up the fresh WAL.
    const cached = _dbCache.get(paths.dbFile);
    if (cached && cached !== db) {
        try {
            cached.close();
        }
        catch { /* ignore */ }
        _dbCache.delete(paths.dbFile);
    }
    db.close();
    // Update Memory Map in AGENTS.md (best-effort, never throws).
    try {
        updateMemoryMap(paths, stats, { chunks: totalChunks, imported: importedIndexed });
    }
    catch { /* ignore */ }
    return stats;
}
/**
 * Embed chunks whose embedding is missing or stale (content hash changed).
 * Used by buildIndexAsync; tests inject mockVectors to avoid network.
 */
export async function embedChunks(paths, opts) {
    const config = loadConfig(paths);
    if (!opts?.mockVectors && !isEmbeddingEnabled(config))
        return { embedded: 0 };
    const db = openDb(paths);
    try {
        const rows = db
            .prepare(`SELECT c.id, c.heading, c.content, e.content_hash AS eh
         FROM chunks c LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id`)
            .all();
        const need = rows.filter((r) => sha256(`${r.heading}\n${r.content}`) !== r.eh);
        if (!need.length)
            return { embedded: 0 };
        const embeddings = opts?.mockVectors && opts.mockVectors.length >= need.length
            ? opts.mockVectors.slice(0, need.length)
            : await embedTexts(need.map((r) => `${r.heading}\n${r.content}`.slice(0, 8000)), config);
        if (embeddings.length !== need.length)
            return { embedded: 0 };
        const upsert = db.prepare(`INSERT INTO chunk_embeddings(chunk_id, content_hash, embedding) VALUES (?, ?, ?)
       ON CONFLICT(chunk_id) DO UPDATE SET content_hash=excluded.content_hash, embedding=excluded.embedding`);
        db.transaction(() => {
            for (let i = 0; i < need.length; i++) {
                upsert.run(need[i].id, sha256(`${need[i].heading}\n${need[i].content}`), vectorToBlob(embeddings[i]));
            }
        })();
        return { embedded: need.length };
    }
    finally {
        db.close();
    }
}
/** Index + embed. Embeds when configured (or forced via opts.embed / mockEmbeddings). */
export async function buildIndexAsync(paths, opts) {
    const stats = buildIndex(paths);
    if (opts?.embed === false)
        return stats;
    if (opts?.embed || opts?.mockEmbeddings || isEmbeddingEnabled(loadConfig(paths))) {
        stats.embedded = (await embedChunks(paths, { mockVectors: opts?.mockEmbeddings })).embedded;
    }
    return stats;
}
/** Index every project registered in the workspace. */
export function buildIndexAll(workspaceRoot, opts) {
    const ws = loadWorkspace(workspaceRoot);
    const slugs = Object.keys(ws.projects);
    if (!opts?.quiet)
        logIndexStart(`${slugs.length} project(s)`);
    const total = { scanned: 0, indexed: 0, removed: 0, chunks: 0 };
    for (const slug of slugs) {
        const s = buildIndex(resolvePaths(workspaceRoot, slug));
        total.scanned += s.scanned;
        total.indexed += s.indexed;
        total.removed += s.removed;
        total.chunks += s.chunks;
    }
    if (!opts?.quiet)
        logIndexDone(total);
    return total;
}
function mergeSearchSlugs(workspaceRoot, slugs, query, limit, filters, options) {
    if (!slugs.length)
        return [];
    const ws = loadWorkspace(workspaceRoot);
    const config = loadConfig(resolvePaths(workspaceRoot, slugs[0] ?? ws.current));
    const max = limit ?? config.max_results;
    if (slugs.length === 1) {
        return search(resolvePaths(workspaceRoot, slugs[0]), query, max, filters, undefined, options);
    }
    const merged = [];
    for (const slug of slugs) {
        const hits = search(resolvePaths(workspaceRoot, slug), query, max * 3, filters, undefined, options);
        for (const h of hits)
            merged.push({ ...h, projectSlug: slug });
    }
    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, max);
}
/** Search one or more project indexes. `project:slug` jumps scope; `--all` does not override a prefix. */
export function searchScoped(workspaceRoot, query, limit, filters, options, scope) {
    const slugs = resolveSearchSlugs(workspaceRoot, parseAddressQuery(query), scope);
    return mergeSearchSlugs(workspaceRoot, slugs, query, limit, filters, options);
}
/** Search across all projects in a workspace; merges and re-ranks results. */
export function searchAll(workspaceRoot, query, limit, filters, options) {
    return searchScoped(workspaceRoot, query, limit, filters, options, { all: true });
}
/** Async scoped search (embeds query once when --semantic). */
export async function searchScopedAsync(workspaceRoot, query, limit, filters, options, scope) {
    const slugs = resolveSearchSlugs(workspaceRoot, parseAddressQuery(query), scope);
    if (!slugs.length)
        return [];
    const ws = loadWorkspace(workspaceRoot);
    const config = loadConfig(resolvePaths(workspaceRoot, slugs[0] ?? ws.current));
    let queryEmbedding = options?.queryEmbedding;
    if (options?.semantic && isEmbeddingEnabled(config) && !queryEmbedding?.length) {
        const vecs = await embedTexts([query], config);
        queryEmbedding = vecs[0];
    }
    const max = limit ?? config.max_results;
    const opts = { ...options, queryEmbedding };
    if (slugs.length === 1) {
        return opts.semantic
            ? searchAsync(resolvePaths(workspaceRoot, slugs[0]), query, max, filters, opts)
            : search(resolvePaths(workspaceRoot, slugs[0]), query, max, filters, undefined, opts);
    }
    const merged = [];
    for (const slug of slugs) {
        const paths = resolvePaths(workspaceRoot, slug);
        const hits = opts.semantic
            ? await searchAsync(paths, query, max * 3, filters, opts)
            : search(paths, query, max * 3, filters, undefined, opts);
        for (const h of hits)
            merged.push({ ...h, projectSlug: slug });
    }
    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, max);
}
/** Async cross-project search (embeds query once when --semantic). */
export async function searchAllAsync(workspaceRoot, query, limit, filters, options) {
    return searchScopedAsync(workspaceRoot, query, limit, filters, options, { all: true });
}
// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]{2,}/g;
/**
 * Segment contiguous CJK runs into space-separated overlapping bigrams so that
 * compound words match regardless of surrounding characters.
 * unicode61 treats a whole CJK run as one token, so "会话缓存" would never
 * match inside "做会话缓存" without this. Applied to BOTH indexed text and queries.
 */
export function segmentCjk(text) {
    return text.replace(CJK_RUN, (run) => {
        const grams = [];
        for (let i = 0; i < run.length - 1; i++)
            grams.push(run.slice(i, i + 2));
        return grams.join(" ");
    });
}
/** Escape a user query into a safe FTS5 query (OR of prefix terms; CJK bigram phrases). */
export function toFtsQuery(query) {
    const terms = segmentCjk(query)
        .split(/\s+/)
        .map((t) => t.replace(/["'*()]/g, "").trim())
        .filter(Boolean);
    if (!terms.length)
        return '""';
    const expanded = [];
    for (const t of terms) {
        const parts = t.split(/[-_]+/).filter(Boolean);
        if (parts.length > 1 && parts.every((p) => /^[A-Za-z0-9]+$/.test(p))) {
            // Catalog ids (REF-KURIYAMA1999-CH01): tokenizer splits on '-', so AND the pieces.
            expanded.push("(" + parts.map((p) => `"${p}"*`).join(" AND ") + ")");
        }
        else {
            expanded.push(`"${t}"*`);
        }
    }
    return expanded.join(" OR ");
}
/** Time decay: 1 / (1 + decay_rate * days_old). */
function timeDecay(loggedAt, decayRate) {
    const t = Date.parse(loggedAt);
    if (Number.isNaN(t))
        return 0.5;
    const ageDays = Math.max(0, (Date.now() - t) / 86400000);
    return 1 / (1 + decayRate * ageDays);
}
const INTENT_RULES = [
    { intent: "context", patterns: /当前|现在|正在|进展|current|right now|working on|today|focus/i },
    { intent: "decision", patterns: /为什么|决策|选择|决定|why|decision|decided|chose|choice|rationale/i },
    { intent: "lessons", patterns: /避免|坑|注意|教训|知识|怎么想|心智|逻辑|记住|pitfall|avoid|gotcha|lesson|careful|went wrong|mistake|failure|mental model|heuristic|know that|remember that/i },
    { intent: "research", patterns: /调研|研究|survey|research|external|文献|对比/i },
];
export function classifyIntent(query) {
    for (const rule of INTENT_RULES) {
        if (rule.patterns.test(query))
            return rule.intent;
    }
    return "general";
}
function intentBoost(intent, docType) {
    if (intent === "context" && docType === "context")
        return 2.0;
    if (intent === "decision" && docType === "decision")
        return 2.0;
    if (intent === "lessons" && docType === "lessons")
        return 2.0;
    if (intent === "research" && docType === "imported")
        return 2.0;
    return 1.0;
}
function feedbackPenalty(conn, file, heading) {
    const row = conn
        .prepare("SELECT downvotes FROM chunk_feedback WHERE file = ? AND heading = ?")
        .get(normalizeRelPath(file), heading);
    if (!row?.downvotes)
        return 1;
    return Math.max(0.1, 1 / (1 + row.downvotes * 0.7));
}
/** Record negative feedback — down-rank a chunk in future searches. */
export function dismissChunk(paths, file, heading) {
    const db = openDb(paths);
    const normFile = normalizeRelPath(file);
    try {
        if (heading) {
            db.prepare(`INSERT INTO chunk_feedback(file, heading, downvotes) VALUES (?, ?, 1)
         ON CONFLICT(file, heading) DO UPDATE SET downvotes = downvotes + 1`).run(normFile, heading);
        }
        else {
            const rows = db.prepare("SELECT heading FROM chunks WHERE file = ?").all(normFile);
            const bump = db.prepare(`INSERT INTO chunk_feedback(file, heading, downvotes) VALUES (?, ?, 1)
         ON CONFLICT(file, heading) DO UPDATE SET downvotes = downvotes + 1`);
            for (const r of rows)
                bump.run(normFile, r.heading);
        }
    }
    finally {
        db.close();
    }
}
/** Map user-facing type names to internal doc_type values. */
function normalizeTypeFilter(type) {
    const t = type.toLowerCase();
    if (t === "rule" || t === "rules")
        return "rules";
    if (t === "lesson" || t === "lessons")
        return "lessons";
    return t;
}
/**
 * Search the index.
 * - If the db file doesn't exist, builds the index first (first-run bootstrap).
 * - Does NOT call buildIndex on every search — callers that write new data are
 *   responsible for triggering buildIndex themselves.
 * - Accepts an optional `db` parameter so MCP server can reuse a single connection.
 */
export function search(paths, query, limit, filters, db, options) {
    // Bootstrap: if no db file exists at all, build once.
    if (!fs.existsSync(paths.dbFile))
        buildIndex(paths);
    const config = loadConfig(paths);
    const rawMax = limit ?? config.max_results;
    const max = Number.isFinite(Number(rawMax)) && Number(rawMax) > 0 ? Math.floor(Number(rawMax)) : config.max_results;
    const intent = classifyIntent(query);
    const historicalQuery = isHistoricalQuery(query);
    const hotEnabled = config.metadata?.hot_columns_enabled ?? false;
    const hotCols = config.metadata?.hot_columns ?? ["civilization", "type", "has_incantation"];
    const ownDb = !db;
    const conn = db ?? openDb(paths);
    const rrfK = config.embedding?.rrf_k ?? 60;
    const useSemantic = Boolean(options?.semantic && options.queryEmbedding?.length);
    try {
        const parsed = parseAddressQuery(query);
        const typeFilter = filters?.type || parsed.type;
        const statusFilter = filters?.status || parsed.status;
        const agentFilter = filters?.agent || parsed.agent;
        const andTokens = [...parsed.andTokens, ...(filters?.tags ?? []).map((t) => t.trim()).filter(Boolean)];
        const needsMetaJoin = Boolean(filters?.meta && Object.keys(filters.meta).length);
        const filterConds = [];
        const filterParams = [];
        if (typeFilter) {
            filterConds.push("c.doc_type = ?");
            filterParams.push(normalizeTypeFilter(typeFilter));
        }
        if (statusFilter) {
            filterConds.push("c.status = ?");
            filterParams.push(statusFilter.toLowerCase());
        }
        if (agentFilter) {
            filterConds.push("c.agent = ?");
            filterParams.push(agentFilter.toLowerCase());
        }
        if (filters?.meta) {
            for (const [key, value] of Object.entries(filters.meta)) {
                const { sql, param } = metaFilterSql(key, value, hotEnabled, hotCols);
                filterConds.push(sql);
                filterParams.push(param);
            }
        }
        const joinMeta = needsMetaJoin ? "LEFT JOIN chunk_meta cm ON cm.chunk_id = c.id" : "";
        const filterSql = filterConds.length ? `AND ${filterConds.join(" AND ")}` : "";
        const byId = new Map();
        const tagBrowse = !parsed.ftsQuery.trim();
        const ingest = (r, i, kinds, keys) => {
            const existing = byId.get(r.id);
            if (existing) {
                if (r.rank && !existing.bm25Rank) {
                    existing.bm25Raw = -r.rank;
                    existing.bm25Rank = i + 1;
                    existing.snip = r.snip || existing.snip;
                }
                for (const k of kinds ?? [])
                    existing.keyKinds.add(k);
                if (keys?.length)
                    existing.matchedKeys.push(...keys);
                return;
            }
            byId.set(r.id, {
                id: r.id,
                file: r.file,
                heading: r.heading,
                doc_type: r.doc_type,
                logged_at: r.logged_at,
                agent: r.agent,
                status: r.status,
                superseded_by: r.superseded_by ?? "",
                snip: r.snip,
                bm25Raw: -r.rank,
                bm25Rank: r.rank ? i + 1 : undefined,
                cosine: 0,
                keyKinds: new Set(kinds ?? []),
                matchedKeys: [...(keys ?? [])],
            });
        };
        const rowSql = `SELECT c.id, c.file, c.heading, c.doc_type, c.logged_at, c.agent, c.status, c.superseded_by,
                  substr(c.content, 1, 160) AS snip, 0 AS rank
           FROM chunks c ${joinMeta}`;
        const ftsSql = `SELECT c.id, c.file, c.heading, c.doc_type, c.logged_at, c.agent, c.status, c.superseded_by,
                  snippet(chunks_fts, 1, '**', '**', ' … ', 24) AS snip,
                  bm25(chunks_fts, 4.0, 2.0, 1.0) AS rank
           FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
           ${joinMeta}`;
        const loadFts = (q) => {
            if (!q.trim())
                return [];
            const ftsConds = ["chunks_fts MATCH ?", ...filterConds];
            const ftsParams = [toFtsQuery(q), ...filterParams, max * 5];
            return conn.prepare(`${ftsSql} WHERE ${ftsConds.join(" AND ")} ORDER BY rank LIMIT ?`).all(...ftsParams);
        };
        const loadRecency = () => {
            const where = filterConds.length ? `WHERE ${filterConds.join(" AND ")}` : "";
            return conn.prepare(`${rowSql} ${where} ORDER BY c.logged_at DESC LIMIT ?`).all(...filterParams, max * 5);
        };
        const loadByIds = (ids) => {
            if (!ids.length)
                return [];
            const ph = ids.map(() => "?").join(",");
            const where = filterConds.length
                ? `WHERE c.id IN (${ph}) AND ${filterConds.join(" AND ")}`
                : `WHERE c.id IN (${ph})`;
            return conn.prepare(`${rowSql} ${where}`).all(...ids, ...filterParams);
        };
        const keyHits = (token) => {
            const norms = [...new Set([normalizeKey(token), normalizeKey(padDecisionId(token))].filter(Boolean))];
            if (!norms.length)
                return [];
            const ph = norms.map(() => "?").join(",");
            return conn.prepare(`SELECT chunk_id AS id, kind, key FROM chunk_keys
         WHERE key_norm IN (${ph}) AND kind IN ('tag','id','agent')`).all(...norms);
        };
        const tokenSet = (token) => {
            const ids = new Set();
            const kinds = new Map();
            const keys = new Map();
            const add = (id, kind, key) => {
                ids.add(id);
                if (kind)
                    kinds.set(id, [...(kinds.get(id) ?? []), kind]);
                if (key)
                    keys.set(id, [...(keys.get(id) ?? []), `${kind ?? "fts"}:${key}`]);
            };
            for (const h of keyHits(token))
                add(h.id, h.kind, h.key);
            for (const r of loadFts(token))
                add(r.id, "fts", token);
            if (filterConds.length && ids.size) {
                const allowed = new Set(loadByIds([...ids]).map((r) => r.id));
                for (const id of [...ids])
                    if (!allowed.has(id))
                        ids.delete(id);
            }
            return { ids, kinds, keys };
        };
        const tokCache = new Map();
        const cachedToken = (token) => {
            const hit = tokCache.get(token);
            if (hit)
                return hit;
            const next = tokenSet(token);
            tokCache.set(token, next);
            return next;
        };
        let ftsRows = [];
        const allowed = new Set();
        if (parsed.ftsQuery.trim()) {
            ftsRows = loadFts(parsed.ftsQuery);
            for (const r of ftsRows)
                allowed.add(r.id);
            for (const tok of parsed.boostTokens) {
                for (const id of cachedToken(tok).ids)
                    allowed.add(id);
            }
        }
        else if (!andTokens.length) {
            ftsRows = loadRecency();
            for (const r of ftsRows)
                allowed.add(r.id);
        }
        if (andTokens.length) {
            for (let i = 0; i < andTokens.length; i++) {
                const ids = cachedToken(andTokens[i]).ids;
                if (i === 0 && !parsed.ftsQuery.trim()) {
                    for (const id of ids)
                        allowed.add(id);
                }
                else {
                    for (const id of [...allowed])
                        if (!ids.has(id))
                            allowed.delete(id);
                }
            }
        }
        if (parsed.ftsQuery.trim() || andTokens.length) {
            const have = new Set(ftsRows.map((r) => r.id));
            const missing = [...allowed].filter((id) => !have.has(id));
            ftsRows = [...ftsRows.filter((r) => allowed.has(r.id)), ...loadByIds(missing)];
        }
        ftsRows.forEach((r, i) => ingest(r, i));
        const annotateKeys = (token) => {
            const { kinds, keys } = cachedToken(token);
            for (const [id, ks] of kinds) {
                const row = byId.get(id);
                if (!row)
                    continue;
                for (const k of ks)
                    row.keyKinds.add(k);
                row.matchedKeys.push(...(keys.get(id) ?? []));
            }
        };
        for (const tok of [...parsed.boostTokens, ...andTokens])
            annotateKeys(tok);
        const andMask = andTokens.length
            ? andTokens.reduce((acc, tok) => {
                const ids = cachedToken(tok).ids;
                if (!acc)
                    return new Set(ids);
                for (const id of [...acc])
                    if (!ids.has(id))
                        acc.delete(id);
                return acc;
            }, undefined)
            : undefined;
        const queryVec = options?.queryEmbedding;
        if (useSemantic && queryVec?.length) {
            const embRows = conn
                .prepare(`SELECT c.id, c.file, c.heading, c.doc_type, c.logged_at, c.agent, c.status, c.superseded_by,

                  substr(c.content, 1, 160) AS snip, e.embedding

           FROM chunks c

           JOIN chunk_embeddings e ON e.chunk_id = c.id

           ${joinMeta}

           WHERE 1=1 ${filterSql}`)
                .all(...filterParams);
            const scored = embRows
                .map((r) => ({
                ...r,
                cosine: Math.max(0, cosineSimilarity(queryVec, blobToVector(r.embedding))),
            }))
                .filter((r) => r.cosine > 0)
                .sort((a, b) => b.cosine - a.cosine)
                .slice(0, max * 5);
            scored.forEach((r, i) => {
                if (andMask && !andMask.has(r.id))
                    return;
                const existing = byId.get(r.id);
                if (existing) {
                    existing.vecRank = i + 1;
                    existing.cosine = r.cosine;
                }
                else {
                    byId.set(r.id, {
                        id: r.id,
                        file: r.file,
                        heading: r.heading,
                        doc_type: r.doc_type,
                        logged_at: r.logged_at,
                        agent: r.agent,
                        status: r.status,
                        superseded_by: r.superseded_by ?? "",
                        snip: r.snip || r.heading,
                        bm25Raw: 0,
                        vecRank: i + 1,
                        cosine: r.cosine,
                        keyKinds: new Set(),
                        matchedKeys: [],
                    });
                }
            });
            for (const tok of [...parsed.boostTokens, ...andTokens])
                annotateKeys(tok);
        }
        const getRef = conn.prepare("SELECT ref_count FROM refs WHERE file = ? AND heading = ?");
        const getInbound = conn.prepare("SELECT COUNT(*) AS n FROM links WHERE to_id = ?");
        const getMeta = conn.prepare("SELECT meta_json FROM chunk_meta WHERE chunk_id = ?");
        const getSupersedes = conn.prepare("SELECT to_id FROM links WHERE from_file LIKE ? AND rel = 'supersedes' LIMIT 3");
        for (const c of byId.values()) {
            c.matchedKeys = [...new Set(c.matchedKeys)];
        }
        const candidates = [...byId.values()];
        const bm25Scores = candidates.map((c) => c.bm25Raw).filter((x) => x > 0);
        const bm25Max = Math.max(...bm25Scores, 0.001);
        let rrfMax = 0.001;
        const rrfScores = new Map();
        for (const c of candidates) {
            let rrf = 0;
            if (c.bm25Rank)
                rrf += 1 / (rrfK + c.bm25Rank);
            if (c.vecRank)
                rrf += 1 / (rrfK + c.vecRank);
            rrfScores.set(c.id, rrf);
            if (rrf > rrfMax)
                rrfMax = rrf;
        }
        const results = candidates.map((r) => {
            const bm25Norm = r.bm25Raw > 0 ? r.bm25Raw / bm25Max : 0;
            const rrf = rrfScores.get(r.id) ?? 0;
            const keyBoost = keyBoostFromKinds(r.keyKinds);
            const keyHit = r.keyKinds.has("id") || r.keyKinds.has("tag") || r.keyKinds.has("agent");
            const addressing = andTokens.length > 0 || parsed.boostTokens.length > 0;
            const relevance = tagBrowse
                ? addressing && !keyHit ? 0.72 : 1
                : useSemantic ? rrf / rrfMax : bm25Norm;
            const td = timeDecay(r.logged_at, config.decay_rate);
            const statusPenalty = statusPenaltyFor(r.status, historicalQuery);
            let validFrom;
            let validUntil;
            let tags;
            let attach;
            let parsedMeta;
            const metaRow = getMeta.get(r.id);
            if (metaRow?.meta_json) {
                try {
                    parsedMeta = JSON.parse(metaRow.meta_json);
                    validFrom = scalarMetaString(parsedMeta, "valid_from") || scalarMetaString(parsedMeta, "validFrom");
                    validUntil = scalarMetaString(parsedMeta, "valid_until") || scalarMetaString(parsedMeta, "validUntil");
                    if (Array.isArray(parsedMeta.tags)) {
                        tags = parsedMeta.tags.filter((t) => typeof t === "string" && t.trim().length > 0);
                    }
                    if (typeof parsedMeta.attach === "string" && parsedMeta.attach.trim())
                        attach = parsedMeta.attach.trim();
                }
                catch { /* ignore */ }
            }
            const vp = validityPenalty(validFrom, validUntil);
            const refRow = getRef.get(r.file, r.heading);
            const refCount = refRow?.ref_count ?? 0;
            let inbound = 0;
            const seq = seqFromDecisionPath(r.file);
            if (seq !== null) {
                inbound = getInbound.get(decisionId(seq)).n;
            }
            const refBoost = 1 + config.ref_weight * Math.log(1 + refCount + 2 * inbound);
            const ib = intentBoost(intent, r.doc_type);
            const corpusBoost = corpusRetrievalBoost(parsedMeta);
            const dbBoost = domainBoostForFile(r.file, query, config) * pathRetrievalBoost(r.file) * corpusBoost;
            const fb = feedbackPenalty(conn, r.file, r.heading);
            const score = relevance * td * statusPenalty * vp * refBoost * ib * dbBoost * fb * keyBoost;
            let lineage;
            if (options?.explain && seq !== null) {
                const parts = [`#${seq}`];
                if (r.superseded_by)
                    parts.push(`→ superseded_by #${r.superseded_by}`);
                const outs = getSupersedes.all(`decisions/${String(seq).padStart(4, "0")}-%`);
                for (const o of outs)
                    parts.push(`→ supersedes ${o.to_id}`);
                if (parts.length > 1)
                    lineage = parts.join(" ");
            }
            const result = {
                file: r.file,
                heading: r.heading,
                snippet: r.snip,
                docType: r.doc_type,
                loggedAt: r.logged_at,
                agent: r.agent,
                status: r.status,
                supersededBy: r.superseded_by ?? "",
                score,
            };
            if (tags?.length)
                result.tags = tags;
            if (attach)
                result.attach = attach;
            const work = workIdFromMeta(parsedMeta);
            if (work)
                result.work = work;
            if (options?.explain) {
                result.explain = {
                    bm25: bm25Norm,
                    cosine: r.cosine,
                    relevance,
                    timeDecay: td,
                    statusPenalty,
                    validityPenalty: vp,
                    refBoost,
                    intentBoost: ib,
                    domainBoost: dbBoost,
                    corpusBoost,
                    feedbackPenalty: fb,
                    final: score,
                    bm25Rank: r.bm25Rank,
                    vecRank: r.vecRank,
                    rrf: useSemantic ? rrf : undefined,
                    lineage,
                    keyBoost,
                    matchedKeys: r.matchedKeys.length ? r.matchedKeys : undefined,
                };
            }
            return result;
        });
        results.sort((a, b) => b.score - a.score);
        const deduped = dedupeSearchByWork(results);
        const top = deduped.slice(0, max);
        const bumpRef = conn.prepare("INSERT INTO refs(file, heading, ref_count) VALUES (?, ?, 1) ON CONFLICT(file, heading) DO UPDATE SET ref_count = ref_count + 1");
        for (const r of top)
            bumpRef.run(r.file, r.heading);
        return top;
    }
    finally {
        if (ownDb)
            conn.close();
    }
}
/** Async search with optional semantic embedding of query. */
export async function searchAsync(paths, query, limit, filters, options) {
    const config = loadConfig(paths);
    let queryEmbedding = options?.queryEmbedding;
    if (options?.semantic && isEmbeddingEnabled(config) && !queryEmbedding?.length) {
        const vecs = await embedTexts([query], config);
        queryEmbedding = vecs[0];
    }
    return search(paths, query, limit, filters, undefined, { ...options, queryEmbedding });
}
