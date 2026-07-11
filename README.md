# CentricMem

Cross-agent **workspace memory** — Skill-first, Agent-side product home (`~/.centricmem`) + SQLite FTS5.

```text
Agent (Skill) → centricmem CLI → $CENTRICMEM_HOME/projects/<name>/ → local indexer
Code repos stay source-only — memory and Skill live under the Agent product home (`~/.centricmem`).
```

## Workspace layout

```text
~/.centricmem/                 # CENTRICMEM_HOME (product hub)
  workspace.json
  skills/centricmem-agent/
  projects/
    unclassified/
    my-project/
```

## Quick Start

```bash
npm install -g centricmem   # or: npm link from a build
cd <code-project>
centricmem setup --migrate-from-local --link-all --install-skill --install-hooks
```

Optional (Cursor): `centricmem setup --install-hooks` for automatic session lifecycle — see `skills/centricmem-agent/integrations/`.

See [BETA.md](./BETA.md) for the full beta guide.

### Core commands

```bash
centricmem ambient                    # session-start preflight (implicit memory)
centricmem skill status               # bundled vs installed Skill (pull-based updates)
centricmem search "redis" --all       # BM25; add --semantic for hybrid, --explain for scores
centricmem search "recipe" --filter civilization=chinese   # corpus metadata filter
centricmem route "how do we handle auth?"   # retrieval routing hint
centricmem log-decision --title "Use Redis" --context "..." --decision "..." --refs "1,4"
centricmem refs 3 --depth 2              # walk memory links (refs/mentions/supersedes)
centricmem log-session "Migrated auth to NextAuth"
centricmem import bundle.json
centricmem suggest-classify decisions/0001-x.md
centricmem classify decisions/0001-x.md --to my-project
centricmem promote --from-distill     # then --pattern "..." --confirm
centricmem status --workspace         # unclassified backlog + per-project health
```

## Agent integration (recommended)

Follow **`.centricmem/skills/centricmem-agent/SKILL.md`** (installed by `centricmem setup --install-skill`):

- Session start: `centricmem ambient` (wire lifecycle hooks per `integrations/` if your agent supports them)
- Search via `centricmem search` (local indexer)
- Curate high-value memory: decisions, lessons, session summaries
- Import any source via **ImportBundle** → `centricmem import`

## MCP

| Role | What |
|------|------|
| **Drive / cloud MCP** | Optional — sync `$CENTRICMEM_HOME/projects/` to external storage ([SYNC.md](./SYNC.md)) |
| **centricmem-mcp** | Optional/legacy tool wrapper. Prefer Skill + CLI. |

Env: `CENTRICMEM_WORKSPACE`, `CENTRICMEM_PROJECT`

## Features

- Workspace multi-project hub with `unclassified` staging
- Episodic `sessions/` layer + implicit `ambient` preflight
- ImportBundle generic import (decisions/lessons/rules/sessions/research)
- Local FTS5 + BM25 + intent router + temporal decay + negative feedback (`dismiss`)
- Optional hybrid semantic search (`--semantic`, OpenAI-compatible embedding API)
- Decision supersede chains, promote-to-rules workflow, Memory Map
- **Memory Links**: inline `#NNNN` mentions auto-indexed; `centricmem refs` walks the graph; referenced decisions rank higher
- **Corpus metadata**: `--filter key=value` on imported docs with YAML frontmatter; optional `domain_boost` in `config.json`
- **Skill status**: `centricmem skill status` compares bundled vs installed Skill (v0.12.0)

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
- Memory links are project-scoped; cross-project links on the roadmap

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — attribution required; no commercial use.

Design: [PRODUCT.md](./PRODUCT.md) · Implementation: [ARCHITECTURE.md](./ARCHITECTURE.md) · L1 example: [ACADEMIC_DB_REPORT.md](./ACADEMIC_DB_REPORT.md) · Sync: [SYNC.md](./SYNC.md) · Beta: [BETA.md](./BETA.md)
