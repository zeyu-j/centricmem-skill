/**
 * run-scenarios.mjs — workspace scenario smoke tests.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scenariosDir = path.join(here, "..", "scenarios");
const scenarios = [
  "s1-cold-start.mjs",
  "s2-cursor-migrate.mjs",
  "s3-multi-agent.mjs",
  "s4-supersede-chain.mjs",
  "s5-distill-health.mjs",
  "s7-progressive.mjs",
  "s9-unicode.mjs",
  "s10-concurrent.mjs",
  "s11-extreme-inputs.mjs",
  "s12-mixed-migrate.mjs",
  "s13-decay.mjs",
  "s14-intent.mjs",
  "s15-lifecycle.mjs",
];

let failures = 0;
for (const s of scenarios) {
  const p = path.join(scenariosDir, s);
  const t0 = Date.now();
  const r = spawnSync("node", [p], { encoding: "utf8", cwd: scenariosDir });
  const ms = Date.now() - t0;
  if (r.status === 0) console.log(`PASS  ${s} (${ms}ms)`);
  else {
    console.log(`FAIL  ${s} (${ms}ms)`);
    console.log((r.stdout || "") + (r.stderr || ""));
    failures++;
  }
}
if (failures) process.exit(1);
console.log("\nScenarios OK");
