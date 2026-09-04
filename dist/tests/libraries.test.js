/**
 * libraries.test.ts — one pairing key per library, wrap-in-place catalog.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toImport = (p) => pathToFileURL(p).href;
const { initProject } = await import(toImport(path.join(distDir, "memory.js")));
const { ensureProjectRegistered } = await import(toImport(path.join(distDir, "workspace.js")));
const { addLibraryKey, createLibrary, ensureHubCatalog, findLibraryByToken, librariesJsonPath, linkCwdToLibrary, loadCatalog, matchLibraryByCwd, revokeLibraryKey, rotateLibraryToken, saveCatalog, } = await import(toImport(path.join(distDir, "libraries.js")));
let tmpRoot;
let prevCatalog;
before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-lib-"));
    prevCatalog = process.env.CENTRICMEM_LIBRARIES_JSON;
});
after(() => {
    if (prevCatalog === undefined)
        delete process.env.CENTRICMEM_LIBRARIES_JSON;
    else
        process.env.CENTRICMEM_LIBRARIES_JSON = prevCatalog;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});
function hub(name) {
    const home = path.join(tmpRoot, name);
    fs.mkdirSync(home, { recursive: true });
    initProject(home);
    const catalog = path.join(home, "libraries.json");
    process.env.CENTRICMEM_LIBRARIES_JSON = catalog;
    return home;
}
test("ensureHubCatalog wraps workspace slugs and preserves tokens", () => {
    const home = hub("wrap");
    ensureProjectRegistered(home, "demo");
    const first = ensureHubCatalog(home);
    assert.ok(first.libraries.some((l) => l.id === "unclassified"));
    assert.ok(first.libraries.some((l) => l.id === "demo"));
    const inbox = first.libraries.find((l) => l.id === "unclassified");
    const token = inbox.token;
    const second = ensureHubCatalog(home);
    assert.equal(second.libraries.find((l) => l.id === "unclassified").token, token);
    assert.equal(path.resolve(loadCatalog().hub), path.resolve(home));
    assert.equal(librariesJsonPath(), path.resolve(home, "libraries.json"));
});
test("cwd match and token lookup select the linked library", () => {
    const home = hub("cwd");
    const code = path.join(tmpRoot, "code-demo");
    fs.mkdirSync(code, { recursive: true });
    const lib = linkCwdToLibrary(home, code);
    const cat = loadCatalog();
    assert.equal(matchLibraryByCwd(code, cat)?.id, lib.id);
    assert.equal(findLibraryByToken(lib.token, cat)?.id, lib.id);
});
test("rotateLibraryToken changes only that library", () => {
    const home = hub("rotate");
    ensureProjectRegistered(home, "a");
    ensureProjectRegistered(home, "b");
    const cat = ensureHubCatalog(home);
    const a0 = cat.libraries.find((l) => l.id === "a").token;
    const b0 = cat.libraries.find((l) => l.id === "b").token;
    const rotated = rotateLibraryToken("a");
    assert.notEqual(rotated.token, a0);
    assert.equal(loadCatalog().libraries.find((l) => l.id === "b").token, b0);
});
test("createLibrary mints a folder and a new key", () => {
    const home = hub("create");
    const lib = createLibrary(home, "papers");
    assert.equal(lib.id, "papers");
    assert.ok(lib.token.length >= 32);
    assert.ok(fs.existsSync(path.join(home, "projects", "papers")));
});
test("a library can hold a second named key; revoke leaves the other", () => {
    const home = hub("keys");
    ensureProjectRegistered(home, "demo");
    const cat = ensureHubCatalog(home);
    const primary = cat.libraries.find((l) => l.id === "demo");
    assert.ok(primary);
    const extra = addLibraryKey("demo", "friend");
    assert.notEqual(extra.token, primary.token);
    assert.equal(findLibraryByToken(extra.token)?.id, "demo");
    assert.equal(findLibraryByToken(primary.token)?.id, "demo");
    revokeLibraryKey("demo", extra.id);
    assert.equal(findLibraryByToken(extra.token), undefined);
    assert.equal(findLibraryByToken(primary.token)?.id, "demo");
    assert.equal(loadCatalog().libraries.find((l) => l.id === "demo").token, primary.token);
});
test("guest catalog origin survives ensureHubCatalog", () => {
    const home = hub("origin");
    const first = ensureHubCatalog(home);
    first.origin = "https://mem.example.com";
    saveCatalog(first);
    const second = ensureHubCatalog(home);
    assert.equal(second.origin, "https://mem.example.com");
    assert.equal(loadCatalog().origin, "https://mem.example.com");
});
