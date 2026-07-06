/**
 * session.ts — episodic / session memory (append-only under sessions/).
 */
import fs from "node:fs";
import path from "node:path";
import { resolvePaths, ensureDir, nowISO, detectAgent } from "./core.js";

export interface LogSessionInput {
  summary: string;
  title?: string;
  artifacts?: string[];
  agent?: string;
  loggedAt?: string;
}

export interface LogSessionResult {
  file: string;
  heading: string;
}

function sessionFileForDate(memDir: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return path.join(memDir, "sessions", `${y}-${m}-${d}.md`);
}

function ensureSessionFile(file: string, date: Date): void {
  if (fs.existsSync(file)) return;
  ensureDir(path.dirname(file));
  const label = date.toISOString().slice(0, 10);
  fs.writeFileSync(
    file,
    `# Sessions — ${label}\n\n> Append-only episodic memory. Auto-captured or logged at session end.\n`,
    "utf8",
  );
}

/** Append a session entry to sessions/YYYY-MM-DD.md (append-only). */
export function logSession(
  workspaceRoot: string,
  input: LogSessionInput,
  projectSlug?: string,
): LogSessionResult {
  const summary = input.summary?.trim();
  if (!summary) throw new Error("Session summary must not be empty.");

  const paths = resolvePaths(workspaceRoot, projectSlug);
  const at = input.loggedAt ? new Date(input.loggedAt) : new Date();
  const sessionFile = sessionFileForDate(paths.memDir, at);
  ensureSessionFile(sessionFile, at);

  const by = input.agent || detectAgent();
  const ts = input.loggedAt || nowISO();
  const time = ts.slice(11, 16);
  const heading = input.title?.trim() || `${time} session`;
  let block = `## ${heading}\n\n${summary}\n`;
  if (input.artifacts?.length) {
    block += `\n**Artifacts**: ${input.artifacts.map((a) => `\`${a}\``).join(", ")}\n`;
  }
  block += `\n<!-- centricmem:meta logged_at=${ts} logged_by=${by} -->\n`;
  fs.appendFileSync(sessionFile, block, "utf8");

  return {
    file: path.relative(paths.memDir, sessionFile),
    heading,
  };
}

export interface SessionEntry {
  file: string;
  heading: string;
  summary: string;
  loggedAt: string;
  agent: string;
}

/** Read recent session entries across daily files (newest first). */
export function readRecentSessions(
  workspaceRoot: string,
  days = 7,
  limit = 10,
  projectSlug?: string,
): SessionEntry[] {
  const paths = resolvePaths(workspaceRoot, projectSlug);
  const sessionsDir = path.join(paths.memDir, "sessions");
  if (!fs.existsSync(sessionsDir)) return [];

  const cutoff = Date.now() - days * 86400000;
  const files = fs
    .readdirSync(sessionsDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  const out: SessionEntry[] = [];
  for (const f of files) {
    const abs = path.join(sessionsDir, f);
    const mtime = fs.statSync(abs).mtimeMs;
    if (mtime < cutoff && out.length >= limit) break;

    const content = fs.readFileSync(abs, "utf8");
    const rel = path.join("sessions", f);
    const sections = content.split(/^## /m).slice(1);
    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i];
      const nl = section.indexOf("\n");
      const heading = (nl >= 0 ? section.slice(0, nl) : section).trim();
      const body = nl >= 0 ? section.slice(nl + 1) : "";
      const loggedAt =
        /logged_at=(\S+?)(?:\s|-->)/.exec(body)?.[1] ??
        fs.statSync(abs).mtime.toISOString();
      const agent = /logged_by=(\S+?)(?:\s|-->)/.exec(body)?.[1] ?? "unknown";
      const summary = body
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\*\*Artifacts\*\*:[\s\S]*/g, "")
        .trim()
        .slice(0, 300);
      if (!summary) continue;
      out.push({ file: rel, heading, summary, loggedAt, agent });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
