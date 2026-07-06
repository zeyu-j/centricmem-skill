/**
 * S14 — Intent Router boundaries.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const indexer = await import(pathToFileURL(path.join(here, "..", "dist", "indexer.js")).href);
const route = await import(pathToFileURL(path.join(here, "..", "dist", "route.js")).href);

const cases = [
  ["why did we choose redis", "decision"],
  ["当前进展", "context"],
  ["踩过的坑", "lessons"],
  ["调研外部 API", "research"],
  ["redis", "general"],
];

let correct = 0;
for (const [q, expected] of cases) {
  const got = indexer.classifyIntent(q);
  if (got === expected) correct++;
  else console.log(`MISS intent "${q}" → ${got} want ${expected}`);
}
const r = route.routeQuery("为什么选 redis");
if (r.action !== "search") throw new Error("route failed for decision query");
if (correct < cases.length - 1) throw new Error(`intent accuracy too low: ${correct}/${cases.length}`);
console.log("OK s14-intent");
