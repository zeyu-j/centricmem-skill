# CentricMem Architecture (v0.10)

> **设计真源**：[PRODUCT.md](./PRODUCT.md)（记忆架构 / 存储 / 检索）  
> 本文档描述**技术实现**与模块划分。

## Layers

```text
L1  Skill + CLI (centricmem-agent)  — when/how to read, import, classify, curate
L0  Local core                       — Markdown SOT + SQLite FTS5 (+ optional embeddings)
L2  External (optional)              — Drive MCP sync only; see SYNC.md
```

## Workspace layout

```text
<workspace>/
  .centricmem/
    workspace.json
    .ambient.md            # session-start preflight (generated)
    projects/
      <slug>/
        AGENTS.md
        active_context.md
        decisions/
        lessons.md
        sessions/          # append-only episodic log (YYYY-MM-DD.md)
        imported/
        .index/memory.db   # derivative — safe to delete and rebuild
```

## Components (12 modules)

| Module | Role |
|--------|------|
| `core.ts` | Paths, config, hashing |
| `workspace.ts` | Registry, link/use/classify (+path validation), suggest-classify, workspace health |
| `memory.ts` | All memory-unit writes/reads: decisions, context, lessons, sessions; distill, promote, health |
| `indexer.ts` | Chunking, FTS5, hybrid ranking, dismiss feedback, Memory Map, **memory links** |
| `embedding.ts` | OpenAI-compatible embedding API (env key only) |
| `retrieve.ts` | Read-side strategy: retrieval routing + ambient preflight |
| `import.ts` | ImportBundle v1 schema (Zod) + materialization |
| `migrate.ts` | Legacy formats → ImportBundle |
| `setup.ts` | Guided onboarding (skill + hooks install) |
| `templates.ts` | Markdown templates (decision, AGENTS, pointers) |
| `cli.ts` | Primary user/agent surface |
| `mcp-server.ts` | Optional legacy MCP tools (not the primary path) |

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
relevance = bm25_norm                        (default)
          = α·bm25_norm + (1-α)·cosine        (--semantic, α = embedding.hybrid_alpha)
score     = relevance × time_decay × status_penalty × ref_boost × intent_boost × feedback_penalty
```

`search --explain` prints every signal. `centricmem dismiss` feeds `feedback_penalty`.
`ref_boost = 1 + ref_weight · ln(1 + search_hits + 2·link_indegree)`.

## Index invariants

- The SQLite index is fully derivative: schema bump (`SCHEMA_VERSION`) drops and rebuilds.
- Chunk paths are normalized to forward slashes (cross-platform).
- Embeddings are cached by content hash; only stale chunks re-embed.
- Links are re-extracted per file on every index pass (no stale edges).

## Roadmap

- Remote read-only index (`remote_index_url`, see [SYNC.md](./SYNC.md))
- Cross-project memory links

## License

PolyForm Noncommercial 1.0.0 — see [LICENSE](./LICENSE).
