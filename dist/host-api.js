/**
 * host-api.ts — JSON verbs shared by the loopback HTTP librarian and tests.
 * Same functions the CLI uses (memory.ts / import.ts / indexer.ts / retrieve.ts).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { applyInbox, classifyMemory, getCurrentProjectSlug, getWorkspaceCurrent, isWorkspace, listInbox, matchProjectByCwd, UNCLASSIFIED, } from "./workspace.js";
import { keepOriginal, logDecision, logLesson, logSession, showMemory, parseAttachLine, writeKeepStub, } from "./memory.js";
import { buildIndex, buildIndexAll, parseAddressQuery, resolveSearchSlugs, searchScoped } from "./indexer.js";
import { parseImportBundle, importBundle } from "./import.js";
import { buildAmbient, formatUninitializedAmbient, writeAmbientFile, } from "./retrieve.js";
import { runDoctor } from "./doctor.js";
import { resolvePaths, looksLikeClientFolder, resolveUnderDir } from "./core.js";
import { healthPayload } from "./host-discover.js";
import { createPendingKeep, isR2Enabled, loadAttachOriginal, objectKeyFor, presignPut, readR2Config, r2Delete, r2Head, r2Put, takePendingKeep, } from "./r2.js";
export class HostApiError extends Error {
    http;
    code;
    constructor(http, code, message) {
        super(message);
        this.http = http;
        this.code = code;
        this.name = "HostApiError";
    }
}
const WRITE_VERBS = new Set([
    "note",
    "log-decision",
    "done",
    "keep",
    "keep-sign",
    "import",
    "classify",
    "index",
    "inbox",
    "delete",
]);
export function isWriteVerb(verb) {
    return WRITE_VERBS.has(verb);
}
function q(query, key) {
    const v = query[key];
    if (Array.isArray(v))
        return v[0];
    return typeof v === "string" && v.trim() ? v : undefined;
}
function qAll(query, key) {
    const v = query[key];
    if (Array.isArray(v))
        return v.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof v === "string" && v.trim()) {
        return v.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}
function flag(query, key) {
    const v = q(query, key);
    return v === "1" || v === "true" || v === "yes";
}
function asRecord(body) {
    if (body && typeof body === "object" && !Array.isArray(body) && !Buffer.isBuffer(body)) {
        return body;
    }
    return {};
}
function str(v) {
    if (typeof v === "string" && v.trim())
        return v.trim();
    return undefined;
}
function parseTags(v) {
    if (Array.isArray(v)) {
        const tags = v.map((t) => String(t).trim()).filter(Boolean);
        return tags.length ? tags : undefined;
    }
    if (typeof v === "string" && v.trim()) {
        const tags = v.split(",").map((t) => t.trim()).filter(Boolean);
        return tags.length ? tags : undefined;
    }
    return undefined;
}
function parseFilters(pairs) {
    if (!pairs.length)
        return undefined;
    const meta = {};
    for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq <= 0) {
            throw new HostApiError(400, "BAD_REQUEST", `Invalid filter (expected key=value): ${pair}`);
        }
        meta[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
    return meta;
}
function assertHub(home) {
    if (!isWorkspace(home) || !fs.existsSync(path.join(home, "projects"))) {
        throw new HostApiError(503, "HUB_INVALID", "This folder is not a CentricMem library. Open Manager and choose the folder that contains workspace.json and projects.");
    }
    if (looksLikeClientFolder(home)) {
        throw new HostApiError(503, "HUB_INVALID", "The library path is the CentricMem client folder. Choose a memory library in Manager settings.");
    }
}
function resolveWriteProject(home, req, body) {
    const requested = str(body.project) || str(body.library) || q(req.query, "project") || q(req.query, "library");
    if (req.scope === "owner") {
        const picked = requested || req.libraryId;
        if (!picked) {
            throw new HostApiError(400, "LIBRARY_REQUIRED", "Owner writes must pick a library.");
        }
        return picked;
    }
    if (req.libraryId) {
        if (requested && requested !== req.libraryId) {
            throw new HostApiError(403, "LIBRARY_MISMATCH", `This pairing key is for library ${req.libraryId}.`);
        }
        return req.libraryId;
    }
    if (requested)
        return requested;
    const cwd = str(body.cwd) || q(req.query, "cwd");
    if (cwd)
        return matchProjectByCwd(home, cwd) ?? UNCLASSIFIED;
    return UNCLASSIFIED;
}
function resolveAmbientProject(home, req, body) {
    if (req.libraryId)
        return req.libraryId;
    const project = str(body.project) || str(body.library) || q(req.query, "project") || q(req.query, "library");
    if (project)
        return project;
    const cwd = str(body.cwd) || q(req.query, "cwd");
    if (cwd) {
        try {
            return getCurrentProjectSlug(home, cwd);
        }
        catch {
            return UNCLASSIFIED;
        }
    }
    try {
        return getWorkspaceCurrent(home);
    }
    catch {
        return undefined;
    }
}
function pairingPinned(req) {
    return Boolean(req.libraryId) && req.scope !== "owner";
}
function resolveAttach(_home, _project, attach) {
    if (!attach?.trim())
        return undefined;
    const normalized = path.posix.normalize(attach.trim().replace(/\\/g, "/"));
    if (!normalized.startsWith("imported/") || normalized.split("/").includes("..")) {
        throw new HostApiError(400, "ATTACH_PATH_REJECTED", "Attach must already be under imported/, or upload bytes with keep. The librarian will not open a server path.");
    }
    return normalized;
}
function indexAfterWrite(home, project) {
    try {
        buildIndex(resolvePaths(home, project));
    }
    catch (error) {
        const err = error;
        if (err.code === "ENOSPC") {
            throw new HostApiError(507, "DISK_FULL", "Disk is full; write saved but index rebuild failed.");
        }
        throw error;
    }
}
function wrapFs(fn) {
    try {
        return fn();
    }
    catch (error) {
        if (error instanceof HostApiError)
            throw error;
        const err = error;
        if (err.code === "ENOSPC") {
            throw new HostApiError(507, "DISK_FULL", "Disk is full. Free space, then retry.");
        }
        if (err.code === "EPERM" || err.code === "EACCES") {
            throw new HostApiError(403, "HUB_DENIED", "The librarian cannot write this memory library.");
        }
        throw error;
    }
}
/** Raw file egress. The HTTP layer sends this as an attachment, not JSON. */
export class FileDownload {
    filename;
    bytes;
    contentType;
    download = true;
    constructor(filename, bytes, contentType) {
        this.filename = filename;
        this.bytes = bytes;
        this.contentType = contentType;
    }
}
function contentTypeFor(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".md")
        return "text/markdown; charset=utf-8";
    if (ext === ".txt")
        return "text/plain; charset=utf-8";
    if (ext === ".pdf")
        return "application/pdf";
    if (ext === ".json")
        return "application/json; charset=utf-8";
    return "application/octet-stream";
}
function resolveLibraryFile(home, project, relPath) {
    const paths = resolvePaths(home, project);
    try {
        return resolveUnderDir(paths.memDir, relPath);
    }
    catch {
        throw new HostApiError(400, "BAD_REQUEST", "Unsafe file path.");
    }
}
async function attachInfo(home, libraryId, attachRel) {
    const rel = attachRel.replace(/\\/g, "/");
    const paths = resolvePaths(home, libraryId);
    const abs = path.join(paths.memDir, ...rel.split("/"));
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return { bytes: fs.statSync(abs).size, store: "disk" };
    }
    if (isR2Enabled()) {
        const head = await r2Head(objectKeyFor(libraryId, rel));
        if (head.exists)
            return { bytes: head.size, store: "r2" };
    }
    return { store: "missing" };
}
function uniqueAttachRel(filename) {
    const safe = path.basename(filename).replace(/[^\w.\u4e00-\u9fff-]+/g, "_") || "original";
    const stamp = new Date().toISOString().slice(0, 10);
    return `imported/attach/${stamp}-${crypto.randomBytes(4).toString("hex")}-${safe}`;
}
async function keepFromUpload(home, project, upload, title, tags) {
    if (isR2Enabled()) {
        const attachRel = uniqueAttachRel(upload.filename);
        try {
            await r2Put(objectKeyFor(project, attachRel), upload.bytes);
        }
        catch (error) {
            throw new HostApiError(502, "R2_UNAVAILABLE", error instanceof Error ? error.message : "R2 PUT failed.");
        }
        const r = writeKeepStub(home, attachRel, {
            title: title || path.parse(upload.filename).name,
            tags,
            projectSlug: project,
            sourceName: path.basename(upload.filename),
        });
        indexAfterWrite(home, project);
        return { ok: true, stub: r.stubRel, attach: r.attachRel, project, store: "r2" };
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "centricmem-keep-"));
    const safe = path.basename(upload.filename).replace(/[^\w.\u4e00-\u9fff-]+/g, "_") || "original";
    const tmp = path.join(tmpDir, safe);
    try {
        fs.writeFileSync(tmp, upload.bytes);
        const r = keepOriginal(home, tmp, { title: title || path.parse(safe).name, tags, projectSlug: project });
        indexAfterWrite(home, project);
        return { ok: true, stub: r.stubRel, attach: r.attachRel, project, store: "disk" };
    }
    finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
