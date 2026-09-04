/**
 * libraries.ts — pairing keys per library (wraps projects/<slug>/ in place).
 * Catalog is machine-local (AppData / XDG); do not put tokens in hub api.json.
 * A library may have several named keys; revoke one without kicking the owner.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { projectMemDir } from "./core.js";
import { ensureProjectRegistered, isWorkspace, loadWorkspace, projectSlugFromName, saveWorkspace, UNCLASSIFIED, } from "./workspace.js";
export const CATALOG_VERSION = 1;
const DEFAULT_PORT = 23180;
function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}
function newKeyId() {
    return crypto.randomBytes(8).toString("hex");
}
function nowIso() {
    return new Date().toISOString();
}
function sanitizeKeyName(name) {
    const trimmed = (name || "").trim().slice(0, 40);
    return trimmed || "unnamed";
}
export function activeKeys(lib) {
    return (lib.keys ?? []).filter((k) => k.token && !k.revokedAt);
}
function firstActiveToken(lib) {
    return activeKeys(lib)[0]?.token || "";
}
function parseKeys(row) {
    const keys = [];
    if (Array.isArray(row.keys)) {
        for (const item of row.keys) {
            if (!item || typeof item !== "object")
                continue;
            const rec = item;
            if (typeof rec.id !== "string" || !rec.id.trim())
                continue;
            if (typeof rec.token !== "string" || !rec.token.trim())
                continue;
            keys.push({
                id: rec.id.trim(),
                name: sanitizeKeyName(typeof rec.name === "string" ? rec.name : "default"),
                token: rec.token.trim(),
                createdAt: typeof rec.createdAt === "string" ? rec.createdAt : nowIso(),
                revokedAt: typeof rec.revokedAt === "string" ? rec.revokedAt : undefined,
            });
        }
    }
    if (!keys.length && typeof row.token === "string" && row.token.trim()) {
        keys.push({
            id: "default",
            name: "default",
            token: row.token.trim(),
            createdAt: nowIso(),
        });
    }
    return keys;
}
function ensureKeys(lib) {
    if (!lib.keys?.length && lib.token) {
        lib.keys = [{ id: newKeyId(), name: "default", token: lib.token, createdAt: nowIso() }];
    }
    if (!lib.token)
        lib.token = firstActiveToken(lib);
    return lib;
}
function userApiPath() {
    if (process.platform === "win32") {
        const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(appdata, "centricmem", "api.json");
    }
    const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(xdg, "centricmem", "api.json");
}
function atomicJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    try {
        fs.renameSync(temp, file);
    }
    catch {
        fs.rmSync(file, { force: true });
        fs.renameSync(temp, file);
    }
    try {
        fs.chmodSync(file, 0o600);
    }
    catch {
        /* Windows ignores mode */
    }
}
export function librariesJsonPath() {
    if (process.env.CENTRICMEM_LIBRARIES_JSON?.trim()) {
        return path.resolve(process.env.CENTRICMEM_LIBRARIES_JSON.trim());
    }
    if (process.platform === "win32") {
        const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(appdata, "centricmem", "libraries.json");
    }
    const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(xdg, "centricmem", "libraries.json");
}
export function libraryDisplayName(id, configured) {
    if (configured?.trim())
        return configured.trim();
    if (id === UNCLASSIFIED)
        return "Inbox";
    if (id === "host")
        return "This PC";
    return id;
}
function readConfigDisplayName(memDir) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(memDir, "config.json"), "utf8"));
        return typeof raw.display_name === "string" && raw.display_name.trim()
            ? raw.display_name.trim()
            : undefined;
    }
    catch {
        return undefined;
    }
}
function normalizePath(p) {
    return path.resolve(p).replace(/\\/g, "/").toLowerCase();
}
export function loadCatalog(file = librariesJsonPath()) {
    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        if (raw.version !== CATALOG_VERSION || typeof raw.hub !== "string")
            return null;
        if (!Array.isArray(raw.libraries))
            return null;
        const hub = path.resolve(raw.hub);
        const libraries = [];
        for (const row of raw.libraries) {
            if (!row || typeof row.id !== "string")
                continue;
            const id = row.id.trim();
            if (!id)
                continue;
            const keys = parseKeys(row);
            const token = (typeof row.token === "string" && row.token.trim()) ||
                keys.find((k) => !k.revokedAt)?.token ||
                "";
            const memDir = typeof row.memDir === "string" && row.memDir.trim()
                ? path.resolve(row.memDir)
                : projectMemDir(hub, id);
            const sourceDirs = Array.isArray(row.sourceDirs)
                ? row.sourceDirs.filter((s) => typeof s === "string" && Boolean(s.trim())).map((s) => path.resolve(s))
                : [];
            libraries.push(ensureKeys({
                id,
                hub,
                memDir,
                sourceDirs,
                token,
                keys,
                displayName: libraryDisplayName(id, row.displayName),
                system: Boolean(row.system),
            }));
        }
        if (!libraries.length)
            return null;
        const current = typeof raw.current === "string" && libraries.some((l) => l.id === raw.current)
            ? raw.current
            : libraries[0].id;
        const port = Number(raw.port);
        const originRaw = typeof raw.origin === "string" ? raw.origin.trim().replace(/\/+$/, "") : "";
        const origin = /^https?:\/\//i.test(originRaw) ? originRaw : undefined;
        return {
            version: 1,
            hub,
            port: Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT,
            current,
            libraries,
            origin,
            file,
        };
    }
    catch {
        return null;
    }
}
export function saveCatalog(catalog, file = librariesJsonPath()) {
    const origin = catalog.origin?.trim().replace(/\/+$/, "");
    atomicJson(file, {
        version: 1,
        hub: path.resolve(catalog.hub),
        port: catalog.port,
        current: catalog.current,
        ...(origin && /^https?:\/\//i.test(origin) ? { origin } : {}),
        libraries: catalog.libraries.map((lib) => ({
            id: lib.id,
            hub: path.resolve(lib.hub),
            memDir: path.resolve(lib.memDir),
            sourceDirs: lib.sourceDirs.map((s) => path.resolve(s)),
            token: lib.token,
            keys: (lib.keys ?? []).map((k) => ({
                id: k.id,
                name: k.name,
                token: k.token,
                createdAt: k.createdAt,
                revokedAt: k.revokedAt || undefined,
            })),
            displayName: lib.displayName,
            system: lib.system || undefined,
        })),
    });
    catalog.file = file;
}
function recordFromWorkspace(hub, id, entry, previous) {
    const memDir = projectMemDir(hub, entry.path || id);
    const sourceDirs = entry.sourceDir ? [path.resolve(entry.sourceDir)] : previous?.sourceDirs ?? [];
    const token = previous?.token || generateToken();
    const keys = previous?.keys?.length
        ? previous.keys
        : [{ id: newKeyId(), name: "default", token, createdAt: nowIso() }];
    return ensureKeys({
        id,
        hub: path.resolve(hub),
        memDir,
        sourceDirs,
        token,
        keys,
        displayName: libraryDisplayName(id, readConfigDisplayName(memDir)),
        system: Boolean(entry.system),
    });
}
export function ensureHubCatalog(hub, opts) {
    const resolved = path.resolve(hub);
    const requestedFile = opts?.file ?? librariesJsonPath();
    let file = requestedFile;
    if (!isWorkspace(resolved)) {
        throw new Error(`Not a CentricMem hub: ${resolved}`);
    }
    const ws = loadWorkspace(resolved);
    let existing = loadCatalog(file);
    const machineDefault = !opts?.file && !process.env.CENTRICMEM_LIBRARIES_JSON?.trim();
    if (machineDefault && existing && path.resolve(existing.hub) !== resolved) {
        file = path.join(os.tmpdir(), "centricmem-catalogs", crypto.createHash("sha1").update(resolved.toLowerCase()).digest("hex"), "libraries.json");
        existing = loadCatalog(file);
    }
    else if (existing && path.resolve(existing.hub) !== resolved) {
        existing = null;
    }
    const prevById = new Map((existing?.libraries ?? []).map((lib) => [lib.id, lib]));
    const libraries = [];
    for (const [id, entry] of Object.entries(ws.projects)) {
        libraries.push(recordFromWorkspace(resolved, id, entry, prevById.get(id)));
    }
    if (opts?.bindToken?.trim()) {
        const inbox = libraries.find((l) => l.id === UNCLASSIFIED) ?? libraries[0];
        if (inbox) {
            const token = opts.bindToken.trim();
            inbox.token = token;
            const keys = inbox.keys ?? [];
            const live = keys.find((k) => !k.revokedAt);
            if (live)
                live.token = token;
            else
                keys.push({ id: newKeyId(), name: "default", token, createdAt: nowIso() });
            inbox.keys = keys;
        }
    }
    const current = existing?.current && libraries.some((l) => l.id === existing.current)
        ? existing.current
        : ws.current && libraries.some((l) => l.id === ws.current)
            ? ws.current
            : libraries[0]?.id ?? UNCLASSIFIED;
    const catalog = {
        version: 1,
        hub: resolved,
        port: opts?.port ?? existing?.port ?? DEFAULT_PORT,
        current,
        libraries,
        origin: existing?.origin,
        file,
    };
    saveCatalog(catalog, file);
    try {
        stripHubApiToken(resolved, catalog.port);
    }
    catch {
        /* hub api.json is optional */
    }
    return catalog;
}
export function findLibraryByToken(token, catalog) {
    const cat = catalog ?? loadCatalog();
    if (!cat || !token)
        return undefined;
    return cat.libraries.find((lib) => activeKeys(lib).some((k) => k.token === token));
}
export function findLibraryById(id, catalog) {
    const cat = catalog ?? loadCatalog();
    return cat?.libraries.find((lib) => lib.id === id);
}
export function matchLibraryByCwd(cwd, catalog) {
    const cat = catalog ?? loadCatalog();
    if (!cat)
        return undefined;
    const needle = normalizePath(cwd);
    let best;
    for (const lib of cat.libraries) {
        for (const dir of lib.sourceDirs) {
            const root = normalizePath(dir);
            if (needle === root || needle.startsWith(root + "/")) {
                if (!best || root.length > best.len)
                    best = { lib, len: root.length };
            }
        }
    }
    return best?.lib;
}
export function rotateLibraryToken(id, file) {
    const pathFile = file ?? librariesJsonPath();
    const cat = loadCatalog(pathFile);
    if (!cat)
        throw new Error("No library catalog. Open Manager or run centricmem libraries.");
    const lib = cat.libraries.find((row) => row.id === id);
    if (!lib)
        throw new Error(`Unknown library: ${id}`);
    const now = nowIso();
    for (const key of lib.keys ?? []) {
        if (!key.revokedAt && key.token === lib.token)
            key.revokedAt = now;
    }
    const token = generateToken();
    const key = { id: newKeyId(), name: "default", token, createdAt: now };
    lib.keys = [...(lib.keys ?? []), key];
    lib.token = token;
    saveCatalog(cat, pathFile);
    return lib;
}
export function addLibraryKey(id, name, file) {
    const pathFile = file ?? librariesJsonPath();
    const cat = loadCatalog(pathFile);
    if (!cat)
        throw new Error("No library catalog. Open Manager or run centricmem libraries.");
    const lib = cat.libraries.find((row) => row.id === id);
    if (!lib)
        throw new Error(`Unknown library: ${id}`);
    const token = generateToken();
    const key = {
        id: newKeyId(),
        name: sanitizeKeyName(name),
        token,
        createdAt: nowIso(),
    };
    lib.keys = [...(lib.keys ?? []), key];
    if (!lib.token)
        lib.token = token;
    saveCatalog(cat, pathFile);
    return { id: key.id, name: key.name, token, createdAt: key.createdAt, library: lib.id };
}
export function revokeLibraryKey(libraryId, keyId, file) {
    const pathFile = file ?? librariesJsonPath();
    const cat = loadCatalog(pathFile);
    if (!cat)
        throw new Error("No library catalog.");
    const lib = cat.libraries.find((row) => row.id === libraryId);
    if (!lib)
        throw new Error(`Unknown library: ${libraryId}`);
    const key = (lib.keys ?? []).find((row) => row.id === keyId);
    if (!key)
        throw new Error(`Unknown key: ${keyId}`);
    if (!key.revokedAt)
        key.revokedAt = nowIso();
    if (lib.token === key.token)
        lib.token = firstActiveToken(lib);
    saveCatalog(cat, pathFile);
    return lib;
}
export function listLibraryKeys(libraryId, file) {
    const pathFile = file ?? librariesJsonPath();
    const cat = loadCatalog(pathFile);
    const lib = cat?.libraries.find((row) => row.id === libraryId);
    if (!lib)
        throw new Error(`Unknown library: ${libraryId}`);
    return (lib.keys ?? []).map((k) => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        revokedAt: k.revokedAt,
        active: !k.revokedAt,
    }));
}
export function setCurrentLibrary(id, file) {
    const pathFile = file ?? librariesJsonPath();
    const cat = loadCatalog(pathFile);
    if (!cat)
        throw new Error("No library catalog.");
    if (!cat.libraries.some((lib) => lib.id === id))
        throw new Error(`Unknown library: ${id}`);
    cat.current = id;
    saveCatalog(cat, pathFile);
    try {
        if (isWorkspace(cat.hub)) {
            const ws = loadWorkspace(cat.hub);
            ws.current = id;
            saveWorkspace(cat.hub, ws);
        }
    }
    catch {
        /* display pin is optional */
    }
    return cat;
}
export function createLibrary(hub, id, opts) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id))
        throw new Error(`Invalid library id: ${id}`);
    const resolved = path.resolve(hub);
    ensureProjectRegistered(resolved, id);
    if (opts?.sourceDir) {
        const ws = loadWorkspace(resolved);
        ws.projects[id].sourceDir = path.resolve(opts.sourceDir);
        saveWorkspace(resolved, ws);
    }
    const cat = ensureHubCatalog(resolved, { file: opts?.file });
    const lib = cat.libraries.find((row) => row.id === id);
    if (!lib)
        throw new Error(`Failed to register library: ${id}`);
    if (opts?.displayName) {
        lib.displayName = opts.displayName;
        saveCatalog(cat, opts.file);
    }
    return lib;
}
export function linkCwdToLibrary(hub, codePath, cwd = process.cwd(), file) {
    const abs = path.resolve(cwd, codePath);
    if (!fs.existsSync(abs))
        throw new Error(`Path not found: ${abs}`);
    const id = projectSlugFromName(path.basename(abs));
    const resolved = path.resolve(hub);
    ensureProjectRegistered(resolved, id);
    const ws = loadWorkspace(resolved);
    ws.projects[id].sourceDir = abs;
    saveWorkspace(resolved, ws);
    const cat = ensureHubCatalog(resolved, { file });
    const lib = cat.libraries.find((row) => row.id === id);
    if (!lib)
        throw new Error(`Failed to link library: ${id}`);
    if (!lib.sourceDirs.some((dir) => normalizePath(dir) === normalizePath(abs))) {
        lib.sourceDirs.push(abs);
        saveCatalog(cat, file);
    }
    return lib;
}
/** Guest-facing api.json: tokens live here (AppData), not in the synced hub. */
export function writeGuestApiManifest(catalog, opts) {
    const cwdLib = opts?.cwd ? matchLibraryByCwd(opts.cwd, catalog) : undefined;
    const current = cwdLib ?? findLibraryById(catalog.current, catalog) ?? catalog.libraries[0];
    const body = {
        host: "127.0.0.1",
        port: catalog.port,
        protocol: 1,
        home: catalog.hub,
        token: current?.token,
        library: current?.id,
        updatedAt: new Date().toISOString(),
        libraries: catalog.libraries.map((lib) => ({
            id: lib.id,
            displayName: lib.displayName,
            token: lib.token,
            memDir: lib.memDir,
            sourceDirs: lib.sourceDirs,
            system: lib.system || undefined,
        })),
    };
    const files = [userApiPath(), librariesJsonPath().replace(/libraries\.json$/i, "api.json")];
    for (const extra of opts?.extraPaths ?? [])
        files.push(extra);
    for (const file of [...new Set(files.map((p) => path.resolve(p)))]) {
        atomicJson(file, body);
    }
}
export function tokenBindings(catalog) {
    const out = [];
    for (const lib of catalog.libraries) {
        for (const key of activeKeys(lib)) {
            out.push({ id: lib.id, token: key.token });
        }
    }
    return out;
}
export function publicLibraryKeys(lib) {
    return (lib.keys ?? []).map((k) => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        revokedAt: k.revokedAt,
        active: !k.revokedAt,
    }));
}
/** Hub api.json is synced with the replica — never store pairing keys there. */
export function stripHubApiToken(hub, port = DEFAULT_PORT) {
    const file = path.join(hub, "api.json");
    atomicJson(file, {
        host: "127.0.0.1",
        port,
        protocol: 1,
        home: path.resolve(hub),
        updatedAt: new Date().toISOString(),
        note: "Pairing keys are per-library in the machine catalog (libraries.json), not this file.",
    });
}
export function formatLibrariesList(catalog) {
    return catalog.libraries
        .map((lib) => {
        const mark = lib.id === catalog.current ? "*" : " ";
        const dirs = lib.sourceDirs.length ? `  (${lib.sourceDirs.join(", ")})` : "";
        return `${mark} ${lib.id}  ${lib.displayName}${dirs}`;
    })
        .join("\n");
}
