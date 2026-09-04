/**
 * doctor.ts — CLI / hub / skill / librarian / cwd-project preflight.
 */
import fs from "node:fs";
import path from "node:path";
import { looksLikeClientFolder, resolveProductHome } from "./core.js";
import { cliVersion, skillStatus, packageRoot, type SkillStatus } from "./skill.js";
import { getCurrentProjectSlug, isWorkspace, loadWorkspace, matchProjectByCwd } from "./workspace.js";
import { probeLibrarian, type LibrarianProbe } from "./host-discover.js";
import { ensureHubCatalog, loadCatalog, matchLibraryByCwd, type LibraryRecord } from "./libraries.js";
import { isLibrarianGuest, librarianGuestOrigin } from "./guest.js";

export interface DoctorReport {
  ok: boolean;
  cli_version: string;
  client: string;
  home: string;
  home_source: string;
  home_env: boolean;
  initialized: boolean;
  skill_status: SkillStatus | "uninitialized";
  cwd: string;
  project: string | null;
  library: string | null;
  libraries: { id: string; displayName: string }[];
  cwd_match: string | null;
  workspace_current: string | null;
  hub_writable: boolean;
  librarian: LibrarianProbe;
  errors: string[];
  warnings: string[];
}

export async function runDoctor(
  workspaceRoot?: string | null,
  cwd: string = process.cwd(),
  opts?: { skipLibrarianProbe?: boolean },
): Promise<DoctorReport> {
  const resolved = resolveProductHome();
  const home = workspaceRoot?.trim() || resolved.home;
  const home_env = !!(process.env.CENTRICMEM_HOME || process.env.CENTRICMEM_WORKSPACE);
  const initialized = isWorkspace(home);
  const errors: string[] = [];
  const warnings: string[] = [];
  const client = packageRoot();
  let hub_writable = false;
  try {
    fs.accessSync(home, fs.constants.W_OK);
    hub_writable = true;
  } catch {
    hub_writable = false;
  }

  if (looksLikeClientFolder(home)) {
    errors.push(
      `Library is the CentricMem client folder (${home}). Choose a memory library: centricmem setup --workspace <path> --persist-home --migrate-home`,
    );
  }
  const guest = isLibrarianGuest();
  const guestOrigin = librarianGuestOrigin();
  if (guest) {
    warnings.push(
      `Guest of ${guestOrigin} — leftover CENTRICMEM_HOME is ignored for writes. Do not start a local Manager listen.`,
    );
  }
  if (resolved.source === "env-client-ignored" && !workspaceRoot?.trim()) {
    warnings.push(
      `This shell still has CENTRICMEM_HOME pointing at the client; using the library pointer. Restart the terminal/Cursor so the user env matches.`,
    );
  }
  if (resolved.source === "default" && !workspaceRoot?.trim()) {
    warnings.push(
      `Library is the default ~/.centricmem. To put memory on another drive: centricmem setup --workspace <path> --persist-home`,
    );
  }
  if (!hub_writable) {
    warnings.push(`Library is not writable (${home}) — sandbox or permissions; ambient stdout still works, writes need the librarian or a writable home.`);
  }

  let skill_status: SkillStatus | "uninitialized" = "uninitialized";
  let project: string | null = null;
  let library: string | null = null;
  let libraries: { id: string; displayName: string }[] = [];
  let cwd_match: string | null = null;
  let workspace_current: string | null = null;

  if (!initialized && !guest) {
    errors.push(`hub uninitialized at ${home} — centricmem setup --bootstrap --workspace <library-path> --persist-home`);
  } else if (guest) {
    const cat = loadCatalog();
    if (cat) {
      libraries = cat.libraries.map((row: LibraryRecord) => ({
        id: row.id,
        displayName: row.displayName,
      }));
      const pin = process.env.CENTRICMEM_PROJECT?.trim();
      library = (pin && cat.libraries.some((row) => row.id === pin) ? pin : undefined)
        ?? matchLibraryByCwd(cwd, cat)?.id
        ?? cat.current
        ?? cat.libraries[0]?.id
        ?? null;
      cwd_match = matchLibraryByCwd(cwd, cat)?.id ?? null;
      workspace_current = cat.current;
      project = library;
    }
    if (initialized) {
      const skill = skillStatus(home);
      skill_status = skill.status;
      if (skill.status === "missing" || skill.status === "incompatible") {
        errors.push(skill.hint ?? `skill ${skill.status}`);
      } else if (skill.status === "outdated" || skill.status === "modified") {
        warnings.push(skill.hint ?? `skill ${skill.status}`);
      }
    } else {
      skill_status = "ok";
    }
    if (!cwd_match) {
      warnings.push(
        `cwd not linked in the guest catalog (${cwd}) — HTTP uses Inbox or CENTRICMEM_PROJECT.`,
      );
    }
  } else {
    const skill = skillStatus(home);
    skill_status = skill.status;
    if (skill.status === "missing" || skill.status === "incompatible") {
      errors.push(skill.hint ?? `skill ${skill.status}`);
    } else if (skill.status === "outdated" || skill.status === "modified") {
      warnings.push(skill.hint ?? `skill ${skill.status}`);
    }
    try {
      const ws = loadWorkspace(home);
      workspace_current = ws.current;
      cwd_match = matchProjectByCwd(home, cwd);
      project = getCurrentProjectSlug(home, cwd);
      try {
        const cat = ensureHubCatalog(home);
        libraries = cat.libraries.map((row: LibraryRecord) => ({
          id: row.id,
          displayName: row.displayName,
        }));
        library = matchLibraryByCwd(cwd, cat)?.id ?? project;
      } catch {
        library = project;
      }
      if (!cwd_match) {
        warnings.push(
          `cwd not linked (${cwd}) — writes go to the Inbox library; workspace.current=${workspace_current}; centricmem setup --link <cwd> or CENTRICMEM_PROJECT=<library>`,
        );
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (!guest && !fs.existsSync(path.join(home, "workspace.json")) && initialized) {
    errors.push("workspace.json missing");
  }

  const librarian = opts?.skipLibrarianProbe
    ? { listening: true, auth: "ok" as const, host: "127.0.0.1" }
    : await probeLibrarian();
  if (!opts?.skipLibrarianProbe) {
    if (!librarian.listening) {
      warnings.push("Librarian not reachable — guests cannot use HTTP until it is listening. Do not create another hub.");
    } else if (librarian.auth === "unauthorized") {
      errors.push("Librarian token failed — mint a named pairing key for this library. Do not fall back to unauthenticated HTTP.");
    } else if (librarian.auth === "missing_token") {
      warnings.push("Librarian is reachable but no pairing key matched. Copy this library's named key into the catalog.");
    }
  }

  return {
    ok: errors.length === 0,
    cli_version: cliVersion(),
    client,
    home,
    home_source: workspaceRoot?.trim() ? "arg" : resolved.source,
    home_env,
    initialized,
    skill_status,
    cwd,
    project,
    library,
    libraries,
    cwd_match,
    workspace_current,
    hub_writable,
    librarian,
    errors,
    warnings,
  };
}

function formatLibrarian(r: DoctorReport): string {
  const lib = r.librarian;
  const origin = (process.env.CENTRICMEM_URL?.trim() || loadCatalog()?.origin || "").replace(/\/+$/, "");
  const where =
    origin && /^https?:\/\//i.test(origin)
      ? origin
      : lib.host && lib.host !== "127.0.0.1" && lib.host !== "localhost"
        ? `${lib.host}:${lib.port ?? "?"}`
        : `:${lib.port ?? "?"}`;
  if (!lib.listening) return `Librarian: not reachable (${where})`;
  if (lib.auth === "ok") return `Librarian: ${where} (token ok)`;
  if (lib.auth === "unauthorized") return `Librarian: ${where} (token failed)`;
  if (lib.auth === "missing_token") return `Librarian: ${where} (no token)`;
  return `Librarian: ${lib.auth}`;
}

export function formatDoctorText(r: DoctorReport): string {
  const lines = [
    `CLI:     ${r.cli_version}`,
    `Client:  ${r.client}`,
    `Library: ${isLibrarianGuest() ? `${r.home} (leftover; ignored for writes)` : `${r.home} (${r.home_source}${r.home_env ? ", env set" : ""})`}`,
    `Hub:     ${isLibrarianGuest() ? "guest (HTTP)" : r.initialized ? "ok" : "UNINITIALIZED"}`,
    `Writable:${r.hub_writable ? "yes" : "no (sandbox or permissions)"}`,
    formatLibrarian(r),
    `Skill:   ${r.skill_status}`,
    `cwd:     ${r.cwd}`,
    `library: ${r.library ?? r.project ?? "(none)"}`,
    `libraries: ${r.libraries.length ? r.libraries.map((l) => l.id).join(", ") : "(none)"}`,
    `cwd_match: ${r.cwd_match ?? "(unlinked)"}`,
    `workspace.current: ${r.workspace_current ?? "(none)"}`,
  ];
  if (r.errors.length) {
    lines.push("", "Errors:");
    for (const e of r.errors) lines.push(`  - ${e}`);
  }
  if (r.warnings.length) {
    lines.push("", "Warnings:");
    for (const w of r.warnings) lines.push(`  - ${w}`);
  }
  if (!r.errors.length && !r.warnings.length) {
    lines.push("", "ok — CLI, skill, librarian, and cwd library bind.");
  }
  return lines.join("\n");
}
