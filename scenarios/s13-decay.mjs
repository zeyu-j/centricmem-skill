/**
 * S13 — Time decay: backdated decisions rank newest-first, old ones still findable.
 */
import fs from "node:fs";
import path from "node:path";
import { tmpdir, importDist, projectMem } from "./_lib.mjs";

const ws = tmpdir("s13");
const { initProject, logDecision } = await importDist("memory.js");
const { buildIndex, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
const ages = [0, 7, 30, 180, 365];
for (const days of ages) {
  logDecision(ws, {
    title: `Benchmark checkpoint at ${days} days`,
    context: "benchmark subsystem",
    decision: "record results",
    agent: "test",
  });
}
const dir = path.join(projectMem(ws), "decisions");
fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().forEach((f, i) => {
  const ts = new Date(Date.now() - ages[i] * 86400000).toISOString();
  const p = path.join(dir, f);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\*\*Logged at\*\*: \S+/, `**Logged at**: ${ts}`));
});

const paths = resolvePaths(ws);
buildIndex(paths);
const r = search(paths, "benchmark checkpoint", 10);
const order = r.map((x) => parseInt(/at (\d+) days/.exec(x.heading)?.[1] ?? "-1", 10)).filter((x) => x >= 0);
const newestFirst = order.every((v, i, a) => i === 0 || a[i - 1] <= v);
const s0 = r.find((x) => x.heading.includes("at 0 days"))?.score ?? 0;
const s365 = r.find((x) => x.heading.includes("at 365 days"))?.score ?? 0;
if (!newestFirst) throw new Error(`not newest-first: ${order.join(",")}`);
if (!(s365 < s0) || s365 <= 0) throw new Error(`decay curve wrong: 0d=${s0} 365d=${s365}`);
console.log("OK s13-decay");
