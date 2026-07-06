/**
 * ambient.ts — implicit memory preflight for session start.
 */
import fs from "node:fs";
import path from "node:path";
import { healthCheck, listDecisions } from "./memory.js";
import { readRecentSessions } from "./session.js";
import { getCurrentProjectSlug } from "./workspace.js";

export interface AmbientBlock {
  project: string;
  health: number;
  recentDecisions: string[];
  sessionTail: string[];
  issues: string[];
  text: string;
}

export function buildAmbient(workspaceRoot: string, projectSlug?: string): AmbientBlock {
  const slug = projectSlug ?? getCurrentProjectSlug(workspaceRoot);
  const h = healthCheck(workspaceRoot, slug);
  const decisions = listDecisions(workspaceRoot, slug);
  const recentDecisions = decisions
    .slice(-3)
    .reverse()
    .map((d) => `${String(d.seq).padStart(4, "0")}. ${d.title}`);

  const sessions = readRecentSessions(workspaceRoot, 7, 3, slug);
  const sessionTail = sessions.map((s) => `${s.heading}: ${s.summary.slice(0, 80)}`);

  const issues = h.issues.filter((i) => i.severity === "warn").map((i) => i.message);

  const text = [
    `CentricMem: project=${slug} | Health=${h.score}`,
    recentDecisions.length ? `Recent decisions: ${recentDecisions.join("; ")}` : "Recent decisions: (none)",
    sessionTail.length ? `Session tail: ${sessionTail.join(" | ")}` : "Session tail: (none)",
    issues.length ? `Conflicts: ${issues.join("; ")}` : "Conflicts: none",
  ].join(" | ");

  return { project: slug, health: h.score, recentDecisions, sessionTail, issues, text };
}

export function writeAmbientFile(workspaceRoot: string, block: AmbientBlock): string {
  const dest = path.join(workspaceRoot, ".centricmem", ".ambient.md");
  const body = `# CentricMem Ambient Context

${block.text}

---
_Auto-generated at session start. Run \`centricmem ambient\` to refresh._
`;
  fs.writeFileSync(dest, body, "utf8");
  return dest;
}
