# CentricMem Agent — how to use

The session loop lives in [SKILL.md](SKILL.md). This file is the extra detail agents need while talking to the **hosted librarian**.

## What you are filing

```text
Library  (one pairing key)
  └── Unit  (.md or one ##)
        Identity / Details / Tags / Body
        Original (optional) — pointer in Details; bytes in object storage
```

Tags are about the work. `project:` / `type:` / `#id` in search are index shortcuts, not extra types. Corpus YAML is that library’s Details.

## Reach

- **URL:** `CENTRICMEM_URL`, else catalog `origin` (`%APPDATA%/centricmem/libraries.json` or `$XDG_CONFIG_HOME/centricmem/libraries.json`). Hosted: `https://mem.centricmem.com`.
- **Token:** catalog row for cwd / `CENTRICMEM_PROJECT`, or `CENTRICMEM_TOKEN`. Bearer selects **one** library.
- `GET /health` with `Authorization: Bearer <token>`. 401 or unreachable: say once; keep working in the agent’s own memory. Do not bootstrap. Do not CLI-write.

## Search and show

Progressive disclosure:

| Layer | Call | What you get |
|-------|------|----------------|
| L0 | `GET /search` | snippet from the Markdown **card** |
| L1 | `GET /show` | the card — agent context |
| Original | human Dashboard **Download Original** | attach bytes. Not FTS. Not agent context |

Never `GET /show?original=`. Never paste `/download?original=1` into the chat.

Useful query bits: `filter`, `tag`, `type:decision`, `#0016` / `id:0016`. Bare word `decision` is full-text, not a type filter. `--all` on HTTP does not leak other libraries.

| Situation | Do |
|-----------|-----|
| Session start | `GET /health` + `GET /ambient` (never a stale `.ambient.md`). Then refresh Skill if published `version` is newer (REFERENCE) |
| Why we chose X | `search` (decision) |
| What we know | `search` + lessons / `tag` |
| Human wants the file | tell them Dashboard Download Original |
| Durable work just finished | one HTTP sweep **this turn**, before you yield — do not wait for 收尾 / close |
| Inbox leftover | list; `--apply` only high-confidence; human `classify` the rest |
| Structured corpus (`corpus=slug`) | that library’s token; `search` + `filter`; `show` the **card**, not a dump page |

Empty ambient + Work/Ops → do not deep-search; execute, then sweep this turn.

## Skill refresh (once per chat)

Guests install from GitHub, not from the librarian disk. `/health` `min_skill` is the HTTP floor. `skill_latest` is the published Skill (env `CENTRICMEM_SKILL_LATEST` on the librarian) — it is **never** the hub’s `skills/centricmem-agent/SKILL.md`.

1. Read `version` from this Skill’s frontmatter.
2. `latest` = JSON `skill_latest` if present, else the `version:` line at `https://raw.githubusercontent.com/zeyu-j/centricmem-skill/main/skills/centricmem-agent/SKILL.md`.
3. If `latest` is newer: `npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -g -y`. Say once: on disk now; this chat still uses the loaded copy.
4. If this file is newer, or the fetch/npx fails: continue. Do not `setup --install-skill`.

## Writes (one sweep as soon as Non-Micro work exists)

Hold half-finished thoughts. When the chunk is done, file **before you stop talking**. Closing the agent does not run this Skill. Do not wait for session end or for the human to say wrap up.

| Type | When | HTTP |
|------|------|------|
| Transcript | Each Non-Micro sweep | `/keep/sign` → PUT bytes → `/keep` `{uploadId}` (or filename+bytes if R2 is off) |
| Session | Same sweep | `/done` with `attach` |
| Knowledge | durable model / fact | `/note` |
| Decision | architecture or durable host fact | `/log-decision` |
| Original | a file worth keeping | `/keep` as above. Never `path=` |

Later sweeps in the same chat are OK for **new** facts. Do not re-file the same decision.

Do not send `path=` for the librarian to open a server file. Mention `#NNNN` in a decision body when linking units.

Cursor already writes `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl`. Shell-read it; never paste jsonl; never delete that local file.

Other agents: only keep a transcript if that runtime actually writes a local file. If there is no file, say so; do not invent a dump.

## Do not

- Wait for 收尾 / close / wrap up / "log this" before filing finished Non-Micro work
- CLI `note` / `keep` / `done` / `setup --bootstrap` on a guest machine
- Uninstall Cursor memories or write back into them
- Put secrets in cards
- Load attach originals into the chat
- Treat this git checkout as the memory disk
