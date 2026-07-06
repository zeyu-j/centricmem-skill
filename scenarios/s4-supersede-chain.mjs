/**
 * Scenario 4: Decision evolution chain.
 */
import fs from "node:fs";
import path from "node:path";
import { tmpdir, runCli, importDist, projectMem } from "./_lib.mjs";

const ws = tmpdir("s4");
const { initProject, logDecision } = await importDist("memory.js");
const { buildIndex, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
logDecision(ws, { title: "Session storage in cookies", context: "simple", decision: "cookies", agent: "cursor" });
logDecision(ws, { title: "Use REST for public API", context: "api", decision: "REST", agent: "cursor" });
logDecision(ws, { title: "Session storage in Redis", context: "limit", decision: "redis", agent: "claude-code", supersedes: 1 });
logDecision(ws, { title: "Add GraphQL for internal tools", context: "flex", decision: "graphql", agent: "cursor" });
logDecision(ws, { title: "Session storage in Postgres", context: "infra", decision: "postgres", agent: "claude-code", supersedes: 3 });

buildIndex(resolvePaths(ws));
const results = search(resolvePaths(ws), "session storage", 5);
if (!results[0]?.heading.includes("Postgres")) throw new Error("supersede chain ranking failed");
console.log(runCli(["status"], ws));
console.log("OK s4-supersede-chain");
