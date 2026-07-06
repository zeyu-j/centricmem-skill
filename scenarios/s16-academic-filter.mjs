/**
 * S16 — Academic metadata filter + import rel_path.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "..", "dist");
const importUrl = (p) => pathToFileURL(p).href;

const { initProject } = await import(importUrl(path.join(dist, "memory.js")));
const { buildIndex, search } = await import(importUrl(path.join(dist, "indexer.js")));
const { parseImportBundle, importBundle } = await import(importUrl(path.join(dist, "import.js")));
const { resolvePaths } = await import(importUrl(path.join(dist, "core.js")));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-s16-"));
const ws = tmp;
initProject(ws);

const bundle = parseImportBundle({
  version: 1,
  imported: [
    {
      title: "BAM7 salve",
      external_id: "s16-babylonian",
      rel_path: "recipes/bam7/salve.md",
      meta: { civilization: "babylonian", type: "recipe", has_incantation: false },
      body: "Babylonian hemorrhoid treatment with herb mixture.",
    },
    {
      title: "Mawangdui recipe",
      external_id: "s16-chinese",
      rel_path: "recipes/mawangdui/salve.md",
      meta: { civilization: "chinese", type: "recipe", has_incantation: true },
      body: "Chinese hemorrhoid treatment with moxibustion.",
    },
  ],
});
importBundle(ws, bundle);
const paths = resolvePaths(ws);
buildIndex(paths);

const bab = search(paths, "hemorrhoid", 5, { meta: { civilization: "babylonian" } });
const chi = search(paths, "hemorrhoid", 5, { meta: { civilization: "chinese" } });
if (!bab.length || !chi.length) throw new Error("meta filter failed");
if (bab.some((h) => h.file.includes("mawangdui"))) throw new Error("babylonian filter leaked chinese doc");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("OK s16-academic-filter");
