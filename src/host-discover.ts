/**
 * host-discover.ts — find the local librarian (loopback API + token).
 * Token files are machine-local; do not sync them with projects/.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { productHomePointerPath, getProductHome } from "./core.js";
import { cliVersion } from "./skill.js";
import { findLibraryById, loadCatalog, matchLibraryByCwd } from "./libraries.js";
import { isR2Enabled } from "./r2.js";

export const HOST_PROTOCOL = 1;
export const DEFAULT_HOST_PORT = 23180;
export const MAX_HOST_PORT = 23220;
export const MIN_SKILL_VERSION = "0.21.0";

export interface HostLibraryRef {
  id: string;
  displayName: string;
  token: string;
}

export interface HostApiManifest {
  host: string;
  port: number;
  token: string;
  protocol: number;
  pid?: number;
  home?: string;
  library?: string;
  libraries?: HostLibraryRef[];
  updatedAt: string;
}

export interface LibrarianProbe {
  listening: boolean;
  auth: "ok" | "unauthorized" | "missing_token" | "unreachable";
  port?: number;
  host: string;
  protocol?: number;
  cli_version?: string;
  error?: string;
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

export function generateHostToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function userApiJsonPath(): string {
  if (process.platform === "win32") {
    const appdata =
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "centricmem", "api.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "centricmem", "api.json");
}

export function hubApiJsonPath(home: string): string {
  return path.join(home, "api.json");
}

export function apiJsonCandidates(home?: string): string[] {
  const resolvedHome = home?.trim() || (() => {
    try {
      return getProductHome();
    } catch {
      return "";
    }
  })();
  const out: string[] = [];
  if (resolvedHome) out.push(hubApiJsonPath(resolvedHome));
  out.push(userApiJsonPath());
  const pointer = productHomePointerPath();
  const pointerDir = path.dirname(pointer);
  const besidePointer = path.join(pointerDir, "api.json");
  if (!out.includes(besidePointer)) out.push(besidePointer);
  return [...new Set(out.map((p) => path.resolve(p)))];
}

function manifestFromLibrary(
  cat: NonNullable<ReturnType<typeof loadCatalog>>,
  lib: NonNullable<ReturnType<typeof findLibraryById>>,
): HostApiManifest {
  return {
    host: "127.0.0.1",
    port: cat.port,
    token: lib.token,
    protocol: HOST_PROTOCOL,
    home: cat.hub,
    library: lib.id,
    updatedAt: "",
    libraries: cat.libraries.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      token: row.token,
    })),
  };
}

function catalogLibrarianOrigin(): string | null {
  try {
    const origin = loadCatalog()?.origin?.trim().replace(/\/+$/, "");
    return origin && /^https?:\/\//i.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

function envLibrarianOrigin(): { host: string; port: number; protocol: "http" | "https"; basePath: string } | null {
  const raw = process.env.CENTRICMEM_URL?.trim() || catalogLibrarianOrigin();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `http://${raw}`);
    const protocol = u.protocol === "https:" ? "https" : "http";
    const port = u.port ? parseInt(u.port, 10) : protocol === "https" ? 443 : 80;
    if (!u.hostname || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    const basePath = u.pathname.replace(/\/+$/, "");
    return { host: u.hostname, port, protocol, basePath: basePath === "/" ? "" : basePath };
  } catch {
    return null;
  }
}

function withEnvLibrarian(manifest: HostApiManifest): HostApiManifest {
  const origin = envLibrarianOrigin();
  const token = process.env.CENTRICMEM_TOKEN?.trim();
  return {
    ...manifest,
    host: origin?.host ?? manifest.host,
    port: origin?.port ?? manifest.port,
    token: token || manifest.token,
  };
}

function envOnlyManifest(): HostApiManifest | null {
  const origin = envLibrarianOrigin();
  const token = process.env.CENTRICMEM_TOKEN?.trim();
  if (!origin || !token) return null;
  return {
    host: origin.host,
    port: origin.port,
    token,
    protocol: HOST_PROTOCOL,
    library: process.env.CENTRICMEM_PROJECT?.trim() || undefined,
    updatedAt: "",
  };
}

/** Pick the pairing key for this cwd / library id. Catalog wins over a single api.json token. */
export function resolveGuestManifest(opts?: { library?: string; cwd?: string; home?: string }): HostApiManifest | null {
  const cat = loadCatalog();
  if (cat && (!opts?.home || path.resolve(cat.hub) === path.resolve(opts.home))) {
    const pin = opts?.library?.trim() || process.env.CENTRICMEM_PROJECT?.trim();
    const lib =
      (pin ? findLibraryById(pin, cat) : undefined) ||
      (opts?.cwd ? matchLibraryByCwd(opts.cwd, cat) : undefined) ||
      matchLibraryByCwd(process.cwd(), cat) ||
      findLibraryById(cat.current, cat) ||
      cat.libraries[0];
    if (lib) return withEnvLibrarian(manifestFromLibrary(cat, lib));
  }
  return readApiManifest(opts?.home) ?? envOnlyManifest();
}

