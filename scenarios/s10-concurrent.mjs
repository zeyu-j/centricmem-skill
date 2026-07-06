/**
 * S10 — concurrent decision logging.
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir, runCli, importDist, ROOT, projectMem } from "./_lib.mjs";

const ws = tmpdir("s10");
runCli(["init", "--no-git-hook"], ws);
const { logDecision } = await importDist("memory.js");
const { buildIndexAll, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

for (let i = 0; i < 10; i++) {
  logDecision(ws, { title: `Rapid ${i}`, context: `c${i}`, decision: `d${i}`, agent: "cursor" });
}
buildIndexAll(ws);
const decDir = path.join(projectMem(ws), "decisions");
const count = fs.readdirSync(decDir).filter((f) => f.endsWith(".md")).length;
if (count < 10) throw new Error(`expected 10 decision files, got ${count}`);

const memUrl = pathToFileURL(path.join(ROOT, "dist", "memory.js")).href;
const childScript = `
import { logDecision } from ${JSON.stringify(memUrl)};
const ws = ${JSON.stringify(ws)};
const i = process.argv[1];
logDecision(ws, { title: "Parallel " + i, context: "c", decision: "d", agent: "p" });
`;
const scriptPath = path.join(ws, "_parallel.mjs");
fs.writeFileSync(scriptPath, childScript);
await Promise.all(
  Array.from({ length: 5 }, (_, i) =>
    new Promise((res, rej) => {
      const c = spawn("node", [scriptPath, String(i)], { stdio: "inherit" });
      c.on("exit", (code) => (code === 0 ? res() : rej(new Error("child fail"))));
    }),
  ),
);
buildIndexAll(ws);
console.log("S10 PASS");
