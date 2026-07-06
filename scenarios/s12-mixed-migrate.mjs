/**
 * S12 — Mixed migration: cursor-rules + memory-bank coexistence.
 */
import fs from "node:fs";
import path from "node:path";
import { tmpdir, runCli, importDist, projectMem } from "./_lib.mjs";

const ws = tmpdir("s12");
fs.mkdirSync(path.join(ws, ".cursor", "rules"), { recursive: true });
fs.mkdirSync(path.join(ws, "memory-bank"), { recursive: true });

fs.writeFileSync(path.join(ws, ".cursor/rules/testing.mdc"), "---\ndescription: testing\n---\n# Testing\n- Use Vitest, coverage > 80%\n");
fs.writeFileSync(path.join(ws, "memory-bank/projectbrief.md"), "# Project Brief\n\nIoT fleet dashboard.\n");
fs.writeFileSync(path.join(ws, "memory-bank/activeContext.md"), "# Active Context\n\nBuilding device telemetry page.\n");
fs.writeFileSync(path.join(ws, "memory-bank/decisionLog.md"), "# Decision Log\n\n## Use WebSocket for telemetry\n\nPolling too slow.\n");
fs.writeFileSync(path.join(ws, "memory-bank/progress.md"), "# Progress\n\n- [x] Auth flow\n");

runCli(["init", "--no-git-hook"], ws);
runCli(["migrate", "--from", "cursor-rules", "--path", ".cursor/rules"], ws);
runCli(["migrate", "--from", "memory-bank", "--path", "memory-bank"], ws);

const { buildIndex, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");
const paths = resolvePaths(ws);
buildIndex(paths);

for (const [q, why] of [
  ["Vitest coverage", "cursor rule"],
  ["WebSocket telemetry", "memory-bank decision"],
  ["IoT fleet", "projectbrief"],
]) {
  if (!search(paths, q, 3).length) throw new Error(`no hits for "${q}" (${why})`);
}
// progress.md now lands in sessions/, not active_context
const sessDir = path.join(projectMem(ws), "sessions");
if (!fs.existsSync(sessDir) || !fs.readdirSync(sessDir).length) {
  throw new Error("memory-bank progress not migrated to sessions/");
}
console.log("OK s12-mixed-migrate");
