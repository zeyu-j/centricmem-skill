/**
 * Scenario 7: Progressive disclosure on large AGENTS.md.
 */
import fs from "node:fs";
import { tmpdir, importDist } from "./_lib.mjs";

const ws = tmpdir("s7");
const { initProject, logDecision, readContext } = await importDist("memory.js");
const { buildIndex } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
const paths = resolvePaths(ws);
let agents = fs.readFileSync(paths.agentsFile, "utf8");
const rulesBlock = Array.from({ length: 60 }, (_, i) => `- Rule ${i + 1}: guideline variant ${i}`).join("\n");
agents = agents.replace(
  "<!-- Long-term rules promoted from decisions/ go here. Only humans (or an admin agent) should edit this section. -->",
  rulesBlock,
);
agents += "\n## Deployment Notes\n" + Array.from({ length: 80 }, (_, i) => `- note ${i}`).join("\n") + "\n";
fs.writeFileSync(paths.agentsFile, agents, "utf8");

for (let i = 1; i <= 10; i++) {
  logDecision(ws, { title: `Decision ${i}`, context: "c", decision: "d" });
}
buildIndex(paths);

const ctx = readContext(ws, "summary");
if (!ctx.truncated) throw new Error("expected truncation");
if (!ctx.agents.includes("centricmem:map")) throw new Error("Memory Map not pinned in summary");
console.log("OK s7-progressive");
