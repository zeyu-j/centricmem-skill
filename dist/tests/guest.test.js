/**
 * guest.test.ts — remote librarian guests must not write leftover hubs.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toImport = (p) => pathToFileURL(p).href;
const { isLibrarianGuest, librarianGuestOrigin, guestHubWriteMessage } = await import(toImport(path.join(distDir, "guest.js")));
const { initProject } = await import(toImport(path.join(distDir, "memory.js")));
const { runDoctor } = await import(toImport(path.join(distDir, "doctor.js")));
const { runSetup } = await import(toImport(path.join(distDir, "setup.js")));
let tmpRoot;
const prevUrl = process.env.CENTRICMEM_URL;
const prevCat = process.env.CENTRICMEM_LIBRARIES_JSON;
function writeCatalog(file, extra = {}) {
    fs.writeFileSync(file, JSON.stringify({
        version: 1,
        hub: tmpRoot,
        port: 23180,
        current: "",
        libraries: [],
        ...extra,
    }) + "\n", "utf8");
}
before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-guest-"));
    delete process.env.CENTRICMEM_URL;
    process.env.CENTRICMEM_LIBRARIES_JSON = path.join(tmpRoot, "libraries.json");
    writeCatalog(process.env.CENTRICMEM_LIBRARIES_JSON);
});
after(() => {
    if (prevUrl === undefined)
        delete process.env.CENTRICMEM_URL;
    else
        process.env.CENTRICMEM_URL = prevUrl;
    if (prevCat === undefined)
        delete process.env.CENTRICMEM_LIBRARIES_JSON;
    else
        process.env.CENTRICMEM_LIBRARIES_JSON = prevCat;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});
test("https origin is a guest; loopback is not", () => {
    process.env.CENTRICMEM_URL = "https://mem.example.com";
    assert.equal(isLibrarianGuest(), true);
    assert.equal(librarianGuestOrigin(), "https://mem.example.com");
    assert.match(guestHubWriteMessage("note"), /leftover hub/);
    process.env.CENTRICMEM_URL = "http://127.0.0.1:23180";
    assert.equal(isLibrarianGuest(), false);
    assert.equal(librarianGuestOrigin(), null);
    delete process.env.CENTRICMEM_URL;
});
test("catalog origin is a guest when CENTRICMEM_URL is unset", () => {
    delete process.env.CENTRICMEM_URL;
    const token = "b".repeat(32);
    writeCatalog(process.env.CENTRICMEM_LIBRARIES_JSON, {
        origin: "https://mem.example.com",
        current: "demo",
        libraries: [
            {
                id: "demo",
                hub: tmpRoot,
                memDir: tmpRoot,
                sourceDirs: [],
                token,
                keys: [{ id: "k1", name: "cursor-windows", token, createdAt: new Date().toISOString() }],
                displayName: "demo",
            },
        ],
    });
    assert.equal(isLibrarianGuest(), true);
    assert.equal(librarianGuestOrigin(), "https://mem.example.com");
    writeCatalog(process.env.CENTRICMEM_LIBRARIES_JSON);
});
test("guest doctor lists catalog libraries, not leftover hub slugs", async () => {
    delete process.env.CENTRICMEM_URL;
    const leftover = path.join(tmpRoot, "leftover-hub");
    initProject(leftover);
    const wsFile = path.join(leftover, "workspace.json");
    const ws = JSON.parse(fs.readFileSync(wsFile, "utf8"));
    ws.projects["ancient-medicine"] = {
        path: "projects/ancient-medicine",
        linked_at: new Date().toISOString(),
    };
    fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2) + "\n");
    fs.mkdirSync(path.join(leftover, "projects", "ancient-medicine"), { recursive: true });
    const token = "a".repeat(32);
    writeCatalog(process.env.CENTRICMEM_LIBRARIES_JSON, {
        origin: "https://mem.example.com",
        current: "Academic",
        libraries: [
            {
                id: "Academic",
                hub: "/var/lib/centricmem",
                memDir: "/var/lib/centricmem",
                sourceDirs: [],
                token,
                keys: [{ id: "k1", name: "cursor-windows", token, createdAt: new Date().toISOString() }],
                displayName: "Academic",
            },
        ],
    });
    const r = await runDoctor(leftover, leftover, { skipLibrarianProbe: true });
    assert.deepEqual(r.libraries.map((row) => row.id), ["Academic"]);
    assert.ok(!r.libraries.some((row) => row.id === "ancient-medicine"));
    assert.ok(r.warnings.some((w) => /leftover CENTRICMEM_HOME is ignored for writes/i.test(w)));
    writeCatalog(process.env.CENTRICMEM_LIBRARIES_JSON);
});
test("guest setup bootstrap is refused", () => {
    process.env.CENTRICMEM_URL = "https://mem.example.com";
    const home = path.join(tmpRoot, "setup-home");
    const codeRoot = path.join(tmpRoot, "setup-code");
    fs.mkdirSync(codeRoot, { recursive: true });
    assert.throws(() => runSetup({ workspace: home, codeRoot, bootstrap: true }), /leftover hub/);
    delete process.env.CENTRICMEM_URL;
});
test("guest CLI note refuses the leftover hub", () => {
    const cli = path.join(distDir, "cli.js");
    const r = spawnSync(process.execPath, [cli, "note", "--title", "x", "--body", "y"], {
        encoding: "utf8",
        env: { ...process.env, CENTRICMEM_URL: "https://mem.example.com" },
        timeout: 15_000,
        windowsHide: true,
    });
    assert.notEqual(r.status, 0);
    assert.match(`${r.stderr}${r.stdout}`, /leftover hub/);
});