export function readApiManifest(home?: string): HostApiManifest | null {
  const cat = loadCatalog();
  if (cat && (!home || path.resolve(cat.hub) === path.resolve(home))) {
    const pin = process.env.CENTRICMEM_PROJECT?.trim();
    const lib =
      (pin ? findLibraryById(pin, cat) : undefined) ||
      matchLibraryByCwd(process.cwd(), cat) ||
      findLibraryById(cat.current, cat) ||
      cat.libraries[0];
    if (lib) return withEnvLibrarian(manifestFromLibrary(cat, lib));
  }
  for (const file of apiJsonCandidates(home)) {
    const parsed = readApiManifestFile(file);
    if (parsed) return withEnvLibrarian(parsed);
  }
  return envOnlyManifest();
}

export function readApiManifestFile(file: string): HostApiManifest | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<HostApiManifest>;
    const host = typeof raw.host === "string" && raw.host.trim() ? raw.host.trim() : "127.0.0.1";
    const port = Number(raw.port);
    const token = typeof raw.token === "string" ? raw.token.trim() : "";
    const protocol = Number(raw.protocol) || HOST_PROTOCOL;
    if (!token || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (host !== "127.0.0.1" && host !== "localhost") return null;
    return {
      host: "127.0.0.1",
      port,
      token,
      protocol,
      pid: typeof raw.pid === "number" ? raw.pid : undefined,
      home: typeof raw.home === "string" ? raw.home : undefined,
      library: typeof raw.library === "string" ? raw.library : undefined,
      libraries: Array.isArray(raw.libraries)
        ? raw.libraries
            .filter((row): row is HostLibraryRef =>
              Boolean(row && typeof row === "object" && typeof (row as HostLibraryRef).id === "string" && typeof (row as HostLibraryRef).token === "string"),
            )
            .map((row) => ({
              id: String(row.id),
              displayName: typeof (row as { displayName?: string }).displayName === "string"
                ? (row as { displayName: string }).displayName
                : String(row.id),
              token: String(row.token),
            }))
        : undefined,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeApiManifest(manifest: HostApiManifest, extraPaths: string[] = []): void {
  const files = [userApiJsonPath(), ...extraPaths].map((p) => path.resolve(p));
  const unique = [...new Set(files.filter(Boolean))];
  for (const file of unique) {
    atomicJson(file, {
      host: "127.0.0.1",
      port: manifest.port,
      token: manifest.token,
      protocol: manifest.protocol,
      pid: manifest.pid,
      home: manifest.home,
      library: manifest.library,
      libraries: manifest.libraries,
      updatedAt: manifest.updatedAt,
    });
  }
}

export function librarianBaseUrl(manifest: Pick<HostApiManifest, "host" | "port">): string {
  const origin = envLibrarianOrigin();
  if (origin) {
    const hidePort =
      (origin.protocol === "http" && origin.port === 80) ||
      (origin.protocol === "https" && origin.port === 443);
    return hidePort
      ? `${origin.protocol}://${origin.host}${origin.basePath}`
      : `${origin.protocol}://${origin.host}:${origin.port}${origin.basePath}`;
  }
  const host = (manifest.host || "127.0.0.1").trim();
  if (host === "127.0.0.1" || host === "localhost") {
    return `http://127.0.0.1:${manifest.port}`;
  }
  return `http://${host}:${manifest.port}`;
}

/** Join a verb like `/health` onto a base that may include a path (`https://host/api`). */
export function joinLibrarianUrl(base: string, verbPath: string): string {
  const origin = base.replace(/\/+$/, "");
  if (!verbPath) return origin;
  if (/^https?:\/\//i.test(verbPath)) return verbPath;
  const path = verbPath.startsWith("/") ? verbPath : `/${verbPath}`;
  return `${origin}${path}`;
}

export function healthUrl(manifest: Pick<HostApiManifest, "host" | "port">): string {
  return joinLibrarianUrl(librarianBaseUrl(manifest), "/health");
}

function probeTarget(manifest?: HostApiManifest | null): {
  host: string;
  port: number;
  timeoutMs: number;
} {
  const origin = envLibrarianOrigin();
  if (origin) {
    return {
      host: origin.host,
      port: origin.port,
      timeoutMs: origin.protocol === "https" ? 4000 : 800,
    };
  }
  return {
    host: manifest?.host || "127.0.0.1",
    port: manifest?.port ?? DEFAULT_HOST_PORT,
    timeoutMs: 800,
  };
}

export async function probeLibrarian(manifest?: HostApiManifest | null): Promise<LibrarianProbe> {
  const found = manifest ?? readApiManifest();
  const target = probeTarget(found);
  if (!found) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEFAULT_HOST_PORT}/health`, {
        signal: AbortSignal.timeout(400),
      });
      if (res.status === 401) {
        return { listening: true, auth: "missing_token", port: DEFAULT_HOST_PORT, host: "127.0.0.1" };
      }
    } catch {
      /* unreachable */
    }
    return { listening: false, auth: "unreachable", host: target.host, port: target.port };
  }
  try {
    const res = await fetch(healthUrl(found), {
      headers: { Authorization: `Bearer ${found.token}` },
      signal: AbortSignal.timeout(target.timeoutMs),
    });
    if (res.status === 401) {
      return { listening: true, auth: "unauthorized", port: target.port, host: target.host };
    }
    if (!res.ok) {
      return {
        listening: true,
        auth: "unauthorized",
        port: target.port,
        host: target.host,
        error: `HTTP ${res.status}`,
      };
    }
    const body = (await res.json()) as {
      protocol?: number;
      cli_version?: string;
    };
    return {
      listening: true,
      auth: "ok",
      port: target.port,
      host: target.host,
      protocol: body.protocol,
      cli_version: body.cli_version,
    };
  } catch (error) {
    return {
      listening: false,
      auth: "unreachable",
      port: target.port,
      host: target.host,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function librarianRequest(
  verbPath: string,
  init: RequestInit & { manifest?: HostApiManifest | null; library?: string } = {},
): Promise<Response> {
  const manifest = init.manifest ?? resolveGuestManifest({ library: init.library });
  if (!manifest) {
    throw new Error("Librarian unreachable. Do not create a hub.");
  }
  const url = new URL(joinLibrarianUrl(librarianBaseUrl(manifest), verbPath));
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${manifest.token}`);
  }
  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Librarian unreachable. Do not create a hub.");
  }
}

export function healthPayload(home: string): {
  ok: true;
  protocol: number;
  cli_version: string;
  min_skill: string;
  home: string;
  r2: boolean;
} {
  return {
    ok: true,
    protocol: HOST_PROTOCOL,
    cli_version: cliVersion(),
    min_skill: MIN_SKILL_VERSION,
    home,
    r2: isR2Enabled(),
  };
}
