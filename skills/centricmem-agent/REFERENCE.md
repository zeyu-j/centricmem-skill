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
| Session start | `GET /ambient` (never a stale `.ambient.md`) |
| Why we chose X | `search` (decision) |
| What we know | `search` + lessons / `tag` |
| Human wants the file | tell them Dashboard Download Original |
| Close | one HTTP sweep — not every turn |
| Inbox leftover | list; `--apply` only high-confidence; human `classify` the rest |
| Structured corpus (`corpus=slug`) | that library’s token; `search` + `filter`; `show` the **card**, not a dump page |

Empty ambient + Work/Ops → do not deep-search; execute, then close.

## Writes (one sweep at close)

Hold these until session end. Session capture stays in the agent’s own memory.

| Type | When | HTTP |
|------|------|------|
| Transcript | Non-Micro close | `/keep/sign` → PUT bytes → `/keep` `{uploadId}` (or filename+bytes if R2 is off) |
| Session | Non-Micro end | `/done` with `attach` |
| Knowledge | durable model / fact | `/note` |
| Decision | architecture or durable host fact | `/log-decision` |
| Original | a file worth keeping | `/keep` as above. Never `path=` |

Do not send `path=` for the librarian to open a server file. Mention `#NNNN` in a decision body when linking units.

Cursor already writes `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl`. Shell-read it; never paste jsonl; never delete that local file.

Other agents: only keep a transcript if that runtime actually writes a local file. If there is no file, say so; do not invent a dump.

## Do not

- CLI `note` / `keep` / `done` / `setup --bootstrap` on a guest machine
- Uninstall Cursor memories or write back into them
- Put secrets in cards
- Load attach originals into the chat
- Treat this git checkout as the memory disk
