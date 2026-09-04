/**
 * r2.test.ts — presigned keep against an in-process S3-compatible mock (no real Cloudflare).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toImport = (p: string) => pathToFileURL(p).href;

const { initProject, logDecision } = await import(toImport(path.join(distDir, "memory.js")));
const { listenHostServer } = await import(toImport(path.join(distDir, "host-server.js")));

let tmpRoot: string;
const prev: Record<string, string | undefined> = {};

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-r2-"));
  for (const k of [
    "CENTRICMEM_R2_ACCOUNT_ID",
    "CENTRICMEM_R2_ACCESS_KEY_ID",
    "CENTRICMEM_R2_SECRET_ACCESS_KEY",
    "CENTRICMEM_R2_BUCKET",
    "CENTRICMEM_R2_ENDPOINT",
    "CENTRICMEM_R2_REGION",
  ]) {
    prev[k] = process.env[k];
  }
});

after(() => {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function hub(name: string): string {
  const home = path.join(tmpRoot, name);
  fs.mkdirSync(home, { recursive: true });
  initProject(home);
  return home;
}

function startMock(): Promise<{ port: number; objects: Map<string, Buffer>; close: () => Promise<void> }> {
  const objects = new Map<string, Buffer>();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    const key = parts.slice(1).join("/");
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "PUT") {
        objects.set(key, Buffer.concat(chunks));
        res.writeHead(200);
        res.end();
        return;
      }
      const body = objects.get(key);
      if (req.method === "HEAD") {
        if (!body) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Length": String(body.length) });
        res.end();
        return;
      }
      if (req.method === "GET") {
        if (!body) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Length": String(body.length) });
        res.end(body);
        return;
      }
      if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(405);
      res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr !== "object") {
        reject(new Error("mock bind failed"));
        return;
      }
      resolve({
        port: addr.port,
        objects,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test("POST /keep/sign is 503 when R2 env is missing", async () => {
  delete process.env.CENTRICMEM_R2_ACCOUNT_ID;
  delete process.env.CENTRICMEM_R2_ACCESS_KEY_ID;
  delete process.env.CENTRICMEM_R2_SECRET_ACCESS_KEY;
  delete process.env.CENTRICMEM_R2_BUCKET;
  const home = hub("no-r2");
  const token = "t".repeat(32);
  const server = await listenHostServer({ home, token, port: 0, persist: false });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/keep/sign`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "a.jsonl", project: "unclassified" }),
    });
    assert.equal(res.status, 503);
    const body = await res.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, "R2_NOT_CONFIGURED");
  } finally {
    await server.close();
  }
});

test("presign PUT then keep uploadId stores bytes in R2 not on the hub disk", async () => {
  const mock = await startMock();
  process.env.CENTRICMEM_R2_ACCOUNT_ID = "testacct";
  process.env.CENTRICMEM_R2_ACCESS_KEY_ID = "AKIAEXAMPLE";
  process.env.CENTRICMEM_R2_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
  process.env.CENTRICMEM_R2_BUCKET = "cm";
  process.env.CENTRICMEM_R2_REGION = "auto";
  process.env.CENTRICMEM_R2_ENDPOINT = `http://127.0.0.1:${mock.port}`;
  const home = hub("with-r2");
  const token = "t".repeat(32);
  const server = await listenHostServer({ home, token, port: 0, persist: false });
  try {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const sign = await fetch(`http://127.0.0.1:${server.port}/keep/sign`, {
      method: "POST",
      headers,
      body: JSON.stringify({ filename: "thread.jsonl", title: "R2 thread", project: "unclassified" }),
    });
    assert.equal(sign.status, 200);
    const signed = await sign.json() as {
      uploadId: string;
      putUrl: string;
      headers: Record<string, string>;
      attach: string;
      stub?: string;
    };
    assert.match(signed.attach, /^imported\/attach\//);
    const put = await fetch(signed.putUrl, {
      method: "PUT",
      headers: signed.headers,
      body: "jsonl-bytes",
    });
    assert.equal(put.status, 200);
    const done = await fetch(`http://127.0.0.1:${server.port}/keep`, {
      method: "POST",
      headers,
      body: JSON.stringify({ uploadId: signed.uploadId, project: "unclassified" }),
    });
    assert.equal(done.status, 200);
    const kept = await done.json() as { stub: string; attach: string; store: string };
    assert.equal(kept.store, "r2");
    const onDisk = path.join(home, "projects", "unclassified", ...kept.attach.split("/"));
    assert.equal(fs.existsSync(onDisk), false);
    const stubAbs = path.join(home, "projects", "unclassified", ...kept.stub.split("/"));
    assert.match(fs.readFileSync(stubAbs, "utf8"), /Attach/);
    const logged = kept.stub;
    const orig = await fetch(
      `http://127.0.0.1:${server.port}/download?file=${encodeURIComponent(logged)}&original=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(orig.status, 200);
    assert.equal(await orig.text(), "jsonl-bytes");
  } finally {
    await server.close();
    await mock.close();
  }
});

test("fillAttachFromDir PUTs imported/attach names and skips matching HEAD", async () => {
  const mock = await startMock();
  process.env.CENTRICMEM_R2_ACCOUNT_ID = "testacct";
  process.env.CENTRICMEM_R2_ACCESS_KEY_ID = "AKIAEXAMPLE";
  process.env.CENTRICMEM_R2_SECRET_ACCESS_KEY = "secret";
  process.env.CENTRICMEM_R2_BUCKET = "cm";
  process.env.CENTRICMEM_R2_REGION = "auto";
  process.env.CENTRICMEM_R2_ENDPOINT = `http://127.0.0.1:${mock.port}`;
  const { fillAttachFromDir } = await import(toImport(path.join(distDir, "r2.js")));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-fill-"));
  const src = path.join(dir, "thread.jsonl");
  try {
    fs.writeFileSync(src, "hello-jsonl");
    const first = await fillAttachFromDir({ libraryId: "Academic", dir, deleteSource: true, concurrency: 1 });
    assert.equal(first.scanned, 1);
    assert.equal(first.uploaded, 1);
    assert.equal(first.deleted, 1);
    assert.equal(fs.existsSync(src), false);
    assert.equal(mock.objects.get("Academic/imported/attach/thread.jsonl")?.toString(), "hello-jsonl");
    fs.writeFileSync(src, "hello-jsonl");
    const second = await fillAttachFromDir({ libraryId: "Academic", dir, concurrency: 1 });
    assert.equal(second.uploaded, 0);
    assert.equal(second.skipped, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await mock.close();
  }
});

test("GET /health reports r2 true when configured", async () => {
  const mock = await startMock();
  process.env.CENTRICMEM_R2_ACCOUNT_ID = "testacct";
  process.env.CENTRICMEM_R2_ACCESS_KEY_ID = "AKIAEXAMPLE";
  process.env.CENTRICMEM_R2_SECRET_ACCESS_KEY = "secret";
  process.env.CENTRICMEM_R2_BUCKET = "cm";
  process.env.CENTRICMEM_R2_ENDPOINT = `http://127.0.0.1:${mock.port}`;
  const home = hub("health-r2");
  logDecision(home, { title: "x", context: "c", decision: "d" }, "unclassified");
  const token = "t".repeat(32);
  const server = await listenHostServer({ home, token, port: 0, persist: false });
  try {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json() as { r2: boolean };
    assert.equal(body.r2, true);
  } finally {
    await server.close();
    await mock.close();
  }
});
