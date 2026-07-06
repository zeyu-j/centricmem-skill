# CentricMem Beta Guide (v0.12.0)

## Install from source

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill
npm install
npm run build
npm link
```

This is the public release repo (Skill-first README). Development also happens in the private [centricmem](https://github.com/zeyu-j/centricmem) monorepo.

## Workspace setup

```bash
cd <your-workspace-root>
centricmem setup --link-all --migrate-discover --install-skill
```

Optional (Cursor only): `centricmem setup --install-hooks` — wires session lifecycle per `skills/centricmem-agent/integrations/`.

First setup or `centricmem index` on a large import may take a minute or more — wait until you see **Index complete**.

This creates:

```text
.centricmem/
  workspace.json
  skills/
    centricmem-agent/SKILL.md
  projects/
    unclassified/     # default import target
    <linked-projects>/
```

## Skill-first workflow

Agents should follow **`.centricmem/skills/centricmem-agent/SKILL.md`**:

- Load: read `projects/<current>/AGENTS.md` + `active_context.md`
- Session start: `centricmem ambient` (or lifecycle hooks — see `integrations/`)
- Search: `centricmem search "keywords"` (local indexer, not MCP)
- Filter corpus: `centricmem search "…" --filter civilization=chinese --filter type=recipe`
- Import: map any source → ImportBundle JSON → `centricmem import bundle.json`
- Classify: `centricmem classify decisions/0001-x.md --to my-project`

## Skill updates (pull-based)

```bash
centricmem skill status
centricmem skill status centricmem-agent --json
```

Compares bundled vs installed Skill (`ok` | `outdated` | `missing` | `modified` | `incompatible`). `ambient` appends a hint when not `ok`.

### Migrating from pre-0.12 (`.cursor/skills/`)

```bash
centricmem setup --install-skill
# Optional Cursor hooks: centricmem setup --install-hooks
```

## MCP = external sync only

MCP (e.g. Google Drive) is **optional** and used to **sync** `.centricmem/projects/` to cloud storage.

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

## Migrating from v0.7 (single .centricmem/)

```bash
centricmem init
# Move old files:
#   .centricmem/AGENTS.md → .centricmem/projects/unclassified/AGENTS.md
#   .centricmem/decisions/ → .centricmem/projects/unclassified/decisions/
# Remove flat files at .centricmem/ root (keep workspace.json + projects/)
centricmem index --all
```

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
