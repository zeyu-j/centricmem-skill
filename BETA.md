# CentricMem Beta Guide (v0.9)

## Install from source

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill
npm install
npm run build
npm link
```

## Workspace setup

```bash
cd <your-workspace-root>
centricmem setup --link-all --migrate-discover --install-skill --install-hooks
```

`--install-hooks` copies Cursor session hooks (`sessionStart` → `centricmem ambient --write`) for implicit memory.

This creates:

```text
.centricmem/
  workspace.json
  projects/
    unclassified/     # default import target
    <linked-projects>/
```

## Skill-first workflow

Agents should follow `.cursor/skills/centricmem-agent/SKILL.md`:

- Load: read `projects/<current>/AGENTS.md` + `active_context.md`
- Search: `centricmem search "keywords"` (local indexer, not MCP)
- Import: map any source → ImportBundle JSON → `centricmem import bundle.json`
- Classify: `centricmem classify decisions/0001-x.md --to my-project`

## MCP = external sync only

MCP (e.g. Google Drive) is **optional** and used to **sync** `.centricmem/projects/` to cloud storage.

It is **not** the local indexer. Local search always uses `centricmem search` + SQLite FTS5.

`centricmem-mcp` is optional/legacy for Cursor users who want tool-based access.

### Environment

Point agents at your workspace root:

```bash
CENTRICMEM_WORKSPACE=/path/to/your/workspace
CENTRICMEM_PROJECT=<optional-current-slug>
```

Optional Drive MCP — run `centricmem setup --drive-mcp-hint` for a template.

## Multi-project

```bash
centricmem link my-app
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
```

## Feedback

Open a GitHub issue using the **Beta Feedback** template.
