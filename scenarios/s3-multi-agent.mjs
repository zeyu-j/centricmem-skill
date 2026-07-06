/**
 * Scenario 3: Multi-agent alternating writes + agent filter.
 */
import { tmpdir, importDist } from "./_lib.mjs";

const ws = tmpdir("s3");
const { initProject, logDecision, listDecisions } = await importDist("memory.js");
const { buildIndex, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
logDecision(ws, { title: "Use Tailwind for styling", context: "css", decision: "tailwind", agent: "cursor" });
logDecision(ws, { title: "Use Zustand for state", context: "state", decision: "zustand", agent: "cursor" });
logDecision(ws, { title: "API errors use RFC 7807", context: "errors", decision: "problem+json", agent: "claude-code" });
logDecision(ws, { title: "Use Drizzle ORM", context: "orm", decision: "drizzle", agent: "claude-code" });

buildIndex(resolvePaths(ws));

const decisions = listDecisions(ws);
if (!decisions.some((d) => d.agent === "cursor") || !decisions.some((d) => d.agent === "claude-code")) {
  throw new Error("agent attribution missing");
}
const cursorOnly = search(resolvePaths(ws), "use", 10, { agent: "cursor" });
if (!cursorOnly.length || !cursorOnly.every((r) => r.agent === "cursor")) {
  throw new Error("agent filter failed");
}
console.log("OK s3-multi-agent");
