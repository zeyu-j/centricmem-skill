#!/usr/bin/env node
// Version consistency across every manifest in this repo.
//
// There is one version per host, plus the marketplaces, install.json, package.json and the Skill's own
// metadata. They are all meant to carry the same number, and there are now eleven of them - which is
// eleven chances to ship one that disagrees, and a host reading a stale version will report a wrong
// "up to date". This asserts they all agree with plugin.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, never URL.pathname: on Windows the latter yields "/C:/..." and every read then misses,
// which would make this check pass by finding nothing. This repository is developed on Windows.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const present = (rel) => fs.existsSync(path.join(root, rel));

// Host manifests are found by shape, not by name: a hardcoded list would let the next host added to this
// repo escape the check silently, which is the exact failure this script exists to prevent.
const pluginDirs = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && (e.name === ".goose-plugin" || /^\..+-plugin$/.test(e.name)))
  .map((e) => e.name)
  .sort();

const topLevel = [
  "plugin.json",
  ...pluginDirs.map((d) => `${d}/plugin.json`),
  ".plugin/plugin.json",
  "package.json",
];

// Catalogues: metadata.version and each plugins[].version where the host records one.
const marketplaces = [
  ...pluginDirs.map((d) => `${d}/marketplace.json`),
  ".agents/plugins/marketplace.json",
  ".kiro/plugins/marketplace.json",
  ".github/plugin/marketplace.json",
];

// A host directory that carries a manifest with no version is a hole, not a pass.
for (const d of pluginDirs) {
  const p = path.join(root, d, "plugin.json");
  if (!fs.existsSync(p)) {
    console.error(`${d}/ exists but has no plugin.json`);
    process.exit(1);
  }
  if (!json(`${d}/plugin.json`).version) {
    console.error(`${d}/plugin.json carries no version, so it cannot be compared`);
    process.exit(1);
  }
}

const found = [];

for (const rel of topLevel) {
  if (!present(rel)) continue;
  const v = json(rel).version;
  if (v) found.push([rel, v]);
}

for (const rel of marketplaces) {
  if (!present(rel)) continue;
  const doc = json(rel);
  if (doc.metadata && doc.metadata.version) found.push([`${rel} metadata.version`, doc.metadata.version]);
  for (const [i, entry] of (doc.plugins || []).entries()) {
    if (entry.version) found.push([`${rel} plugins[${i}].version`, entry.version]);
  }
}

// install.json pins the skill and CLI release it expects to find.
if (present("install.json")) {
  const doc = json("install.json");
  if (doc.skill) found.push(["install.json skill", doc.skill]);
  if (doc.cli) found.push(["install.json cli", doc.cli]);
}

// The Skill's own frontmatter - the only non-JSON version in the set.
if (present("skills/centricmem-agent/SKILL.md")) {
  const text = fs.readFileSync(path.join(root, "skills/centricmem-agent/SKILL.md"), "utf8");
  const m = /metadata:\s*\n\s+version:\s*["']?([0-9][^"'\s]*)/.exec(text);
  if (m) found.push(["SKILL.md metadata.version", m[1]]);
  else {
    console.error("SKILL.md has no metadata.version to compare");
    process.exit(1);
  }
}

if (found.length < 5) {
  console.error(`only ${found.length} version declarations found - is this the package root?`);
  process.exit(1);
}

const reference = json("plugin.json").version;
const disagree = found.filter(([, v]) => v !== reference);

for (const [label, v] of found) console.log(`${v === reference ? "ok  " : "DIFF"} ${v.padEnd(10)} ${label}`);

if (disagree.length) {
  console.error(`\nplugin.json is ${reference}; ${disagree.length} declaration(s) disagree.`);
  process.exit(1);
}

console.log(`\nall ${found.length} version declarations agree on ${reference}`);
