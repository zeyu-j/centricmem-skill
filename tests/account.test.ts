/**
 * account.test.ts — website register, owner session, named pairing keys.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toImport = (p: string) => pathToFileURL(p).href;

const { initProject } = await import(toImport(path.join(distDir, "memory.js")));
const { listenHostServer } = await import(toImport(path.join(distDir, "host-server.js")));
const { bootstrapOwner, AccountError } = await import(toImport(path.join(distDir, "account.js")));
const { ensureProjectRegistered } = await import(toImport(path.join(distDir, "workspace.js")));

let tmpRoot: string;
let prevDump: string | undefined;
let prevResend: string | undefined;
let prevOrigin: string | undefined;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-acct-"));
  prevDump = process.env.CENTRICMEM_MAIL_DUMP;
  prevResend = process.env.CENTRICMEM_RESEND_API_KEY;
  prevOrigin = process.env.CENTRICMEM_APP_ORIGIN;
  delete process.env.CENTRICMEM_MAIL_DUMP;
  delete process.env.CENTRICMEM_RESEND_API_KEY;
  process.env.CENTRICMEM_APP_ORIGIN = "https://app.test";
});

after(() => {
  if (prevDump === undefined) delete process.env.CENTRICMEM_MAIL_DUMP;
  else process.env.CENTRICMEM_MAIL_DUMP = prevDump;
  if (prevResend === undefined) delete process.env.CENTRICMEM_RESEND_API_KEY;
  else process.env.CENTRICMEM_RESEND_API_KEY = prevResend;
  if (prevOrigin === undefined) delete process.env.CENTRICMEM_APP_ORIGIN;
  else process.env.CENTRICMEM_APP_ORIGIN = prevOrigin;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function hub(name: string): string {
  const home = path.join(tmpRoot, name);
  fs.mkdirSync(home, { recursive: true });
  initProject(home);
  return home;
}

const EMAIL = "operator@example.com";
const PASS = "operator-secret-1";

describe("account", { concurrency: 1 }, () => {
test("bootstrap refuses a second owner", () => {
  const home = hub("once");
  bootstrapOwner(home, EMAIL, PASS);
  assert.throws(
    () => bootstrapOwner(home, "other@example.com", "other-secret-1"),
    (err: unknown) => err instanceof AccountError && (err as { code: string }).code === "OWNER_EXISTS",
  );
});

test("POST /register creates the owner; a second register is 409", async () => {
  const home = hub("register");
  const server = await listenHostServer({ home, token: "r".repeat(32), port: 0, persist: false });
  try {
    const open = await fetch(`http://127.0.0.1:${server.port}/status`);
    assert.equal(open.status, 200);
    assert.equal((await open.json() as { registered: boolean }).registered, false);
    const created = await fetch(`http://127.0.0.1:${server.port}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    assert.equal(created.status, 200);
    const session = await created.json() as { token: string; email: string };
    assert.equal(session.email, EMAIL);
    assert.match(session.token, /^cm_sess_/);
    const again = await fetch(`http://127.0.0.1:${server.port}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "other-secret-1" }),
    });
    assert.equal(again.status, 409);
    const status = await fetch(`http://127.0.0.1:${server.port}/status`);
    assert.equal((await status.json() as { registered: boolean }).registered, true);
  } finally {
    await server.close();
  }
});

test("login session manages keys; pairing key cannot; revoke is 401", async () => {
  const home = hub("http");
  ensureProjectRegistered(home, "demo");
  bootstrapOwner(home, EMAIL, PASS);
  const inboxToken = "i".repeat(32);
  const server = await listenHostServer({ home, token: inboxToken, port: 0, persist: false });
  try {
    const login = await fetch(`http://127.0.0.1:${server.port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    assert.equal(login.status, 200);
    const session = await login.json() as { token: string; email: string };
    assert.equal(session.email, EMAIL);
    assert.match(session.token, /^cm_sess_/);

    const denied = await fetch(`http://127.0.0.1:${server.port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "wrong-password-1" }),
    });
    assert.equal(denied.status, 401);

    const pairingAccount = await fetch(`http://127.0.0.1:${server.port}/account`, {
      headers: { Authorization: `Bearer ${inboxToken}` },
    });
    assert.equal(pairingAccount.status, 403);

    const ownerHeaders = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };
    const minted = await fetch(`http://127.0.0.1:${server.port}/account/keys`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ library: "demo", name: "cursor-cloud" }),
    });
    assert.equal(minted.status, 200);
    const key = await minted.json() as { token: string; id: string; name: string };
    assert.equal(key.name, "cursor-cloud");
    assert.ok(key.token.length >= 32);

    const note = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "From named key", body: "stays in demo" }),
    });
    assert.equal(note.status, 200);

    const ownerNote = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ title: "Owner needs a library", body: "no" }),
    });
    assert.equal(ownerNote.status, 400);

    const ownerDemo = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ library: "demo", title: "Owner write", body: "picked demo" }),
    });
    assert.equal(ownerDemo.status, 200);

    const health = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(health.status, 200);

    const revoked = await fetch(`http://127.0.0.1:${server.port}/account/keys/revoke`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ library: "demo", id: key.id }),
    });
    assert.equal(revoked.status, 200);

    const after = await fetch(`http://127.0.0.1:${server.port}/note`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Revoked", body: "no" }),
    });
    assert.equal(after.status, 401);

    const inboxStill = await fetch(`http://127.0.0.1:${server.port}/health`, {
      headers: { Authorization: `Bearer ${inboxToken}` },
    });
    assert.equal(inboxStill.status, 200);
  } finally {
    await server.close();
  }
});

test("forgot password emails a link; reset replaces the password and sessions", async () => {
  const home = hub("reset");
  bootstrapOwner(home, EMAIL, PASS);
  const dump = path.join(tmpRoot, "reset-mail.json");
  process.env.CENTRICMEM_MAIL_DUMP = dump;
  const server = await listenHostServer({ home, token: "r".repeat(32), port: 0, persist: false });
  try {
    const silent = await fetch(`http://127.0.0.1:${server.port}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com" }),
    });
    assert.equal(silent.status, 200);
    assert.equal(fs.existsSync(dump), false);

    const asked = await fetch(`http://127.0.0.1:${server.port}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL }),
    });
    assert.equal(asked.status, 200);
    const mail = JSON.parse(fs.readFileSync(dump, "utf8")) as { to: string; text: string };
    assert.equal(mail.to, EMAIL);
    const token = /cm_rst_[a-f0-9]+/i.exec(mail.text)?.[0];
    assert.ok(token);

    const oldLogin = await fetch(`http://127.0.0.1:${server.port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    assert.equal(oldLogin.status, 200);

    const reset = await fetch(`http://127.0.0.1:${server.port}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: "brand-new-secret-1" }),
    });
    assert.equal(reset.status, 200);
    const session = await reset.json() as { token: string; email: string };
    assert.equal(session.email, EMAIL);
    assert.match(session.token, /^cm_sess_/);

    const stale = await fetch(`http://127.0.0.1:${server.port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    });
    assert.equal(stale.status, 401);

    const fresh = await fetch(`http://127.0.0.1:${server.port}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: "brand-new-secret-1" }),
    });
    assert.equal(fresh.status, 200);
  } finally {
    delete process.env.CENTRICMEM_MAIL_DUMP;
    await server.close();
  }
});

test("forgot password is 503 when mail is not configured", async () => {
  const home = hub("nomail");
  bootstrapOwner(home, EMAIL, PASS);
  delete process.env.CENTRICMEM_MAIL_DUMP;
  delete process.env.CENTRICMEM_RESEND_API_KEY;
  const server = await listenHostServer({ home, token: "n".repeat(32), port: 0, persist: false });
  try {
    const asked = await fetch(`http://127.0.0.1:${server.port}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL }),
    });
    assert.equal(asked.status, 503);
  } finally {
    await server.close();
  }
});
});