export async function handleHostVerb(req, extras) {
    const home = path.resolve(req.home);
    const body = asRecord(req.body);
    const writer = req.writer?.trim() || str(body.agent) || str(body.writer) || "host-api";
    if (req.verb === "health") {
        return {
            ...healthPayload(home),
            library: req.libraryId ?? null,
            lastGuest: extras?.lastGuest ?? null,
        };
    }
    if (req.verb === "doctor") {
        const cwd = str(body.cwd) || q(req.query, "cwd") || home;
        const report = await runDoctor(isWorkspace(home) ? home : null, cwd, { skipLibrarianProbe: true });
        return report;
    }
    if (req.verb === "ambient") {
        if (!isWorkspace(home)) {
            const block = formatUninitializedAmbient(home);
            return { ok: true, state: block.state, text: block.text, project: block.project };
        }
        const project = resolveAmbientProject(home, req, body);
        const block = buildAmbient(home, project);
        try {
            writeAmbientFile(home, block);
        }
        catch {
            /* Path B: cache file failure must not fail ambient */
        }
        return {
            ok: true,
            state: block.state,
            text: block.text,
            project: block.project,
            health: block.health,
        };
    }
    assertHub(home);
    if (req.verb === "search") {
        const query = str(body.q) || str(body.query) || q(req.query, "q") || q(req.query, "query") || "";
        const tags = parseTags(body.tags) ?? qAll(req.query, "tags");
        const parsed = parseAddressQuery(query);
        const hasAddr = Boolean(tags.length || parsed.type || parsed.status || parsed.agent || parsed.andTokens.length || parsed.projectScopes.length
            || q(req.query, "type") || q(req.query, "status"));
        if (!query && !hasAddr) {
            throw new HostApiError(400, "BAD_REQUEST", "Provide q, tags, or a type:/#id prefix.");
        }
        const limitRaw = str(body.limit) || q(req.query, "limit");
        const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
        const filters = {
            type: str(body.type) || q(req.query, "type"),
            status: str(body.status) || q(req.query, "status"),
            agent: str(body.agent) || q(req.query, "agent"),
            meta: parseFilters(qAll(req.query, "filter").concat(typeof body.filter === "string" ? [body.filter] : Array.isArray(body.filter) ? body.filter.map(String) : [])),
            tags: tags.length ? tags : undefined,
        };
        const requestedScope = str(body.project) || str(body.library) || q(req.query, "project") || q(req.query, "library");
        if (pairingPinned(req) && requestedScope && requestedScope !== req.libraryId) {
            throw new HostApiError(403, "LIBRARY_MISMATCH", `This pairing key is for library ${req.libraryId}.`);
        }
        const scope = {
            project: req.libraryId || requestedScope,
            all: pairingPinned(req) ? false : Boolean(body.all) || flag(req.query, "all"),
        };
        const slugs = resolveSearchSlugs(home, parsed, scope);
        if (!slugs.length) {
            throw new HostApiError(400, "BAD_REQUEST", "No matching project index for this query.");
        }
        const results = searchScoped(home, query, Number.isFinite(limit) ? limit : undefined, filters, undefined, scope);
        return { ok: true, results };
    }
    if (req.verb === "show") {
        const file = str(body.file) || q(req.query, "file");
        if (!file)
            throw new HostApiError(400, "BAD_REQUEST", "Provide file.");
        const requestedShow = str(body.project) || str(body.library) || q(req.query, "project") || q(req.query, "library");
        if (pairingPinned(req) && requestedShow && requestedShow !== req.libraryId) {
            throw new HostApiError(403, "LIBRARY_MISMATCH", `This pairing key is for library ${req.libraryId}.`);
        }
        const project = req.libraryId || requestedShow;
        const heading = str(body.heading) || q(req.query, "heading");
        const original = Boolean(body.original) || flag(req.query, "original");
        try {
            const text = showMemory(home, file, { heading, original: false, projectSlug: project });
            if (!original)
                return { ok: true, file, original: false, text };
            const attachRel = parseAttachLine(text);
            if (!attachRel)
                throw new HostApiError(400, "BAD_REQUEST", `No Attach line on ${file}`);
            const lib = project || UNCLASSIFIED;
            const info = await attachInfo(home, lib, attachRel);
            if (info.store === "missing") {
                throw new HostApiError(404, "ATTACH_MISSING", `Attached original missing: ${attachRel}`);
            }
            return {
                ok: true,
                file,
                original: true,
                attach: attachRel,
                bytes: info.bytes,
                store: info.store,
                text: `Original ${info.bytes ?? "?"} bytes (${info.store}) at ${attachRel}. Cards are for agents; humans download. Do not load the file into context.`,
            };
        }
        catch (error) {
            if (error instanceof HostApiError)
                throw error;
            const message = error instanceof Error ? error.message : String(error);
            if (/not found|missing/i.test(message)) {
                throw new HostApiError(404, original ? "ATTACH_MISSING" : "NOT_FOUND", message);
            }
            throw new HostApiError(400, "BAD_REQUEST", message);
        }
    }
    if (req.verb === "inbox" && !flag(req.query, "apply") && body.apply !== true) {
        if (pairingPinned(req) && req.libraryId !== UNCLASSIFIED) {
            return { ok: true, items: [], library: req.libraryId };
        }
        return { ok: true, items: listInbox(home) };
    }
    if (req.verb === "inbox") {
        const r = wrapFs(() => applyInbox(home));
        for (const m of r.moved) {
            indexAfterWrite(home, m.to);
        }
        return { ok: true, moved: r.moved, skipped: r.skipped };
    }
    if (req.verb === "classify") {
        const relPath = str(body.relPath) || str(body.file) || q(req.query, "file");
        const to = str(body.to) || q(req.query, "to");
        if (!relPath || !to)
            throw new HostApiError(400, "BAD_REQUEST", "Provide relPath and to.");
        if (pairingPinned(req) && req.libraryId !== UNCLASSIFIED) {
            throw new HostApiError(403, "LIBRARY_MISMATCH", "Move to library uses the Inbox pairing key.");
        }
        const r = wrapFs(() => classifyMemory(home, relPath, to));
        indexAfterWrite(home, to);
        return { ok: true, moved: r.moved, to };
    }
    if (req.verb === "index") {
        const all = Boolean(body.all) || flag(req.query, "all");
        const requested = str(body.project) || str(body.library) || q(req.query, "project") || q(req.query, "library");
        if (pairingPinned(req) && requested && requested !== req.libraryId) {
            throw new HostApiError(403, "LIBRARY_MISMATCH", `This pairing key is for library ${req.libraryId}.`);
        }
        const project = req.libraryId || requested;
        const stats = wrapFs(() => !pairingPinned(req) && all ? buildIndexAll(home, { quiet: true }) : buildIndex(resolvePaths(home, project)));
        return { ok: true, stats, library: project ?? null };
    }
    if (req.verb === "note") {
        const title = str(body.title);
        const noteBody = str(body.body);
        if (!title || !noteBody)
            throw new HostApiError(400, "BAD_REQUEST", "Provide title and body.");
        const project = resolveWriteProject(home, req, body);
        const tags = parseTags(body.tags);
        const attach = resolveAttach(home, project, str(body.attach));
        const r = wrapFs(() => logLesson(home, { title, body: noteBody, tags, attach, agent: writer }, project));
        if (r.status !== "skipped")
            indexAfterWrite(home, project);
        return { ok: true, status: r.status, title, project };
    }
    if (req.verb === "log-decision") {
        const title = str(body.title);
        if (!title)
            throw new HostApiError(400, "BAD_REQUEST", "Provide title.");
        const project = resolveWriteProject(home, req, body);
        const tags = parseTags(body.tags);
        const attach = resolveAttach(home, project, str(body.attach));
        const supersedesRaw = body.supersedes ?? q(req.query, "supersedes");
        const refsRaw = body.refs ?? q(req.query, "refs");
        const refs = Array.isArray(refsRaw)
            ? refsRaw.map((n) => parseInt(String(n), 10)).filter((n) => Number.isInteger(n) && n > 0)
            : typeof refsRaw === "string"
                ? refsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0)
                : undefined;
        const r = wrapFs(() => logDecision(home, {
            title,
            context: str(body.context) || "",
            decision: str(body.decision) || "",
            consequences: str(body.consequences),
            tags,
            attach,
            agent: writer,
            supersedes: supersedesRaw != null && String(supersedesRaw).trim()
                ? parseInt(String(supersedesRaw), 10)
                : undefined,
            refs,
        }, project));
        indexAfterWrite(home, project);
        return { ok: true, seq: r.seq, file: r.file, project };
    }
    if (req.verb === "done") {
        const summary = str(body.summary) || str(body.body);
        if (!summary)
            throw new HostApiError(400, "BAD_REQUEST", "Provide summary.");
        const project = resolveWriteProject(home, req, body);
        const tags = parseTags(body.tags);
        const attach = resolveAttach(home, project, str(body.attach));
        const r = wrapFs(() => logSession(home, {
            summary,
            title: str(body.title),
            tags,
            attach,
            agent: writer,
        }, project));
        indexAfterWrite(home, project);
        return { ok: true, file: r.file, heading: r.heading, project };
    }
    if (req.verb === "keep-sign") {
        const cfg = readR2Config();
        if (!cfg) {
            throw new HostApiError(503, "R2_NOT_CONFIGURED", "Object store is not configured. Small files: POST /keep with filename+content. Large files need R2.");
        }
        const project = resolveWriteProject(home, req, body);
        const filename = str(body.filename) || "original";
        const attachRel = uniqueAttachRel(filename);
        const objectKey = objectKeyFor(project, attachRel);
        const signed = presignPut(cfg, objectKey);
        const pending = createPendingKeep({
            libraryId: project,
            attachRel,
            objectKey,
            title: str(body.title),
            tags: parseTags(body.tags),
        });
        return {
            ok: true,
            uploadId: pending.uploadId,
            putUrl: signed.putUrl,
            headers: signed.headers,
            attach: attachRel,
            expiresAt: signed.expiresAt,
            project,
            method: "PUT",
        };
    }
    if (req.verb === "keep") {
        const project = resolveWriteProject(home, req, body);
        const tags = parseTags(body.tags);
        const title = str(body.title);
        const uploadId = str(body.uploadId);
        if (uploadId) {
            let pending;
            try {
                pending = takePendingKeep(uploadId);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Keep upload expired. Sign again.";
                const code = /expired/i.test(message) ? "KEEP_SIGN_EXPIRED" : "KEEP_SIGN_UNKNOWN";
                throw new HostApiError(400, code, message);
            }
            if (pairingPinned(req) && pending.libraryId !== project) {
                throw new HostApiError(403, "LIBRARY_MISMATCH", `This pairing key is for library ${req.libraryId}.`);
            }
            const head = await r2Head(pending.objectKey);
            if (!head.exists) {
                throw new HostApiError(400, "KEEP_UPLOAD_INCOMPLETE", "PUT the bytes to putUrl before completing keep.");
            }
            const r = writeKeepStub(home, pending.attachRel, {
                title: title || pending.title,
                tags: tags || pending.tags,
                projectSlug: pending.libraryId,
                sourceName: path.basename(pending.attachRel),
            });
            indexAfterWrite(home, pending.libraryId);
            return { ok: true, stub: r.stubRel, attach: r.attachRel, project: pending.libraryId, store: "r2" };
        }
        if (extras?.keepUpload) {
            return await keepFromUpload(home, project, extras.keepUpload, title, tags);
        }
        const filename = str(body.filename);
        const contentBase64 = str(body.contentBase64) || str(body.bytes);
        if (filename && contentBase64) {
            const bytes = Buffer.from(contentBase64, "base64");
            if (!bytes.length)
                throw new HostApiError(400, "BAD_REQUEST", "Empty keep payload.");
            return await keepFromUpload(home, project, { filename, bytes }, title, tags);
        }
        const content = str(body.content);
        if (filename && content != null) {
            return await keepFromUpload(home, project, { filename, bytes: Buffer.from(content, "utf8") }, title, tags);
        }
        const src = str(body.path) || str(body.file) || q(req.query, "path");
        if (src) {
            throw new HostApiError(400, "KEEP_PATH_REJECTED", "Keep only accepts uploaded bytes (filename + content) or a presigned uploadId. The librarian will not open a server path.");
        }
        throw new HostApiError(400, "BAD_REQUEST", "Provide filename plus content, or uploadId from POST /keep/sign.");
    }
    if (req.verb === "import") {
        const requestedImport = str(body.project) || str(body.library) || q(req.query, "project") || q(req.query, "library");
        if (pairingPinned(req) && requestedImport && requestedImport !== req.libraryId) {
            throw new HostApiError(403, "LIBRARY_MISMATCH", `This pairing key is for library ${req.libraryId}.`);
        }
        const project = req.libraryId || requestedImport || UNCLASSIFIED;
        const dryRun = Boolean(body.dryRun) || flag(req.query, "dryRun");
        const skipExisting = Boolean(body.skipExisting) || flag(req.query, "skipExisting");
        const raw = body.bundle ?? req.body;
        if (raw == null)
            throw new HostApiError(400, "BAD_REQUEST", "Provide an ImportBundle JSON body.");
        const bundle = parseImportBundle(typeof raw === "string" ? raw : raw);
        const r = wrapFs(() => importBundle(home, bundle, { dryRun, project, skipExisting }));
        return { ok: true, ...r };
    }
    if (req.verb === "download") {
        const file = str(body.file) || q(req.query, "file");
        if (!file)
            throw new HostApiError(400, "BAD_REQUEST", "Provide file.");
        const project = resolveWriteProject(home, req, body);
        const unit = resolveLibraryFile(home, project, file);
        if (!fs.existsSync(unit.abs) || !fs.statSync(unit.abs).isFile()) {
            throw new HostApiError(404, "NOT_FOUND", `Memory file not found: ${file}`);
        }
        if (flag(req.query, "original") || Boolean(body.original)) {
            const text = fs.readFileSync(unit.abs, "utf8");
            const attachRel = parseAttachLine(text);
            if (!attachRel)
                throw new HostApiError(400, "BAD_REQUEST", `No Attach line on ${file}.`);
            try {
                const bytes = await loadAttachOriginal(home, project, attachRel);
                const filename = path.basename(attachRel);
                return new FileDownload(filename, bytes, contentTypeFor(filename));
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new HostApiError(404, "ATTACH_MISSING", message);
            }
        }
        const filename = path.basename(unit.abs);
        return new FileDownload(filename, fs.readFileSync(unit.abs), contentTypeFor(filename));
    }
    if (req.verb === "delete") {
        const file = str(body.file) || q(req.query, "file");
        if (!file)
            throw new HostApiError(400, "BAD_REQUEST", "Provide file.");
        const project = resolveWriteProject(home, req, body);
        if (file.replace(/\\/g, "/").split("/")[0] === ".index") {
            throw new HostApiError(403, "FORBIDDEN", "The search index is not a memory unit.");
        }
        const target = resolveLibraryFile(home, project, file);
        if (!fs.existsSync(target.abs) || !fs.statSync(target.abs).isFile()) {
            throw new HostApiError(404, "NOT_FOUND", `Memory file not found: ${file}`);
        }
        let attachRel;
        try {
            attachRel = parseAttachLine(fs.readFileSync(target.abs, "utf8"));
        }
        catch {
            attachRel = undefined;
        }
        wrapFs(() => {
            fs.unlinkSync(target.abs);
        });
        if (attachRel && isR2Enabled()) {
            try {
                await r2Delete(objectKeyFor(project, attachRel));
            }
            catch {
                /* stub already removed */
            }
        }
        indexAfterWrite(home, project);
        return { ok: true, deleted: target.rel, project };
    }
    throw new HostApiError(404, "NOT_FOUND", `Unknown verb: ${req.verb}`);
}
