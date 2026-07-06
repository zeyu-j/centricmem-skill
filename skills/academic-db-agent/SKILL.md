---
name: academic-db-agent
version: 0.11.1
compatible_cli: ">=0.11.0"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: Cross-civilization academic corpus — search, filter, synthesize comparison tables via CentricMem ancient-medicine project.
---

# Academic DB Agent Skill (v0.11.1)

> **L1 域适配器示例** — 展示如何把一种外部 corpus 映射到 CentricMem 契约。  
> 不是核心能力；其他领域应复制此模式写自己的 Skill + 导出脚本。

CentricMem project: **`ancient-medicine`** (示例 slug). Corpus under `imported/` with YAML `meta` indexed for `--filter`.

## When to use

| Task | Tool |
|------|------|
| Find recipes / texts by civilization | `centricmem search` + `--filter` |
| Dimension-themed survey (药物、仪式、鬼病…) | `centricmem route` + `domain_boost` in config |
| Build / extend crosswalk tables | Read full crosswalk `.md` → synthesize → `log-decision` |
| Session recap of academic work | `log-session` (AgentsView for raw transcript review) |

## Workflow (synthesis path)

```text
Step 1 — Route
  centricmem route "<query>"
  → academic intent suggests search + --filter on imported docs

Step 2 — Search
  centricmem search "痔疮" -p ancient-medicine \
    --filter civilization=chinese \
    --filter type=recipe \
    -t imported -n 10

Step 3 — Deep read
  Crosswalk files (disease-map, drug-map, method-map): read ENTIRE file from disk.
  Do not rely on row-level chunks — one file = one chunk by design.

Step 4 — Synthesize
  Draft comparison table / dimension notes → user confirms → write to analysis/ or import.

Step 5 — Record
  centricmem log-decision --title "…" --refs "…"  (link synthesis to sources via #NNNN / refs)
```

## Metadata filters

Scalar frontmatter fields are filterable:

```bash
centricmem search "incantation" -p ancient-medicine --filter civilization=babylonian --filter has_incantation=true
```

MCP: `centricmem_search` with `meta: { civilization: "chinese", type: "recipe" }`.

## domain_boost

Project `config.json` maps comparison dimensions → keywords + `path_prefix` under `imported/`.
Query hits keywords → chunks under matching paths rank higher (default ×1.5).

## Reasonix fallback

If this CentricMem project is not set up, use your **source system's** index (e.g. local `_index.md`).  
That fallback belongs in **your** Skill — not in CentricMem core.

## Session / observability tools

Raw agent transcripts are **out of scope** for CentricMem.  
If you use a session viewer, curate summaries into `log-session` / `log-decision` via **your** workflow — core does not integrate with specific viewer products.

## Re-import corpus

```bash
python academic/_scripts/export_to_centricmem.py
centricmem import academic/_scripts/bundles/corpus-batch-001.json -p ancient-medicine
centricmem index -p ancient-medicine
```
