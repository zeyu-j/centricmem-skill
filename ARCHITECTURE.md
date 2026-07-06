# CentricMem Architecture (v0.9)

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

## Components

| Module | Role |
|--------|------|
| `core.ts` | Paths, config, hashing |
| `workspace.ts` | Registry, link/use/classify (+path validation), suggest-classify |
| `workspace-health.ts` | Workspace-level unclassified backlog |
| `memory.ts` | Decisions/context/lessons read-write, distill, promote, health |
| `session.ts` | Episodic memory (`sessions/`) |
| `indexer.ts` | Chunking, FTS5, hybrid ranking, dismiss feedback, Memory Map |
| `embedding.ts` | OpenAI-compatible embedding API (env key only) |
| `route.ts` | Retrieval routing (read vs search vs search --all) |
| `ambient.ts` | Implicit session-start preflight |
| `import.ts` / `import-schema.ts` | ImportBundle materialization (Zod v1 schema) |
| `migrate.ts` | Legacy formats → ImportBundle |
| `setup.ts` | Guided onboarding (skill + hooks install) |
| `cli.ts` | Primary user/agent surface |
| `mcp-server.ts` | Optional legacy MCP tools (not the primary path) |

## ImportBundle flow

```text
Any source → Agent maps fields → ImportBundle JSON → importBundle() → projects/<slug>/ → buildIndex
```

## Search pipeline

```text
relevance = bm25_norm                        (default)
          = α·bm25_norm + (1-α)·cosine        (--semantic, α = embedding.hybrid_alpha)
score     = relevance × time_decay × status_penalty × ref_boost × intent_boost × feedback_penalty
```

`search --explain` prints every signal. `centricmem dismiss` feeds `feedback_penalty`.

## Index invariants

- The SQLite index is fully derivative: schema bump (`SCHEMA_VERSION`) drops and rebuilds.
- Chunk paths are normalized to forward slashes (cross-platform).
- Embeddings are cached by content hash; only stale chunks re-embed.

## Roadmap

- Remote read-only index (`remote_index_url`, see [SYNC.md](./SYNC.md))
- Cross-project memory graph

## License

MIT
