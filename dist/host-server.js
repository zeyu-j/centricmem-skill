/**
 * host-server.ts — librarian HTTP.
 * Default bind is loopback. Public bind is for the website proxy until TLS on this box.
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { getProductHome } from "./core.js";
import { handleHostVerb, HostApiError, isWriteVerb, FileDownload, } from "./host-api.js";
import { DEFAULT_HOST_PORT, HOST_PROTOCOL, MAX_HOST_PORT, generateHostToken, } from "./host-discover.js";
import { AccountError, FORGOT_OK_MESSAGE, hasOwner, isSessionToken, loginOwner, logoutOwnerSession, registerOwner, requestOwnerPasswordReset, resetOwnerPassword, verifyOwnerSession, } from "./account.js";
import { addLibraryKey, createLibrary, ensureHubCatalog, loadCatalog, publicLibraryKeys, revokeLibraryKey, saveCatalog, stripHubApiToken, tokenBindings, writeGuestApiManifest, } from "./libraries.js";
import { isWorkspace, UNCLASSIFIED } from "./workspace.js";
const JSON_LIMIT = 8 * 1024 * 1024;
const KEEP_LIMIT = 100 * 1024 * 1024;
const WRITE_LIMIT = 40;
const READ_LIMIT = 200;
const LOGIN_LIMIT = 10;
const WINDOW_MS = 60_000;
const VERB_ROUTES = [
    { method: "GET", path: "/health", verb: "health" },
    { method: "GET", path: "/ambient", verb: "ambient" },
    { method: "GET", path: "/doctor", verb: "doctor" },
    { method: "GET", path: "/search", verb: "search" },
    { method: "POST", path: "/search", verb: "search" },
    { method: "GET", path: "/show", verb: "show" },
    { method: "GET", path: "/download", verb: "download" },
    { method: "GET", path: "/inbox", verb: "inbox" },
    { method: "POST", path: "/note", verb: "note" },
    { method: "POST", path: "/log-decision", verb: "log-decision" },
    { method: "POST", path: "/done", verb: "done" },
    { method: "POST", path: "/keep", verb: "keep" },
    { method: "POST", path: "/keep/sign", verb: "keep-sign" },
    { method: "POST", path: "/import", verb: "import" },
    { method: "POST", path: "/classify", verb: "classify" },
    { method: "POST", path: "/inbox", verb: "inbox" },
    { method: "POST", path: "/index", verb: "index" },
    { method: "POST", path: "/delete", verb: "delete" },
];
class WindowLimiter {
    max;
    windowMs;
    hits = [];
    constructor(max, windowMs) {
        this.max = max;
        this.windowMs = windowMs;
    }
    take() {
        const now = Date.now();
        this.hits = this.hits.filter((t) => now - t < this.windowMs);
        if (this.hits.length >= this.max)
            return false;
        this.hits.push(now);
        return true;
    }
}
function tokenEquals(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length)
        return false;
    return timingSafeEqual(left, right);
}
function matchBinding(presented, bindings) {
    return bindings.find((row) => tokenEquals(presented, row.token));
}
function bearerToken(req) {
    const header = req.headers.authorization;
    if (typeof header !== "string")
        return undefined;
    const m = /^Bearer\s+(\S+)/i.exec(header.trim());
    return m?.[1];
}
function queryRecord(url) {
    const out = {};
    for (const [key, value] of url.searchParams.entries()) {
        const existing = out[key];
        if (existing === undefined)
            out[key] = value;
        else if (Array.isArray(existing))
            existing.push(value);
        else
            out[key] = [existing, value];
    }
    return out;
}
function sendJson(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(json);
}
function sendDownload(res, file) {
    const filename = file.filename.replace(/[\r\n"]/g, "_") || "download";
    res.writeHead(200, {
        "Content-Type": file.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "Content-Length": file.bytes.length,
    });
    res.end(file.bytes);
}
function applyCors(req, res) {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
    const allowed = (process.env.CENTRICMEM_CORS_ORIGIN || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (origin && allowed.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CentricMem-Writer, X-CentricMem-Proxy");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}
function isLoopbackAddr(addr) {
    if (!addr)
        return false;
    const a = addr.replace(/^\[|\]$/g, "");
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}
function proxyHeader(req) {
    const raw = req.headers["x-centricmem-proxy"];
    return typeof raw === "string" ? raw.trim() : undefined;
}
function readBody(req, limit) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > limit) {
                req.destroy();
                reject(new HostApiError(413, "TOO_LARGE", "Request body is too large."));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });
}
function headerValue(partHeaders, name) {
    const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
    return re.exec(partHeaders)?.[1]?.trim();
}
function parseMultipart(buf, contentType) {
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!boundaryMatch)
        throw new HostApiError(400, "BAD_REQUEST", "multipart boundary missing.");
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const marker = Buffer.from(`--${boundary}`);
    const fields = {};
    let file;
    let start = buf.indexOf(marker);
    while (start >= 0) {
        const after = start + marker.length;
        if (buf.slice(after, after + 2).toString() === "--")
            break;
        const headerEnd = buf.indexOf("\r\n\r\n", after);
        if (headerEnd < 0)
            break;
        const next = buf.indexOf(marker, headerEnd);
        if (next < 0)
            break;
        const headers = buf.slice(after, headerEnd).toString("utf8").replace(/^\r\n/, "");
        let body = buf.slice(headerEnd + 4, next);
        if (body.length >= 2 && body.slice(-2).toString() === "\r\n")
            body = body.slice(0, -2);
        const disposition = headerValue(headers, "Content-Disposition") || "";
        const name = /name="([^"]+)"/.exec(disposition)?.[1];
        const filename = /filename="([^"]*)"/.exec(disposition)?.[1];
        if (filename && name) {
            file = { filename: filename || "original", bytes: Buffer.from(body) };
        }
        else if (name) {
            fields[name] = body.toString("utf8");
        }
        start = next;
    }
    return { fields, file };
}
function routeFor(method, pathname) {
    return VERB_ROUTES.find((r) => r.method === method && r.path === pathname)?.verb;
}
function projectOf(result) {
    if (result && typeof result === "object" && "project" in result) {
        const project = result.project;
        if (typeof project === "string")
            return project;
    }
    return undefined;
}
function asRecord(body) {
    if (body && typeof body === "object" && !Array.isArray(body) && !Buffer.isBuffer(body)) {
        return body;
    }
    return {};
}
function strField(v) {
    if (typeof v === "string" && v.trim())
        return v.trim();
    return undefined;
}
async function readJsonBody(req, contentType) {
    const raw = await readBody(req, JSON_LIMIT);
    if (!raw.length)
        return {};
    if (contentType.includes("multipart/form-data")) {
        return parseMultipart(raw, contentType).fields;
    }
    try {
        return JSON.parse(raw.toString("utf8"));
    }
    catch {
        throw new HostApiError(400, "BAD_REQUEST", "Body is not JSON.");
    }
}
async function handleAccountRoute(method, url, req, contentType, home, catalogFile, persist, extraApiJson, sessionToken) {
    const pathname = url.pathname;
    if (method === "GET" && pathname === "/account") {
        const cat = catalogFile ? loadCatalog(catalogFile) : null;
        if (!cat)
            throw new HostApiError(503, "NO_CATALOG", "Librarian has no library catalog.");
        return {
            ok: true,
            email: verifyOwnerSession(home, sessionToken)?.email,
            plan: "operator",
            quotaBytes: null,
            usedBytes: null,
            libraries: cat.libraries.map((lib) => ({
                id: lib.id,
                displayName: lib.displayName,
                system: lib.system || undefined,
                keys: publicLibraryKeys(lib),
            })),
        };
    }
    if (method === "POST" && pathname === "/account/logout") {
        logoutOwnerSession(home, sessionToken);
        return { ok: true };
    }
    if (!catalogFile) {
        throw new HostApiError(503, "NO_CATALOG", "Librarian has no library catalog.");
    }
    const body = method === "POST" ? asRecord(await readJsonBody(req, contentType)) : {};
    if (method === "POST" && pathname === "/account/libraries") {
        const id = strField(body.id);
        if (!id)
            throw new HostApiError(400, "BAD_REQUEST", "Provide id.");
        const lib = createLibrary(home, id, { displayName: strField(body.displayName), file: catalogFile });
        const cat = loadCatalog(catalogFile);
        if (persist && cat) {
            writeGuestApiManifest(cat, { extraPaths: extraApiJson });
            stripHubApiToken(home, cat.port);
        }
        return {
            ok: true,
            library: { id: lib.id, displayName: lib.displayName, keys: publicLibraryKeys(lib) },
        };
    }
    if (method === "POST" && pathname === "/account/keys") {
        const library = strField(body.library);
        const name = strField(body.name);
        if (!library)
            throw new HostApiError(400, "BAD_REQUEST", "Provide library.");
        const minted = addLibraryKey(library, name || "unnamed", catalogFile);
        const cat = loadCatalog(catalogFile);
        if (persist && cat)
            writeGuestApiManifest(cat, { extraPaths: extraApiJson });
        return { ok: true, ...minted };
    }
    if (method === "POST" && pathname === "/account/keys/revoke") {
        const library = strField(body.library);
        const id = strField(body.id);
        if (!library || !id)
            throw new HostApiError(400, "BAD_REQUEST", "Provide library and id.");
        const lib = revokeLibraryKey(library, id, catalogFile);
        const cat = loadCatalog(catalogFile);
        if (persist && cat)
            writeGuestApiManifest(cat, { extraPaths: extraApiJson });
        return { ok: true, library: lib.id, keys: publicLibraryKeys(lib) };
    }
    throw new HostApiError(404, "NOT_FOUND", "Unknown path.");
}
export async function listenHostServer(opts) {
    const home = path.resolve(opts.home);
    const writes = new WindowLimiter(WRITE_LIMIT, WINDOW_MS);
    const reads = new WindowLimiter(READ_LIMIT, WINDOW_MS);
    const logins = new WindowLimiter(LOGIN_LIMIT, WINDOW_MS);
    let lastGuest = null;
    const persist = opts.persist !== false;
    const pinnedLibraries = Boolean(opts.libraries?.length);
    const bindHost = (opts.bind || process.env.CENTRICMEM_BIND || "127.0.0.1").trim() || "127.0.0.1";
    const proxySecret = (opts.proxySecret || process.env.CENTRICMEM_PROXY_SECRET || "").trim();
    let catalog;
    let bindings;
    if (pinnedLibraries) {
        bindings = opts.libraries;
    }
    else if (isWorkspace(home)) {
        const catalogFile = persist
            ? undefined
            : path.join(os.tmpdir(), `cm-libraries-${process.pid}-${randomBytes(6).toString("hex")}.json`);
        catalog = ensureHubCatalog(home, {
            bindToken: opts.token,
            file: catalogFile,
            port: opts.port,
        });
        bindings = tokenBindings(catalog);
    }
    else {
        const token = opts.token || generateHostToken();
        bindings = [{ id: "default", token }];
    }
    if (!bindings.length) {
        throw new Error("Librarian has no library pairing keys.");
    }
    function liveBindings() {
        if (pinnedLibraries)
            return bindings;
        if (catalog?.file) {
            const next = loadCatalog(catalog.file);
            if (next) {
                next.file = catalog.file;
                catalog = next;
                bindings = tokenBindings(next);
            }
        }
        return bindings;
    }
    const server = http.createServer(async (req, res) => {
        applyCors(req, res);
        try {
            if (!req.url || !req.method) {
                sendJson(res, 400, { ok: false, error: { code: "BAD_REQUEST", message: "Malformed request." } });
                return;
            }
            const method = req.method.toUpperCase();
            if (method === "OPTIONS") {
                res.writeHead(204);
                res.end();
                return;
            }
            if (proxySecret && !isLoopbackAddr(req.socket.remoteAddress) && proxyHeader(req) !== proxySecret) {
                sendJson(res, 401, { ok: false, error: { code: "UNAUTHORIZED", message: "Missing or invalid token. Rotate it in Manager settings." } });
                return;
            }
            const hostHeader = String(req.headers.host || bindHost);
            const url = new URL(req.url, `http://${hostHeader}`);
            const contentType = String(req.headers["content-type"] || "");
            const presented = bearerToken(req);
            const owner = presented && isSessionToken(presented) ? verifyOwnerSession(home, presented) : undefined;
            const binding = presented && !owner ? matchBinding(presented, liveBindings()) : undefined;
            if (method === "GET" && url.pathname === "/status") {
                sendJson(res, 200, { ok: true, protocol: HOST_PROTOCOL, registered: hasOwner(home) });
                return;
            }
            if (method === "POST" && url.pathname === "/register") {
                if (!logins.take()) {
                    sendJson(res, 429, { ok: false, error: { code: "RATE_LIMIT", message: "Too many login attempts. Wait a minute." } });
                    return;
                }
                const body = asRecord(await readJsonBody(req, contentType));
                const email = strField(body.email);
                const password = strField(body.password);
                if (!email || !password) {
                    throw new HostApiError(400, "BAD_REQUEST", "Provide email and password.");
                }
                const session = registerOwner(home, email, password);
                sendJson(res, 200, { ok: true, token: session.token, email: session.email, expiresAt: session.expiresAt });
                return;
            }
            if (method === "POST" && url.pathname === "/login") {
                if (!logins.take()) {
                    sendJson(res, 429, { ok: false, error: { code: "RATE_LIMIT", message: "Too many login attempts. Wait a minute." } });
                    return;
                }
                const body = asRecord(await readJsonBody(req, contentType));
                const email = strField(body.email);
                const password = strField(body.password);
                if (!email || !password) {
                    throw new HostApiError(400, "BAD_REQUEST", "Provide email and password.");
                }
                const session = loginOwner(home, email, password);
                sendJson(res, 200, { ok: true, token: session.token, email: session.email, expiresAt: session.expiresAt });
                return;
            }
            if (method === "POST" && url.pathname === "/forgot-password") {
                if (!logins.take()) {
                    sendJson(res, 429, { ok: false, error: { code: "RATE_LIMIT", message: "Too many login attempts. Wait a minute." } });
                    return;
                }
                const body = asRecord(await readJsonBody(req, contentType));
                const email = strField(body.email);
                if (!email) {
                    throw new HostApiError(400, "BAD_REQUEST", "Provide email.");
                }
                await requestOwnerPasswordReset(home, email);
                sendJson(res, 200, { ok: true, message: FORGOT_OK_MESSAGE });
                return;
            }
            if (method === "POST" && url.pathname === "/reset-password") {
                if (!logins.take()) {
                    sendJson(res, 429, { ok: false, error: { code: "RATE_LIMIT", message: "Too many login attempts. Wait a minute." } });
                    return;
                }
                const body = asRecord(await readJsonBody(req, contentType));
                const token = strField(body.token);
                const password = strField(body.password);
                if (!token || !password) {
                    throw new HostApiError(400, "BAD_REQUEST", "Provide token and password.");
                }
                const session = resetOwnerPassword(home, token, password);
                sendJson(res, 200, { ok: true, token: session.token, email: session.email, expiresAt: session.expiresAt });
                return;
            }
            if (url.pathname.startsWith("/account")) {
                if (binding) {
                    sendJson(res, 403, {
                        ok: false,
                        error: { code: "FORBIDDEN", message: "Pairing keys cannot manage the account." },
                    });
                    return;
                }
                if (!owner || !presented) {
                    sendJson(res, 401, {
                        ok: false,
                        error: { code: "UNAUTHORIZED", message: "Owner login required." },
                    });
                    return;
                }
                if (!reads.take()) {
                    sendJson(res, 429, { ok: false, error: { code: "RATE_LIMIT", message: "Too many requests. Wait a minute." } });
                    return;
                }
                const result = await handleAccountRoute(method, url, req, contentType, home, catalog?.file, persist, opts.extraApiJson, presented);
                liveBindings();
                sendJson(res, 200, result);
                return;
            }
            const verb = routeFor(method, url.pathname);
            if (!verb) {
                sendJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "Unknown path." } });
                return;
            }
            if (!presented || (!binding && !owner)) {
                sendJson(res, 401, {
                    ok: false,
                    error: { code: "UNAUTHORIZED", message: "Missing or invalid token. Rotate it in Manager settings." },
                });
                return;
            }
            if (verb === "delete" && !owner) {
                sendJson(res, 403, {
                    ok: false,
                    error: { code: "FORBIDDEN", message: "Pairing keys cannot delete. Download, or sign in as the owner." },
                });
                return;
            }
            const query = queryRecord(url);
            let libraryId = binding && binding.id !== "default" ? binding.id : undefined;
            if (owner) {
                const qLib = typeof query.library === "string"
                    ? query.library
                    : typeof query.project === "string"
                        ? query.project
                        : undefined;
                libraryId = qLib;
            }
            const limiter = isWriteVerb(verb) && !(verb === "inbox" && method === "GET") ? writes : reads;
            if (!limiter.take()) {
                sendJson(res, 429, {
                    ok: false,
                    error: { code: "RATE_LIMIT", message: "Too many guest writes. Wait a minute and retry." },
                });
                return;
            }
            let body;
            let keepUpload;
            if (method === "POST" || method === "PUT") {
                const limit = verb === "keep" ? KEEP_LIMIT : JSON_LIMIT;
                const raw = await readBody(req, limit);
                if (contentType.includes("multipart/form-data")) {
                    const parsed = parseMultipart(raw, contentType);
                    body = parsed.fields;
                    keepUpload = parsed.file;
                }
                else if (contentType.includes("application/octet-stream") && verb === "keep") {
                    const filename = String(req.headers["x-filename"] || "original");
                    keepUpload = { filename, bytes: raw };
                    body = {
                        title: req.headers["x-title"],
                        tags: req.headers["x-tags"],
                        project: req.headers["x-project"],
                    };
                }
                else if (raw.length) {
                    try {
                        body = JSON.parse(raw.toString("utf8"));
                    }
                    catch {
                        throw new HostApiError(400, "BAD_REQUEST", "Body is not JSON.");
                    }
                }
            }
            if (owner && body && typeof body === "object") {
                const rec = asRecord(body);
                libraryId = strField(rec.library) || strField(rec.project) || libraryId;
            }
            const writer = String(req.headers["x-centricmem-writer"] || "").trim() || undefined;
            const result = await handleHostVerb({
                verb,
                home,
                libraryId,
                scope: owner ? "owner" : "pairing",
                query,
                body,
                writer,
            }, { keepUpload, lastGuest });
            if (isWriteVerb(verb) && !(verb === "inbox" && method === "GET")) {
                lastGuest = {
                    at: new Date().toISOString(),
                    verb,
                    project: projectOf(result) || libraryId,
                    writer: writer || "host-api",
                };
            }
            if (result instanceof FileDownload) {
                sendDownload(res, result);
                return;
            }
            sendJson(res, 200, result);
        }
        catch (error) {
            if (error instanceof HostApiError) {
                sendJson(res, error.http, { ok: false, error: { code: error.code, message: error.message } });
                return;
            }
            if (error instanceof AccountError) {
                sendJson(res, error.http, { ok: false, error: { code: error.code, message: error.message } });
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            sendJson(res, 500, { ok: false, error: { code: "INTERNAL", message } });
        }
    });
    const preferred = Number.isInteger(opts.port) && opts.port >= 0 ? opts.port : DEFAULT_HOST_PORT;
    const port = await bindListen(server, preferred, bindHost);
    const fallbackToken = bindings.find((b) => b.id === UNCLASSIFIED)?.token || bindings[0].token;
    if (catalog) {
        catalog.port = port;
        if (persist) {
            saveCatalog(catalog, catalog.file);
            writeGuestApiManifest(catalog, { extraPaths: opts.extraApiJson });
            stripHubApiToken(home, port);
        }
    }
    process.stdout.write(`listening ${bindHost}:${port}\n`);
    return {
        port,
        host: bindHost,
        token: fallbackToken,
        home,
        get lastGuest() {
            return lastGuest;
        },
        close: () => new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
}
function bindListen(server, preferred, host) {
    return new Promise((resolve, reject) => {
        const tryPort = (port) => {
            const onError = (error) => {
                server.off("listening", onListen);
                if (error.code === "EADDRINUSE" && port !== 0 && host === "127.0.0.1" && port < MAX_HOST_PORT) {
                    tryPort(port + 1);
                    return;
                }
                reject(error);
            };
            const onListen = () => {
                server.off("error", onError);
                const addr = server.address();
                if (addr && typeof addr === "object")
                    resolve(addr.port);
                else
                    reject(new Error("Failed to bind listen port."));
            };
            server.once("error", onError);
            server.once("listening", onListen);
            server.listen(port, host);
        };
        tryPort(preferred);
    });
}
function isDirectRun() {
    const entry = process.argv[1];
    if (!entry)
        return false;
    try {
        return import.meta.url === pathToFileURL(fs.realpathSync(entry)).href;
    }
    catch {
        return import.meta.url === pathToFileURL(path.resolve(entry)).href;
    }
}
export async function main() {
    const home = process.env.CENTRICMEM_HOME?.trim() || getProductHome();
    const token = process.env.CENTRICMEM_API_TOKEN?.trim();
    const portRaw = process.env.CENTRICMEM_API_PORT?.trim();
    const extra = process.env.CENTRICMEM_API_JSON?.trim();
    const bind = process.env.CENTRICMEM_BIND?.trim();
    const proxySecret = process.env.CENTRICMEM_PROXY_SECRET?.trim();
    await listenHostServer({
        home,
        token,
        port: portRaw ? parseInt(portRaw, 10) : DEFAULT_HOST_PORT,
        bind,
        proxySecret,
        extraApiJson: extra ? [extra] : [],
    });
}
if (isDirectRun()) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
