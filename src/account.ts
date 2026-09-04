/**
 * account.ts — website / Manager owner on a librarian hub.
 *
 * Pairing keys are per-library (libraries.ts). Humans register and sign in;
 * sessions are not agent tokens. One owner per librarian until multi-tenant.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { MailError, mailConfigured, sendMail } from "./mail.js";

export const OWNER_FILE = "owner.json";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_PREFIX = "cm_sess_";
export const RESET_PREFIX = "cm_rst_";
export const RESET_TTL_MS = 60 * 60 * 1000;
export const FORGOT_OK_MESSAGE = "If that email is the owner, we sent a reset link.";
const MAX_SESSIONS = 8;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

export class AccountError extends Error {
  constructor(
    public code: string,
    message: string,
    public http = 400,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

export interface OwnerSessionRow {
  id: string;
  hash: string;
  createdAt: string;
  expiresAt: string;
}

export interface OwnerReset {
  hash: string;
  expiresAt: string;
}

export interface OwnerRecord {
  version: 1;
  email: string;
  password: {
    salt: string;
    hash: string;
    n: number;
    r: number;
    p: number;
    keylen: number;
  };
  sessions: OwnerSessionRow[];
  reset?: OwnerReset;
}

export interface GuestSession {
  url: string;
  email: string;
  token: string;
  expiresAt: string;
}

function atomicJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  try {
    fs.renameSync(temp, file);
  } catch {
    fs.rmSync(file, { force: true });
    fs.renameSync(temp, file);
  }
}

function configDir(): string {
  if (process.platform === "win32") {
    const appdata =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "centricmem");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "centricmem");
}

export function ownerPath(home: string): string {
  return path.join(path.resolve(home), OWNER_FILE);
}

export function guestSessionPath(): string {
  if (process.env.CENTRICMEM_SESSION_JSON?.trim()) {
    return path.resolve(process.env.CENTRICMEM_SESSION_JSON.trim());
  }
  return path.join(configDir(), "owner-session.json");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function scryptHash(password: string, salt: Buffer, n = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P, keylen = KEYLEN): Buffer {
  return crypto.scryptSync(password, salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
}

function equalBuf(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function loadOwner(home: string): OwnerRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(ownerPath(home), "utf8")) as Partial<OwnerRecord>;
    if (raw.version !== 1 || typeof raw.email !== "string") return null;
    if (!raw.password || typeof raw.password.salt !== "string" || typeof raw.password.hash !== "string") {
      return null;
    }
    return {
      version: 1,
      email: normalizeEmail(raw.email),
      password: {
        salt: raw.password.salt,
        hash: raw.password.hash,
        n: Number(raw.password.n) || SCRYPT_N,
        r: Number(raw.password.r) || SCRYPT_R,
        p: Number(raw.password.p) || SCRYPT_P,
        keylen: Number(raw.password.keylen) || KEYLEN,
      },
      sessions: Array.isArray(raw.sessions) ? raw.sessions.filter((row) => row && typeof row.id === "string") : [],
      reset:
        raw.reset &&
        typeof raw.reset.hash === "string" &&
        typeof raw.reset.expiresAt === "string"
          ? { hash: raw.reset.hash, expiresAt: raw.reset.expiresAt }
          : undefined,
    };
  } catch {
    return null;
  }
}

function saveOwner(home: string, owner: OwnerRecord): void {
  atomicJson(ownerPath(home), {
    version: 1,
    email: owner.email,
    password: owner.password,
    sessions: owner.sessions,
    ...(owner.reset ? { reset: owner.reset } : {}),
  });
}

export function appOrigin(): string {
  return (process.env.CENTRICMEM_APP_ORIGIN?.trim() || "https://centricmem.com").replace(/\/+$/, "");
}

function setPasswordFields(password: string): OwnerRecord["password"] {
  if (password.length < 10) {
    throw new AccountError("WEAK_PASSWORD", "Password must be at least 10 characters.");
  }
  const salt = crypto.randomBytes(16);
  const hash = scryptHash(password, salt);
  return {
    salt: salt.toString("base64"),
    hash: hash.toString("base64"),
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    keylen: KEYLEN,
  };
}

export function hasOwner(home: string): boolean {
  return loadOwner(home) !== null;
}

export function bootstrapOwner(home: string, email: string, password: string): OwnerRecord {
  const resolved = path.resolve(home);
  if (loadOwner(resolved)) {
    throw new AccountError(
      "OWNER_EXISTS",
      "Owner already exists. There is no public register. Sign in instead.",
      409,
    );
  }
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized)) {
    throw new AccountError("BAD_EMAIL", "Email looks invalid.");
  }
  const owner: OwnerRecord = {
    version: 1,
    email: normalized,
    password: setPasswordFields(password),
    sessions: [],
  };
  saveOwner(resolved, owner);
  return owner;
}

export function registerOwner(
  home: string,
  email: string,
  password: string,
): { token: string; email: string; expiresAt: string } {
  bootstrapOwner(home, email, password);
  return loginOwner(home, email, password);
}

function passwordOk(owner: OwnerRecord, password: string): boolean {
  const salt = Buffer.from(owner.password.salt, "base64");
  const expected = Buffer.from(owner.password.hash, "base64");
  const got = scryptHash(
    password,
    salt,
    owner.password.n,
    owner.password.r,
    owner.password.p,
    owner.password.keylen,
  );
  return equalBuf(got, expected);
}

function pruneSessions(owner: OwnerRecord, now = Date.now()): void {
  owner.sessions = owner.sessions.filter((row) => Date.parse(row.expiresAt) > now);
  if (owner.sessions.length > MAX_SESSIONS) {
    owner.sessions.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    owner.sessions = owner.sessions.slice(-MAX_SESSIONS);
  }
}

export function loginOwner(
  home: string,
  email: string,
  password: string,
): { token: string; email: string; expiresAt: string } {
  const owner = loadOwner(home);
  const normalized = normalizeEmail(email);
  const ok = owner && owner.email === normalized && passwordOk(owner, password);
  if (!ok || !owner) {
    throw new AccountError("UNAUTHORIZED", "Email or password is wrong.", 401);
  }
  pruneSessions(owner);
  const id = crypto.randomBytes(8).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  owner.sessions.push({
    id,
    hash: crypto.createHash("sha256").update(secret).digest("hex"),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  saveOwner(home, owner);
  return {
    token: `${SESSION_PREFIX}${id}.${secret}`,
    email: owner.email,
    expiresAt: expires.toISOString(),
  };
}

export async function requestOwnerPasswordReset(home: string, email: string): Promise<void> {
  if (!mailConfigured()) {
    throw new AccountError("MAIL_UNAVAILABLE", "Password reset email is not configured.", 503);
  }
  const owner = loadOwner(home);
  const normalized = normalizeEmail(email);
  if (!owner || owner.email !== normalized) return;
  const token = `${RESET_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  owner.reset = {
    hash: crypto.createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  };
  saveOwner(home, owner);
  const link = `${appOrigin()}/reset?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: owner.email,
      subject: "Reset your CentricMem password",
      text: [
        "Reset your CentricMem owner password. This link expires in one hour.",
        "",
        link,
        "",
        "If you did not ask for this, ignore the email.",
      ].join("\n"),
    });
  } catch (error) {
    if (error instanceof MailError) {
      throw new AccountError(error.code, error.message, error.http);
    }
    throw error;
  }
}

export function resetOwnerPassword(
  home: string,
  token: string,
  password: string,
): { token: string; email: string; expiresAt: string } {
  const raw = token.trim();
  if (!raw.startsWith(RESET_PREFIX) || raw.length < RESET_PREFIX.length + 32) {
    throw new AccountError("UNAUTHORIZED", "Reset link is invalid or expired.", 401);
  }
  const owner = loadOwner(home);
  if (!owner?.reset) {
    throw new AccountError("UNAUTHORIZED", "Reset link is invalid or expired.", 401);
  }
  if (Date.parse(owner.reset.expiresAt) <= Date.now()) {
    delete owner.reset;
    saveOwner(home, owner);
    throw new AccountError("UNAUTHORIZED", "Reset link is invalid or expired.", 401);
  }
  const expected = Buffer.from(owner.reset.hash, "hex");
  const got = Buffer.from(crypto.createHash("sha256").update(raw).digest("hex"), "hex");
  if (!equalBuf(expected, got)) {
    throw new AccountError("UNAUTHORIZED", "Reset link is invalid or expired.", 401);
  }
  owner.password = setPasswordFields(password);
  delete owner.reset;
  owner.sessions = [];
  saveOwner(home, owner);
  return loginOwner(home, owner.email, password);
}

function parseSessionToken(token: string): { id: string; secret: string } | undefined {
  if (!token.startsWith(SESSION_PREFIX)) return undefined;
  const rest = token.slice(SESSION_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 8) return undefined;
  const id = rest.slice(0, dot);
  const secret = rest.slice(dot + 1);
  if (!/^[0-9a-f]+$/i.test(id) || !/^[0-9a-f]+$/i.test(secret) || secret.length < 32) {
    return undefined;
  }
  return { id, secret };
}

export function isSessionToken(token: string): boolean {
  return Boolean(parseSessionToken(token));
}

export function verifyOwnerSession(home: string, token: string): { email: string; sessionId: string } | undefined {
  const parsed = parseSessionToken(token);
  if (!parsed) return undefined;
  const owner = loadOwner(home);
  if (!owner) return undefined;
  const now = Date.now();
  const row = owner.sessions.find((s) => s.id === parsed.id);
  if (!row) return undefined;
  if (Date.parse(row.expiresAt) <= now) return undefined;
  const expected = Buffer.from(row.hash, "hex");
  const got = Buffer.from(crypto.createHash("sha256").update(parsed.secret).digest("hex"), "hex");
  if (!equalBuf(expected, got)) return undefined;
  return { email: owner.email, sessionId: row.id };
}

export function logoutOwnerSession(home: string, token: string): boolean {
  const parsed = parseSessionToken(token);
  if (!parsed) return false;
  const owner = loadOwner(home);
  if (!owner) return false;
  const before = owner.sessions.length;
  owner.sessions = owner.sessions.filter((s) => s.id !== parsed.id);
  if (owner.sessions.length === before) return false;
  saveOwner(home, owner);
  return true;
}

export function saveGuestSession(session: GuestSession): void {
  atomicJson(guestSessionPath(), {
    url: session.url.replace(/\/+$/, ""),
    email: session.email,
    token: session.token,
    expiresAt: session.expiresAt,
  });
}

export function loadGuestSession(): GuestSession | null {
  try {
    const raw = JSON.parse(fs.readFileSync(guestSessionPath(), "utf8")) as Partial<GuestSession>;
    if (typeof raw.url !== "string" || typeof raw.email !== "string" || typeof raw.token !== "string") {
      return null;
    }
    if (typeof raw.expiresAt === "string" && Date.parse(raw.expiresAt) <= Date.now()) return null;
    return {
      url: raw.url.replace(/\/+$/, ""),
      email: raw.email,
      token: raw.token,
      expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : "",
    };
  } catch {
    return null;
  }
}

export function clearGuestSession(): void {
  try {
    fs.rmSync(guestSessionPath(), { force: true });
  } catch {
    /* ignore */
  }
}

export async function accountFetch(
  url: string,
  token: string | undefined,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const origin = url.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${origin}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}
