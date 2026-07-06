# CentricMem

Cross-agent **workspace memory** — Skill-first, local Markdown + SQLite FTS5 (+ optional semantic search).

```text
Agent (Skill) → centricmem CLI → .centricmem/projects/<name>/ → local indexer
Optional: Drive MCP syncs projects/ to cloud (see SYNC.md)
```

## Workspace layout

```text
.centricmem/
  workspace.json
  projects/
    unclassified/       # default import bucket
    my-app/             # linked projects
      AGENTS.md
      decisions/
      sessions/
      .index/memory.db
```

## Quick Start

```bash
npm install
npm run build
npm link

cd <workspace-root>
centricmem setup --link-all --migrate-discover --install-skill --install-hooks
```

See [BETA.md](./BETA.md) for the full beta guide.

### Core commands

```bash
centricmem ambient                    # session-start preflight (implicit memory)
centricmem search "redis" --all       # BM25; add --semantic for hybrid, --explain for scores
centricmem log-decision --title "Use Redis" --context "..." --decision "..."
centricmem log-session "Migrated auth to NextAuth"
centricmem import bundle.json
centricmem suggest-classify decisions/0001-x.md
centricmem classify decisions/0001-x.md --to my-app
centricmem promote --from-distill     # then --pattern "..." --confirm
centricmem status --workspace         # unclassified backlog + per-project health
```

## Agent integration (recommended)

Follow **`skills/centricmem-agent/SKILL.md`** (installed by `centricmem setup --install-skill`):

- Session start: `centricmem ambient` (hooks can automate this)
- Search via `centricmem search` (local indexer)
- Curate high-value memory: decisions, lessons, session summaries
- Import any source via **ImportBundle** → `centricmem import`

## MCP

| Role | What |
|------|------|
| **Drive / cloud MCP** | Optional — sync `.centricmem/projects/` to external storage ([SYNC.md](./SYNC.md)) |
| **centricmem-mcp** | Optional/legacy tool wrapper. Prefer Skill + CLI. |

Env: `CENTRICMEM_WORKSPACE`, `CENTRICMEM_PROJECT`

## Features

- Workspace multi-project hub with `unclassified` staging
- Episodic `sessions/` layer + implicit `ambient` preflight
- ImportBundle generic import (decisions/lessons/rules/sessions/research)
- Local FTS5 + BM25 + intent router + temporal decay + negative feedback (`dismiss`)
- Optional hybrid semantic search (`--semantic`, OpenAI-compatible embedding API)
- Decision supersede chains, promote-to-rules workflow, Memory Map

## Semantic search (optional)

Per-project `config.json`:

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "api_key_env": "OPENAI_API_KEY",
    "hybrid_alpha": 0.6
  }
}
```

Then `centricmem index --embed` and `centricmem search "..." --semantic`.
API keys are read from env only — never stored in memory files.

## Known limitations

- Emoji not searchable (FTS5 unicode61)
- Semantic mode requires network + API key (BM25 works offline)
- No cross-project memory graph yet (roadmap)

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, research, and noncommercial use.
Copies must retain the license and the Required Notice (attribution). **Commercial use is not permitted** without a separate license from the author.

Design: [PRODUCT.md](./PRODUCT.md) · Implementation: [ARCHITECTURE.md](./ARCHITECTURE.md) · Sync: [SYNC.md](./SYNC.md) · Beta: [BETA.md](./BETA.md)
