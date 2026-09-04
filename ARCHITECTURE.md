# CentricMem Architecture (v0.21.6)

> **设计真源**：[PRODUCT.md](./PRODUCT.md)（记忆架构 / 存储 / 检索）  
> **使用面**：[PRODUCT_HOST.md](./PRODUCT_HOST.md)（云馆员、HTTP、钥匙）  
> 本文档描述**技术实现**与模块划分。

## Layers

```text
L1  Skill + librarian HTTP + host MCP  — when/how to read, import, classify, curate
L0  Librarian disk                     — Markdown SOT + SQLite FTS5 (+ optional embeddings)
    Attach originals                   — imported/attach/ on disk or R2 (not FTS)
Ops Cold backup                        — restic → separate R2 bucket (see SYNC.md)
```

## Product home layout (Agent-side)

```text
$CENTRICMEM_HOME/   # librarian hub (operators). Guests: leftover copy; CLI refuses writes.
  workspace.json
  .ambient.md
  skills/
    centricmem-agent/
      SKILL.md
      REFERENCE.md
      integrations/
  projects/
    <slug>/
      AGENTS.md
      active_context.md
      decisions/
      lessons.md
      sessions/                 # one file per close: <stamp>-<writer>-<id>.md
      imported/
      .index/memory.db          # cache — delete and rebuild
```

A unit is a Markdown file (or one `##` in lessons / AGENTS): Identity / Details / Tags / Body. Optional original bytes live under `imported/attach/` (pointer in Details). See PRODUCT.md §1.1.

- Code repositories do **not** contain the hub — and should not contain product usage pointers either. Skill installs to `$CENTRICMEM_HOME/skills/` and `~/.cursor/skills/`.

## Components (13 modules)

| Module | Role |
|--------|------|
| `core.ts` | Paths, config, hashing |
| `workspace.ts` | Registry, write routing, link/use/classify, inbox, suggest-classify, workspace health |
| `memory.ts` | All memory-unit writes/reads: decisions, context, lessons, sessions; distill, promote, health |
| `indexer.ts` | Chunking, FTS5, hybrid ranking, dismiss feedback, Memory Map, **memory links** |
| `embedding.ts` | OpenAI-compatible embedding API (env key only) |
| `retrieve.ts` | Read-side strategy: retrieval routing + ambient preflight |
| `import.ts` | ImportBundle v1 schema (Zod) + materialization |
| `migrate.ts` | Legacy formats → ImportBundle |
| `setup.ts` | Guided onboarding (skill + hooks install) |
| `skill.ts` | Bundled vs installed Skill status (`skill status`) |
| `templates.ts` | Markdown templates (decision, AGENTS, pointers) |
| `cli.ts` | Operator exec surface on the librarian host (not an agent write fallback) |
| `host-api.ts` / `host-server.ts` | Librarian HTTP (same handlers as CLI). Bind loopback until TLS; public bind behind proxy |
| `host-connector.ts` | Host MCP proxy → librarian URL (not a second store) |
| `mcp-server.ts` | Optional legacy MCP tools (not the sandbox path) |

## ImportBundle flow

```text
Any source → Agent maps fields → ImportBundle JSON → importBundle() → projects/<slug>/ → buildIndex
```

## Memory Links

Typed edges between decisions, extracted from Markdown at index time (schema v4, `links` table — fully derivative):

| Edge | Source in Markdown | Meaning |
|------|--------------------|---------|
| `supersedes` | `- **Supersedes**: #0002` | Evolution chain (existing back-pointer, now indexed) |
| `refs` | `- **Refs**: #0001, #0004` | Explicit curated reference |
| `mentions` | inline `#NNNN` in the body | Automatic weak reference (zero effort) |

- `centricmem refs <seq> [--depth 1-3]` walks the neighborhood in both directions.
- `centricmem log-decision --refs "1,4"` writes the explicit Refs line.
- Structural in-degree feeds `ref_boost` (referenced decisions rank higher; weighted 2x vs search-hit counts).
- An explicit ref suppresses the weaker `mentions` edge for the same target; self-references are dropped.

## Search pipeline

```text
relevance = bm25_norm                                           (default)
          = RRF(rank_bm25, rank_vector) normalized              (--semantic; k = embedding.rrf_k, default 60)
score     = relevance × time_decay × status_penalty × validity_penalty
            × ref_boost × intent_boost × domain_boost × feedback_penalty
```

`--semantic` builds two candidate lists (FTS top-N and brute-force cosine top-N over `chunk_embeddings`), fuses with Reciprocal Rank Fusion, then applies the same multipliers. Pure vector hits outside the FTS window can surface.

`search --explain` prints trajectory ranks (BM25# / Vec# / RRF), every signal, and optional supersedes lineage. `centricmem dismiss` feeds `feedback_penalty`.
`status_penalty` is softened (0.5 vs 0.1) for historical-intent queries (`previously`, `上个月`, …).
`validity_penalty` uses optional `valid_from` / `valid_until` (YAML frontmatter or `**Valid from**` / `**Valid until**` lines).
`ref_boost = 1 + ref_weight · ln(1 + search_hits + 2·link_indegree)`.
`domain_boost` — project `config.json` maps dimension keywords → `path_prefix` under `imported/` (default ×1.5).

Legacy `embedding.hybrid_alpha` is ignored for `--semantic` ranking (kept for older config.json).

## Corpus metadata (schema v5)

- YAML frontmatter on imported docs → `chunk_meta.meta_json`
- Optional hot columns on `chunks` (`meta_civilization`, `meta_type`, `meta_has_incantation`) when `metadata.hot_columns_enabled`
- CLI/MCP: `--filter key=value` / `meta: { key: value }`
- ImportBundle `imported[].meta` + `rel_path` preserve corpus directory layout

## Index invariants

- The SQLite index is fully derivative: schema bump (`SCHEMA_VERSION` = 8) drops and rebuilds. `chunk_keys` holds addressing keys (tag/id/agent/type/status/project) derived at index time.
- Chunk paths are normalized to forward slashes (cross-platform).
- Embeddings are cached by content hash; only stale chunks re-embed.
- Links are re-extracted per file on every index pass (no stale edges).

## Roadmap

- Remote read-only index (`remote_index_url`, see [SYNC.md](./SYNC.md))
- Cross-project memory links

## License

PolyForm Noncommercial 1.0.0 — see [LICENSE](./LICENSE).
