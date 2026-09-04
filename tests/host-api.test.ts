/**
 * host-api.test.ts — loopback librarian verbs (Phase C).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toImport = (p: string) => pathToFileURL(p).href;

const { initProject, logDecision } = await import(toImport(path.join(distDir, "memory.js")));
const { listenHostServer } = await import(toImport(path.join(distDir, "host-server.js")));
const { handleHostVerb, HostApiError } = await import(toImport(path.join(distDir, "host-api.js")));

let tmpRoot: string;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-host-"));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function hub(name: string): string {
  const home = path.join(tmpRoot, name);
  fs.mkdirSync(home, { recursive: true });
  initProject(home);
  return home;
}

async function withServer<T>(
  home: string,
  fn: (port: number, token: string) => Promise<T>,
): Promise<T> {
  const token = "t".repeat(32);
  const server = await listenHostServer({ home, token, port: 0, persist: false });
  try {
    return await fn(server.port, token);
  } finally {
    await server.close();
  }
}

test("handleHostVerb health does not require a hub", async () => {
  const home = path.join(tmpRoot, "empty-health");
  fs.mkdirSync(home, { recursive: true });
  const r = await handleHostVerb({ verb: "health", home, query: {} });
  assert.equal((r as { ok: boolean }).ok, true);
  assert.equal((r as { protocol: number }).protocol, 1);
});

test("GET /health is 401 without a token and 200 with it", async () => {
  const home = hub("health");
  await withServer(home, async (port, token) => {
    const denied = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(denied.status, 401);
    const ok = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json() as { ok: boolean; protocol: number; home: string };
    assert.equal(body.ok, true);
    assert.equal(body.protocol, 1);
    assert.equal(path.resolve(body.home), path.resolve(home));
  });
});

test("GET /ambient then POST /note writes the same project Markdown", async () => {
  const home = hub("write");
  logDecision(home, { title: "Existing", context: "c", decision: "d" }, "unclassified");
  await withServer(home, async (port, token) => {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-CentricMem-Writer": "test-guest",
    };
    const ambient = await fetch(`http://127.0.0.1:${port}/ambient?project=unclassified`, { headers });
    assert.equal(ambient.status, 200);
    await ambient.json();
    const note = await fetch(`http://127.0.0.1:${port}/note`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Librarian HTTP note",
        body: "Guests write through the same logLesson handler.",
        tags: "host-api",
        project: "unclassified",
      }),
    });
    assert.equal(note.status, 200);
    const lessons = fs.readFileSync(path.join(home, "projects", "unclassified", "lessons.md"), "utf8");
    assert.match(lessons, /Librarian HTTP note/);
    const searchPost = await fetch(`http://127.0.0.1:${port}/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ q: "Librarian HTTP note", project: "unclassified" }),
    });
    assert.equal(searchPost.status, 200);
    const found = await searchPost.json() as { results?: Array<{ heading?: string }> };
    assert.ok((found.results || []).some((row) => (row.heading || "").includes("Librarian HTTP note")));
  });
});

test("POST /keep with bytes lands in imported/attach", async () => {
  const home = hub("keep");
  await withServer(home, async (port, token) => {
    const res = await fetch(`http://127.0.0.1:${port}/keep`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: "memo.txt",
        content: "original bytes",
        title: "Kept memo",
        project: "unclassified",
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { attach: string; stub: string };
    assert.match(body.attach, /^imported\/attach\//);
    const abs = path.join(home, "projects", "unclassified", ...body.attach.split("/"));
    assert.equal(fs.readFileSync(abs, "utf8"), "original bytes");
    const shown = await fetch(
      `http://127.0.0.1:${port}/show?file=${encodeURIComponent(body.stub)}&original=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(shown.status, 200);
    const ptr = await shown.json() as { original?: boolean; attach?: string; bytes?: number; text?: string };
    assert.equal(ptr.original, true);
    assert.equal(ptr.attach, body.attach);
    assert.equal(ptr.bytes, "original bytes".length);
    assert.equal((ptr.text || "").includes("original bytes"), false);
    const listed = await fetch(
      `http://127.0.0.1:${port}/search?q=${encodeURIComponent("Kept memo")}&project=unclassified`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(listed.status, 200);
    const hits = await listed.json() as { results?: Array<{ attach?: string; file?: string }> };
    const stubHit = (hits.results || []).find((row) => row.file === body.stub);
    assert.equal(stubHit?.attach, body.attach);
    const dl = await fetch(
      `http://127.0.0.1:${port}/download?file=${encodeURIComponent(body.stub)}&original=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(dl.status, 200);
    assert.equal(await dl.text(), "original bytes");
  });
});

test("wrong token never falls back to no-auth", async () => {
  const home = hub("auth");
  await withServer(home, async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/note`, {
      method: "POST",
      headers: { Authorization: "Bearer no", "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", body: "y" }),
    });
    assert.equal(res.status, 401);
    const lessons = path.join(home, "projects", "unclassified", "lessons.md");
    if (fs.existsSync(lessons)) {
      assert.doesNotMatch(fs.readFileSync(lessons, "utf8"), /^## x$/m);
    }
  });
});

test("search without a query is a HostApiError", async () => {
  const home = hub("search");
  await assert.rejects(
    () => handleHostVerb({ verb: "search", home, query: {} }),
    (err: unknown) => err instanceof HostApiError && Number((err as { http?: number }).http) === 400,
  );
});

test("a library pairing key cannot write into another library", async () => {
  const home = hub("iso");
  const { ensureProjectRegistered } = await import(toImport(path.join(distDir, "workspace.js")));
  const { ensureHubCatalog, tokenBindings } = await import(toImport(path.join(distDir, "libraries.js")));
  ensureProjectRegistered(home, "demo");
  const catalogFile = path.join(home, "libraries.json");
  const cat = ensureHubCatalog(home, { file: catalogFile });
  const demo = cat.libraries.find((l: { id: string }) => l.id === "demo");
  const inbox = cat.libraries.find((l: { id: string }) => l.id === "unclassified");
  assert.ok(demo && inbox);
  const server = await listenHostServer({
    home,
    libraries: tokenBindings(cat),
    port: 0,
    persist: false,
  });
  try {
    const headers = {
      Authorization: `Bearer ${demo.token}`,
      "Content-Type": "application/json",
    };
    const denied = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Cross", body: "no", project: "unclassified" }),
    });
    assert.equal(denied.status, 403);
    const body = await denied.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "LIBRARY_MISMATCH");
    const ok = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Own library note", body: "stays in demo" }),
    });
    assert.equal(ok.status, 200);
    const lessons = fs.readFileSync(path.join(home, "projects", "demo", "lessons.md"), "utf8");
    assert.match(lessons, /Own library note/);
    const inboxLessons = path.join(home, "projects", "unclassified", "lessons.md");
    if (fs.existsSync(inboxLessons)) {
      assert.doesNotMatch(fs.readFileSync(inboxLessons, "utf8"), /Own library note|Cross/);
    }
    const searchAll = await fetch(`http://127.0.0.1:${server.port}/search?q=Own&all=1`, { headers });
    assert.equal(searchAll.status, 200);
    const inboxWrite = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inbox.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Inbox note", body: "inbox only" }),
    });
    assert.equal(inboxWrite.status, 200);
  } finally {
    await server.close();
  }
});

test("GET /download sends the unit as an attachment", async () => {
  const home = hub("download");
  const logged = logDecision(home, { title: "Keep on disk", context: "c", decision: "d" }, "unclassified");
  const rel = path.relative(path.join(home, "projects", "unclassified"), path.resolve(home, logged.file)).replace(/\\/g, "/");
  await withServer(home, async (port, token) => {
    const res = await fetch(`http://127.0.0.1:${port}/download?file=${encodeURIComponent(rel)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") || "", /attachment/);
    const text = await res.text();
    assert.match(text, /Keep on disk/);
  });
});

test("POST /delete with a pairing key is forbidden", async () => {
  const home = hub("no-delete");
  const logged = logDecision(home, { title: "Stays", context: "c", decision: "d" }, "unclassified");
  const rel = path.relative(path.join(home, "projects", "unclassified"), path.resolve(home, logged.file)).replace(/\\/g, "/");
  const abs = path.resolve(home, logged.file);
  await withServer(home, async (port, token) => {
    const res = await fetch(`http://127.0.0.1:${port}/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file: rel, library: "unclassified" }),
    });
    assert.equal(res.status, 403);
    assert.equal(fs.existsSync(abs), true);
  });
});

test("handleHostVerb delete removes the file", async () => {
  const home = hub("delete-unit");
  const logged = logDecision(home, { title: "Gone", context: "c", decision: "d" }, "unclassified");
  const rel = path.relative(path.join(home, "projects", "unclassified"), path.resolve(home, logged.file)).replace(/\\/g, "/");
  const abs = path.resolve(home, logged.file);
  assert.equal(fs.existsSync(abs), true);
  const result = await handleHostVerb({
    verb: "delete",
    home,
    libraryId: "unclassified",
    scope: "owner",
    query: {},
    body: { file: rel },
  });
  assert.equal((result as { ok: boolean }).ok, true);
  assert.equal(fs.existsSync(abs), false);
  await assert.rejects(
    () => handleHostVerb({
      verb: "download",
      home,
      libraryId: "unclassified",
      query: { file: rel },
    }),
    (err: unknown) => err instanceof HostApiError && Number((err as { http?: number }).http) === 404,
  );
});

test("POST /keep with a server path is rejected", async () => {
  const home = hub("keep-path");
  const bait = path.join(home, "secret.txt");
  fs.writeFileSync(bait, "do not read");
  await withServer(home, async (port, token) => {
    const res = await fetch(`http://127.0.0.1:${port}/keep`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: bait, project: "unclassified" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "KEEP_PATH_REJECTED");
    const attachDir = path.join(home, "projects", "unclassified", "imported", "attach");
    if (fs.existsSync(attachDir)) {
      const names = fs.readdirSync(attachDir);
      assert.equal(names.length, 0);
    }
  });
});

test("note attach cannot point at a server path or escape imported/", async () => {
  const home = hub("attach-path");
  await assert.rejects(
    () => handleHostVerb({
      verb: "note",
      home,
      libraryId: "unclassified",
      query: {},
      body: { title: "x", body: "y", attach: path.join(home, "nope.txt") },
    }),
    (err: unknown) => err instanceof HostApiError && (err as { code?: string }).code === "ATTACH_PATH_REJECTED",
  );
  await assert.rejects(
    () => handleHostVerb({
      verb: "note",
      home,
      libraryId: "unclassified",
      query: {},
      body: { title: "x", body: "y", attach: "imported/../decisions/0001.md" },
    }),
    (err: unknown) => err instanceof HostApiError && (err as { code?: string }).code === "ATTACH_PATH_REJECTED",
  );
});

test("CORS does not reflect an unknown Origin", async () => {
  const home = hub("cors");
  const prev = process.env.CENTRICMEM_CORS_ORIGIN;
  process.env.CENTRICMEM_CORS_ORIGIN = "https://app.example";
  try {
    await withServer(home, async (port, token) => {
      const denied = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example" },
      });
      assert.equal(denied.headers.get("access-control-allow-origin"), null);
      const ok = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Authorization: `Bearer ${token}`, Origin: "https://app.example" },
      });
      assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.example");
    });
  } finally {
    if (prev === undefined) delete process.env.CENTRICMEM_CORS_ORIGIN;
    else process.env.CENTRICMEM_CORS_ORIGIN = prev;
  }
});

test("CENTRICMEM_URL with a path prefix keeps /api on verbs", async () => {
  const prev = process.env.CENTRICMEM_URL;
  process.env.CENTRICMEM_URL = "https://example.com/api";
  try {
    const { librarianBaseUrl, joinLibrarianUrl, healthUrl } = await import(toImport(path.join(distDir, "host-discover.js")));
    const base = librarianBaseUrl({ host: "127.0.0.1", port: 23180 });
    assert.equal(base, "https://example.com/api");
    assert.equal(joinLibrarianUrl(base, "/health"), "https://example.com/api/health");
    assert.equal(healthUrl({ host: "127.0.0.1", port: 23180 }), "https://example.com/api/health");
  } finally {
    if (prev === undefined) delete process.env.CENTRICMEM_URL;
    else process.env.CENTRICMEM_URL = prev;
  }
});

test("catalog origin is the guest librarian URL when env is unset", async () => {
  const prevUrl = process.env.CENTRICMEM_URL;
  const prevCat = process.env.CENTRICMEM_LIBRARIES_JSON;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-origin-"));
  const file = path.join(dir, "libraries.json");
  const token = "t".repeat(32);
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      hub: dir,
      port: 23180,
      current: "demo",
      origin: "https://mem.example.com",
      libraries: [
        {
          id: "demo",
          hub: dir,
          memDir: dir,
          sourceDirs: [],
          token,
          keys: [{ id: "k1", name: "cursor-windows", token, createdAt: new Date().toISOString() }],
          displayName: "demo",
        },
      ],
    }),
    "utf8",
  );
  delete process.env.CENTRICMEM_URL;
  process.env.CENTRICMEM_LIBRARIES_JSON = file;
  try {
    const { librarianBaseUrl, healthUrl } = await import(toImport(path.join(distDir, "host-discover.js")));
    assert.equal(librarianBaseUrl({ host: "127.0.0.1", port: 23180 }), "https://mem.example.com");
    assert.equal(healthUrl({ host: "127.0.0.1", port: 23180 }), "https://mem.example.com/health");
  } finally {
    if (prevUrl === undefined) delete process.env.CENTRICMEM_URL;
    else process.env.CENTRICMEM_URL = prevUrl;
    if (prevCat === undefined) delete process.env.CENTRICMEM_LIBRARIES_JSON;
    else process.env.CENTRICMEM_LIBRARIES_JSON = prevCat;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
