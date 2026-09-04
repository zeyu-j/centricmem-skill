# CentricMem

Skill-first: agents follow `$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md`. Capture stays in the agent's own memory (Cursor memories / other plugins). The hosted librarian is the **manager layer** — agents upload over HTTP; humans download or delete ([PRODUCT_HOST.md](./PRODUCT_HOST.md)). Never CLI-write a hub. On a guest machine (`CENTRICMEM_URL` or catalog `origin` is remote), `centricmem note` / `keep` / `done` refuse the leftover hub.

Cross-agent **organised memory** — Skill-first, Markdown units, SQLite FTS5 on the librarian.

```text
Agent (Skill) → librarian HTTP (Bearer selects the library) → `$CENTRICMEM_HOME/projects/<id>/` → local indexer
Code repos stay source-only — memory and Skill live under the Agent product home (`~/.centricmem`). Named pairing keys per library; attach many libraries like workspaces. Agents never CLI-write a hub.
```

## Workspace layout

```text
~/.centricmem/                 # default library (or any drive: setup --workspace)
  workspace.json
  skills/centricmem-agent/
  projects/
    unclassified/
    my-project/
```

A unit is one `.md` (or one `##` in lessons / AGENTS): **Identity / Details / Tags / Body**. Optional original: pointer in Details, bytes in `imported/attach/`. SQLite under `.index/` is a cache. Optional Notion browse uses the same situation names as Skill retrieval (Start / Why / Know / Close / Classify).

CLI install (npm / clone) is separate from this library folder.

## Quick Start

```bash
npm install -g centricmem   # or: npm link from a build
centricmem setup --bootstrap --workspace <library-path> --persist-home
```

Optional (Cursor): `centricmem setup --install-hooks` for automatic session lifecycle — see `skills/centricmem-agent/integrations/`.

**After upgrading the CLI (0.14.x+):** re-run `centricmem setup --install-skill --install-hooks` so Skill + hooks match the linked package.

**Close Non-Micro work (Cloud / no-hooks):** HTTP sweep when the human stops — `POST /keep/sign`, PUT bytes to `putUrl`, `POST /keep` with `uploadId` (or filename+bytes if `health.r2` is false). Never `path=`. Do not `centricmem done` as an agent fallback.

See [BETA.md](./BETA.md) for the full beta guide.

### Core commands

```bash
centricmem ambient                    # session-start preflight (always refreshes .ambient.md)
centricmem doctor                     # CLI / skill / librarian / cwd→library bind
centricmem skill status               # bundled vs installed Skill (pull-based updates)
centricmem libraries                  # list libraries (projects is an alias)
centricmem search "redis" --all       # BM25 across open libraries; add --semantic for hybrid
centricmem search type:decision "#0016"
centricmem search project:host wifi   # jump which project index (not --all)
centricmem note --tags dual-hub --title "Live hub path" --body "…"
centricmem keep ./notes.md --tags topic
centricmem show "imported/kept/notes.md" --original
centricmem search "recipe" --filter civilization=chinese   # corpus metadata filter
centricmem route "how do we handle auth?"   # retrieval routing hint
centricmem log-decision --title "Use Redis" --context "..." --decision "..." --refs "1,4"
centricmem refs 3 --depth 2              # walk memory links (refs/mentions/supersedes)
centricmem log-session "Migrated auth to NextAuth"
centricmem import bundle.json
centricmem inbox                          # unclassified independent files + suggestions
centricmem inbox --apply                  # high-confidence classify only
centricmem suggest-classify decisions/0001-x.md
centricmem classify decisions/0001-x.md --to my-library
centricmem promote --from-distill     # then --pattern "..." --confirm
centricmem status --workspace         # unclassified backlog + per-project health
```

## Agent integration (recommended)

Follow **`$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md`** (short checklist; details in `REFERENCE.md`):

- Session start: HTTP `/health` then `/ambient` (never a stale `.ambient.md`). If the librarian is unreachable, say so once and continue — do not create a hub.
- Cloud / worker: inject `CENTRICMEM_URL` + `CENTRICMEM_TOKEN` (secrets, not git). Do not put `centricmem` CLI write on PATH as a fallback.
- Close Non-Micro with one HTTP sweep (`/keep/sign` then PUT, or filename+bytes if no R2; never `path=`) when the human stops. Search via `/search`; full text via `/show` or `/download`.

## MCP

| Role | What |
|------|------|
| **Drive / cloud MCP** | Optional — sync `$CENTRICMEM_HOME/projects/` to external storage ([SYNC.md](./SYNC.md)) |
| **centricmem-mcp** | Optional/legacy tool wrapper. Prefer Skill + CLI. |

Env: `CENTRICMEM_WORKSPACE`, `CENTRICMEM_PROJECT`

## Features

- Workspace multi-project hub with `unclassified` inbox (cwd unlinked → inbox, not silent `current`)
- Episodic `sessions/` layer + implicit `ambient` preflight
- ImportBundle generic import (decisions/lessons/rules/sessions/research)
- Local FTS5 + BM25 + intent router + temporal decay + negative feedback (`dismiss`)
- Optional hybrid semantic search (`--semantic`, OpenAI-compatible embedding API)
- Decision supersede chains, promote-to-rules workflow, Memory Map
- **Memory Links**: inline `#NNNN` mentions auto-indexed; `centricmem refs` walks the graph; referenced decisions rank higher
- **Folksonomy tags**: `search --tag` / `tag:` require the token in the Tags field **or** the body (AND); tagged rows rank higher. Ambient lists existing tags to reuse. Prefixes: `type:`, `project:`, `id:` / `#NNNN`. Bare words like `decision` are FTS, not type filters.
- **Durable knowledge**: `note` / `log-lesson` stores mental models, facts, logic, and pitfalls — not only gotchas
- **Originals**: `keep <path>` attaches full source; `show` / `show --original` reads it after search
- **Corpus metadata**: `--filter key=value` on imported docs with YAML frontmatter; optional `domain_boost` in `config.json`
- **Skill status**: `centricmem skill status` compares bundled vs installed Skill (v0.13+)
- **Import contract**: [IMPORT_BUNDLE.md](./IMPORT_BUNDLE.md)

## Semantic search (optional)

Per-project `config.json`:

```json
{
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "api_key_env": "OPENAI_API_KEY",
    "rrf_k": 60
  }
}
```

Then `centricmem index --embed` and `centricmem search "..." --semantic` (RRF fusion of BM25 + vector ranks).
API keys are read from env only — never stored in memory files.

## Known limitations

- Emoji not searchable (FTS5 unicode61)
- Semantic mode requires network + API key (BM25 works offline)
- Memory links are project-scoped; cross-project links on the roadmap

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — attribution required; no commercial use.

Design: [PRODUCT.md](./PRODUCT.md) · Implementation: [ARCHITECTURE.md](./ARCHITECTURE.md) · L1 example: [ACADEMIC_DB_REPORT.md](./ACADEMIC_DB_REPORT.md) · Sync: [SYNC.md](./SYNC.md) · Beta: [BETA.md](./BETA.md)
