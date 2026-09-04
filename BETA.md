# CentricMem Beta Guide (v0.21.6)

Agents: HTTP only (`CENTRICMEM_URL` or catalog `origin` + library pairing key). Capture stays in the agent's own memory; the librarian is the manager layer. Cards for agents; originals for humans to download. Operators cold-start a hub with `--bootstrap`. Do not treat this file as permission to CLI-write from a guest agent.

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

Memory lives in a **library folder** you choose (`--workspace`). The CLI clone is only the client.

```bash
centricmem setup --bootstrap --workspace <library-path> --persist-home
# migrate an old hub that sat inside the clone:
centricmem setup --workspace <library-path> --from-home <old-hub> --migrate-home --persist-home --retire-old-home --install-skill
# Cloud multi-repo mounts:
centricmem setup --bootstrap --workspace <library-path> --link /path/to/repo-a --link /path/to/repo-b
```

If HTTP `/ambient` (or operator `centricmem ambient`) prints `state=UNINITIALIZED`, an **operator** runs `--bootstrap --workspace … --persist-home`. Agents say once and continue — they do not bootstrap.

### Guest of a remote librarian

If `CENTRICMEM_URL` or catalog `origin` is a non-loopback URL, this machine is a **guest**. `centricmem note` / `keep` / `done` / `serve` / `index` refuse the leftover `CENTRICMEM_HOME`. Refresh Skill with `centricmem setup --install-skill` only — do not `--bootstrap`, `--persist-home`, or `--link`. `doctor` lists catalog libraries (HTTP), not leftover `workspace.json` slugs.

Cloud / private worker: inject `CENTRICMEM_URL` + `CENTRICMEM_TOKEN`. A Skill file on disk is not enough. Operators run `centricmem doctor` on the librarian host.

Non-Micro close (agents): one HTTP sweep when the human stops (`/keep/sign` → PUT → `/keep`, then `/note` `/done` as needed). Not `centricmem done` from a guest disk.

First-time migrate from a legacy repo-local hub:

```bash
centricmem setup --migrate-from-local --install-skill
```

Optional (Cursor only): `centricmem setup --install-hooks` — wires session lifecycle per `$CENTRICMEM_HOME/skills/centricmem-agent/integrations/`.

First setup or `centricmem index` on a large import may take a minute or more — wait until you see **Index complete**.

This creates / uses:

```text
$CENTRICMEM_HOME/              # librarian hub (override with env; not a leftover ~/.centricmem)
  workspace.json
  skills/
    centricmem-agent/SKILL.md
  projects/
    unclassified/              # inbox + import staging (writes land here if cwd is unlinked)
    <linked-projects>/
  .ambient.md
```

Code repos stay source-only. Optional Cursor hooks install to `<code-repo>/.cursor/hooks/` when requested — no `.cursorrules` / `CLAUDE.md` product pointers are written into git trees.

## Skill-first workflow

Agents should follow **`$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md`** (also mirrored to `~/.cursor/skills/centricmem-agent/` on install):

- Session start: HTTP `/health` then `/ambient` (`CENTRICMEM_URL`, or loopback only if this machine **is** the librarian)
- Search: librarian `GET /search` then `GET /show` for the **card**. Humans download originals. Not a second MCP store
- Close: one HTTP sweep (`/keep` bytes or signed R2 PUT, `/note`, `/done`) when the human stops — not CLI `done`
- Filter corpus: `GET /search` with that library's Bearer (`filter`, `tag`)
- Import / classify: operators on the librarian host, or HTTP `/import` `/classify` in the close sweep ([IMPORT_BUNDLE.md](./IMPORT_BUNDLE.md))

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

## MCP

Sandbox agents use **centricmem-host** → librarian URL. `centricmem-mcp` is optional/legacy. Search is librarian FTS, not a second store.

Product backup is operator **restic → R2**, not Drive MCP / rsync. See [SYNC.md](./SYNC.md).

## Multi-project

Writes: `-p` / `CENTRICMEM_PROJECT` → cwd matched to a linked `sourceDir` → otherwise **`unclassified` (inbox)**. `centricmem use` only pins display.

```bash
centricmem link my-app/
centricmem setup --link /path/to/my-app   # bind this cwd so writes go to my-app
centricmem projects
centricmem inbox                          # list unclassified independent files
centricmem inbox --apply                  # high-confidence only
centricmem classify decisions/0001-x.md --to my-app
centricmem search "redis" --all
```

`lessons.md` is still whole-file in inbox. New session units are one file per close (`sessions/<stamp>-<writer>-<id>.md`) and can be classified; leftover `YYYY-MM-DD.md` daily bundles stay skip.

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
- Product sync is not Drive/rsync; cold backup is operator restic→R2

## Verify

```bash
npm run test:all
centricmem projects
centricmem status
centricmem skill status
```

## Feedback

Open a GitHub issue using the **Beta Feedback** template.
