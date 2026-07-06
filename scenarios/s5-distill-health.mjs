/**
 * Scenario 5: distill + health with 15 decisions.
 */
import { tmpdir, runCli, importDist } from "./_lib.mjs";

const ws = tmpdir("s5");
const { initProject, logDecision, distill, healthCheck } = await importDist("memory.js");
const { buildIndex } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
for (let i = 0; i < 5; i++) {
  logDecision(ws, { title: `Database rule ${i}`, context: "c", decision: "d", tags: ["database"] });
}
for (let i = 0; i < 3; i++) {
  logDecision(ws, { title: `Auth rule ${i}`, context: "c", decision: "d", tags: ["auth"] });
}
for (let i = 0; i < 7; i++) {
  logDecision(ws, { title: `Misc ${i}`, context: "c", decision: "d" });
}

buildIndex(resolvePaths(ws));
const dr = distill(ws);
if (!dr.patterns.some((p) => p.keyword === "database")) throw new Error("distill missed database tag");
const h = healthCheck(ws);
console.log("score:", h.score);
console.log(runCli(["status"], ws));
console.log("OK s5-distill-health");
