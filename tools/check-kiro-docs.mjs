import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const normalize = (text) => text.replace(/[ \t]+/g, " ");
const manifests = read("MANIFESTS.md");
const verified = read("VERIFIED-INSTALLS.md");
const readme = read("README.md");
const skill = read("skills/centricmem-agent/SKILL.md");
const reference = read("skills/centricmem-agent/REFERENCE.md");
const errors = [];

if (!normalize(manifests).includes("| `.kiro/plugins/` | Kiro IDE |")) {
  errors.push("MANIFESTS.md must identify .kiro/plugins as Kiro IDE, not Kiro CLI");
}
for (const name of ["Kiro CLI", "Kiro IDE", "Kiro Crew"]) {
  if (!normalize(readme).includes(`| ${name} |`)) errors.push(`README.md has no ${name} install row`);
  if (!verified.includes(`**${name}**`)) errors.push(`VERIFIED-INSTALLS.md has no ${name} evidence row`);
  if (!reference.includes(`**${name}**`)) errors.push(`REFERENCE.md has no ${name} host guidance`);
}
if (!skill.includes("`library:null`")) {
  errors.push("SKILL.md must explain library:null");
}
if (!reference.includes("`library:null`")) {
  errors.push("REFERENCE.md must explain library:null");
}
if (!reference.includes("current agent")) {
  errors.push("REFERENCE.md must explain current-agent MCP scope");
}
for (const [label, text] of [["README.md", readme], ["VERIFIED-INSTALLS.md", verified], ["REFERENCE.md", reference]]) {
  if (!text.includes("cold session")) errors.push(`${label} must explain cold-session loading`);
}
if (!reference.includes("device claim") || !reference.includes("OAuth banner only when minting")) {
  errors.push("REFERENCE.md must keep device-first and OAuth-fallback ordering for Kiro Crew");
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("ok Kiro CLI, Kiro IDE and Kiro Crew guidance agrees");
