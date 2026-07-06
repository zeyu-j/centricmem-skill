/**
 * S1 — cold start with workspace hub.
 */
import fs from "node:fs";
import path from "node:path";
import { tmpdir, runCli, importDist, projectMem } from "./_lib.mjs";

const ws = tmpdir("s1");
console.log(runCli(["init", "--no-git-hook"], ws));

const { logDecision } = await importDist("memory.js");
const { buildIndexAll, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

logDecision(ws, {
  title: "Use PostgreSQL as primary database",
  context: "ACID needed",
  decision: "PostgreSQL 16",
  agent: "claude-code",
  tags: ["database"],
});

buildIndexAll(ws);
const results = search(resolvePaths(ws), "PostgreSQL");
console.log("search hits:", results.length);
if (!fs.existsSync(path.join(projectMem(ws), "decisions"))) throw new Error("no decisions dir");
console.log("S1 PASS");
