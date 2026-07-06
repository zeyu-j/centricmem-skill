/**
 * S15 — Lifecycle: 30-day journey (decisions, supersede, lesson, session, health).
 */
import { tmpdir, runCli, importDist } from "./_lib.mjs";

const ws = tmpdir("s15");
const { initProject, logDecision, logLesson, updateContext, healthCheck, listDecisions } = await importDist("memory.js");
const { logSession } = await importDist("memory.js");
const { buildIndex, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
logDecision(ws, { title: "Use Next.js App Router", context: "greenfield", decision: "RSC", agent: "cursor", tags: ["framework"] });
logDecision(ws, { title: "Use Clerk for authentication", context: "speed", decision: "Clerk", agent: "claude-code", tags: ["auth"] });
logDecision(ws, { title: "Use NextAuth v5 for authentication", context: "Clerk pricing too high", decision: "NextAuth v5", agent: "claude-code", tags: ["auth"], supersedes: 2 });
logLesson(ws, { title: "RSC cannot use browser APIs", body: "window is undefined in server components.", agent: "cursor" });
updateContext(ws, "## Current Focus\n\nAuth migration to NextAuth v5.", "claude-code");
logSession(ws, { summary: "Migrated auth from Clerk to NextAuth.", title: "Auth migration" });

const paths = resolvePaths(ws);
buildIndex(paths);

const why = search(paths, "why did we switch away from Clerk", 3);
if (!why.length) throw new Error("history query failed");
if (why[0].heading.includes("Clerk") && why[0].status === "superseded") {
  throw new Error("superseded decision outranks active replacement");
}
const evo = listDecisions(ws).filter((d) => d.supersedes || d.supersededBy);
if (evo.length < 2) throw new Error("supersede chain broken");
const h = healthCheck(ws);
if (h.score <= 0) throw new Error("health score zero");
runCli(["status"], ws);
console.log("OK s15-lifecycle");
