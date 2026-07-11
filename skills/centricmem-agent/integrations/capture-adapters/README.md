# Capture adapters (export → ImportBundle)

Other memory skills stay the **capture** endpoint. CentricMem is the **organize / retrieve** layer.

```text
capture tool  →  map fields  →  ImportBundle JSON  →  centricmem import
```

CentricMem core does **not** scan agent install directories. Your adapter (script or Skill) owns the mapping.

## Contract checklist

1. Emit ImportBundle v1 (`version: 1`).
2. Set stable `external_id`s from the source system (`notion:…`, `mb:…`, file path).
3. Prefer `imported[]` / `research[]` for raw capture dumps (default **upsert** on re-import).
4. Use `decisions[]` / `lessons[]` only when the source already looks like curated ADRs — they stay **skip-only** (append-only).
5. Run `centricmem import export.json` (add `--skip-existing` for one-shot migrate semantics).
6. Classify out of `unclassified` when ready: `suggest-classify` → `classify --to <slug>`.

See [BETA.md](../../../../BETA.md) for re-import semantics.

## Built-in one-shot migrators

```bash
centricmem migrate --from cursor-rules --path .cursor/rules
centricmem migrate --from memory-bank --path memory-bank
centricmem migrate --from markdown --path ./notes
```

Rules from `cursor-rules` now carry `external_id` = relative path so repeated migrate does not re-append `AGENTS.md`.

## Nightly incremental pattern

```bash
# 1) Your exporter writes ImportBundle (example path)
./scripts/export-memory-bank.mjs > /tmp/capture-bundle.json

# 2) Upsert raw material into CentricMem
centricmem import /tmp/capture-bundle.json -p unclassified

# 3) Optional: search / ambient use the organized index
centricmem search "auth" --all
```

Minimal stub exporter shape:

```js
// export-memory-bank.mjs — map YOUR files; do not add parsers to CentricMem core
import fs from "node:fs";
const body = fs.readFileSync("memory-bank/projectbrief.md", "utf8");
const bundle = {
  version: 1,
  project: "unclassified",
  source: { type: "memory-bank", name: "nightly" },
  imported: [
    {
      title: "Project brief",
      body,
      external_id: "mb:projectbrief",
      rel_path: "memory-bank/projectbrief.md",
    },
  ],
};
process.stdout.write(JSON.stringify(bundle, null, 2));
```

## Related

- Skill coexistence section: `../SKILL.md`
- Product write path: [PRODUCT.md](../../../../PRODUCT.md) §2.2 / §4.2
- Lifecycle hooks: [README.md](./README.md)
