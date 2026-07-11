# CentricMem Beta Guide (v0.14)

## Install from source

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill
npm install
npm run build
npm link
```

Public release repo: [centricmem-skill](https://github.com/zeyu-j/centricmem-skill) (Skill-first README).

### Upgrading from 0.13 / 0.14.0

After pulling a new build, refresh the installed Skill and Cursor hooks (required for `--auto` sessions and path fixes):

```bash
npm run build && npm link
cd <your-code-project>
centricmem setup --install-skill --install-hooks
```

## Product home setup

Memory and Skill live under the **Agent product home**, not inside business git:

```bash
cd <your-code-project>
centricmem setup --link-all --migrate-discover --install-skill
```

First-time migrate from a legacy repo-local hub:

```bash
centricmem setup --migrate-from-local --install-skill
```

Optional (Cursor only): `centricmem setup --install-hooks` — wires session lifecycle per `$CENTRICMEM_HOME/skills/centricmem-agent/integrations/`.

First setup or `centricmem index` on a large import may take a minute or more — wait until you see **Index complete**.

This creates / uses:

```text
~/.centricmem/                 # $CENTRICMEM_HOME (override with env)
  workspace.json
  skills/
    centricmem-agent/SKILL.md
  projects/
    unclassified/              # default import / staging target
    <linked-projects>/
  .ambient.md
```

Code repos stay source-only. Optional Cursor hooks install to `<code-repo>/.cursor/hooks/` when requested — no `.cursorrules` / `CLAUDE.md` product pointers are written into git trees.

## Skill-first workflow

Agents should follow **`$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md`** (also mirrored to `~/.cursor/skills/centricmem-agent/` on install):

- Load: read `projects/<current>/AGENTS.md` + `active_context.md`
- Session start: `centricmem ambient` (or lifecycle hooks — see `integrations/`)
- Search: `centricmem search "keywords"` (local indexer, not MCP)
- Filter corpus: `centricmem search "…" --filter civilization=chinese --filter type=recipe`
- Import: map any source → ImportBundle JSON → `centricmem import bundle.json` ([IMPORT_BUNDLE.md](./IMPORT_BUNDLE.md))
- Classify: `centricmem classify decisions/0001-x.md --to my-project`

## Skill updates (pull-based)

```bash
centricmem skill status
centricmem skill status centricmem-agent --json
```

Compares bundled vs installed Skill (`ok` | `outdated` | `missing` | `modified` | `incompatible`). `ambient` appends a hint when not `ok`.

### Migrating from pre-0.12 (`.cursor/skills/`) or pre-0.13 (repo `.centricmem/`)

```bash
centricmem setup --migrate-from-local --install-skill
# Optional Cursor hooks: centricmem setup --install-hooks
```

## MCP = external sync only (L2)

MCP (e.g. Google Drive) is **optional** and used to **sync** `$CENTRICMEM_HOME/projects/` to cloud storage.

It is **not** the local indexer. Local search always uses `centricmem search` + SQLite FTS5.

`centricmem-mcp` is optional for agents that prefer tool-based access. See `skills/centricmem-agent/integrations/mcp-config.snippet.json`.

Run `centricmem setup --drive-mcp-hint` for a generic MCP template.

## Multi-project

```bash
centricmem link my-app/
centricmem use my-app
centricmem projects
centricmem search "redis" --all
```

## ImportBundle example

See [IMPORT_BUNDLE.md](./IMPORT_BUNDLE.md) for the full contract. Minimal example:

```json
{
  "version": 1,
  "project": "unclassified",
  "source": { "type": "notion-database", "name": "ADRs" },
  "decisions": [
    {
      "title": "Use Redis",
      "context": "Rate limiting",
      "decision": "Redis with sliding window",
      "external_id": "notion:abc"
    }
  ]
}
```

```bash
centricmem import bundle.json
centricmem classify decisions/0001-use-redis.md --to my-app
```

### Re-import / incremental sync

| Bundle field | Same `external_id` again | Notes |
|--------------|--------------------------|-------|
| `imported[]`, `research[]` | **Upsert** (update file + reindex) | Capture-endpoint raw material |
| `decisions[]`, `lessons[]`, `sessions[]` | **Skip** | Append-only; organize-layer decisions do not overwrite history |
| `rules[]` with `external_id` | **Skip** | Prevents AGENTS.md bloat on repeated migrate |
| `rules[]` without `external_id` | Always append | Prefer stable IDs from the source system |
| `context` | Always overwrite | Last import wins |

```bash
# Default: upsert raw imported/research docs
centricmem import capture-export.json

# One-shot migrate style: skip anything already seen
centricmem import capture-export.json --skip-existing
```

Keep stable `external_id`s from the capture system (e.g. `notion:abc`, `mb:decisionLog#Use-WebSocket`).

## Migrating from v0.7 (single flat hub)

Prefer `centricmem setup --migrate-from-local`. Manual equivalent: move flat files under `projects/unclassified/`, then `centricmem index --all`.

## Known limitations

- Emoji not searchable (FTS5 unicode61)
- Semantic search (`--semantic`) needs an OpenAI-compatible API key; BM25 works offline
- MCP sync is manual / agent-guided (no auto bidirectional DB sync)

## Verify

```bash
npm run test:all
centricmem projects
centricmem status
centricmem skill status
```

## Feedback

Open a GitHub issue using the **Beta Feedback** template.
