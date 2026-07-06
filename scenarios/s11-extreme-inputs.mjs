/**
 * S11 — extreme / empty inputs.
 */
import { tmpdir, runCli, importDist } from "./_lib.mjs";

const ws = tmpdir("s11");
runCli(["init", "--no-git-hook"], ws);
const { logDecision, logLesson } = await importDist("memory.js");
const { search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");
const paths = resolvePaths(ws);

let threw = false;
try {
  logDecision(ws, { title: "", context: "c", decision: "d" });
} catch {
  threw = true;
}
if (!threw) throw new Error("empty title should throw");

const r = search(paths, '"*()');
if (!Array.isArray(r)) throw new Error("search should return array");

logLesson(ws, { title: "Valid lesson", body: "body" });
console.log("S11 PASS");
