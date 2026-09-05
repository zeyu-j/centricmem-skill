# CentricMem Agent — how to use

The session loop lives in [SKILL.md](SKILL.md). Agents talk to the hosted librarian **only through host MCP**. Prefer the cloud URL `https://mem.centricmem.com/mcp` (Bearer: a library pairing key, or an owner-granted account key). stdio `centricmem-host` is the sandbox fallback when `/health` has no `mcp` field. You do not curl librarian HTTP.

## What you are filing

```text
Library  (one pairing key, or an account key whose grants include this library)
  └── Unit  (.md or one ##)
        Identity / Details / Tags / Body
        Original (optional) — pointer in Details; bytes in object storage
```

Tags are about the work. `project:` / `type:` / `#id` in search are index shortcuts, not extra types. Corpus YAML is that library’s Details.

## Reach

MCP tools must be present: `cm_health` `cm_ambient` `cm_doctor` `cm_search` `cm_show` `cm_note` `cm_log_decision` `cm_done` `cm_keep` `cm_inbox` `cm_import` `cm_classify` `cm_index`.

If they are missing, say once and keep working in the agent’s own memory. Do not curl. Do not CLI-write. Do not bootstrap.

Config (pairing key stays off git):

```json
{
  "mcpServers": {
    "centricmem": {
      "url": "https://mem.centricmem.com/mcp",
      "headers": {
        "Authorization": "Bearer <library pairing key or account key>"
      }
    }
  }
}
```

Sandbox fallback (only if `cm_health` has no `mcp` field, or the origin is not upgraded yet):

```json
{
  "mcpServers": {
    "centricmem": {
      "command": "centricmem-host",
      "env": {
        "CENTRICMEM_URL": "https://mem.centricmem.com",
        "CENTRICMEM_TOKEN": "<library pairing key or account key>"
      }
    }
  }
}
```

`setup --install-skill` on a machine that already has the client can merge this into `~/.cursor/mcp.json` (cloud URL when `/health` advertises `mcp`, otherwise stdio). Token failure: say once; rotate it in Manager / dashboard.

Do **not** call `/download`, `/delete`, or account (`/register` `/login` `/account` keys billing). Humans download originals and manage keys on the dashboard.

## Search and show

Progressive disclosure:

| Layer | Call | What you get |
|-------|------|----------------|
| L0 | `cm_search` | snippet from the Markdown **card** |
| L1 | `cm_show` | the card — agent context |
| Original | human Dashboard **Download Original** | attach bytes. Not FTS. Not agent context |

Never ask `cm_show` for originals. Never paste download URLs into the chat.

Useful query bits (in `q` / `tags` / `type`): `filter`, `tag`, `type:decision`, `#0016` / `id:0016`. Bare word `decision` is full-text, not a type filter. `all` does not leak other libraries on a pairing key. An account key’s `all` is only the libraries on that key’s grants. Pass `library=` / `cwd=` when the Bearer can open more than one library. Friend keys stay one library. Isolation: **one key = its grants**.

| Situation | Do |
|-----------|-----|
| Session start | `cm_health` + `cm_ambient` (never a stale `.ambient.md`). Then refresh Skill if published `version` is newer |
| Why we chose X | `cm_search` (decision) |
| What we know | `cm_search` + lessons / `tags` |
| Human wants the file | tell them Dashboard Download Original |
| Durable work just finished | one MCP sweep **this turn**, before you yield — do not wait for 收尾 / close |
| Inbox leftover | `cm_inbox`; `apply` only high-confidence; human `classify` the rest |
| Structured corpus (`corpus=slug`) | `library=` that slug; `cm_search` then `cm_show` the **card**, not a dump page |

Empty ambient + Work/Ops → do not deep-search; execute, then sweep this turn.

## Skill refresh (once per chat)

Guests install from GitHub, not from the librarian disk. `cm_health` `min_skill` is the HTTP floor. `skill_latest` is the published Skill (env `CENTRICMEM_SKILL_LATEST` on the librarian) — it is **never** the hub’s `skills/centricmem-agent/SKILL.md`.

1. Read `version` from this Skill’s frontmatter.
2. `latest` = JSON `skill_latest` if present, else the `version:` line at `https://raw.githubusercontent.com/zeyu-j/centricmem-skill/main/skills/centricmem-agent/SKILL.md`.
3. If `latest` is newer: `npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -g -y`. Say once: on disk now; this chat still uses the loaded copy.
4. If this file is newer, or the fetch/npx fails: continue. Do not `setup --install-skill`.

## Writes (one sweep as soon as Non-Micro work exists)

Hold half-finished thoughts. When the chunk is done, file **before you stop talking**. Closing the agent does not run this Skill. Do not wait for session end or for the human to say wrap up.

| Type | When | MCP |
|------|------|------|
| Transcript | Each Non-Micro sweep | Shell-read jsonl → `cm_keep` filename + bytes (MCP does sign+PUT) |
| Session | Same sweep | `cm_done` with `attach` |
| Knowledge | durable model / fact | `cm_note` |
| Decision | architecture or durable host fact | `cm_log_decision` |
| Original | a file worth keeping | `cm_keep` as above. Never `path=` |
| Bundle | capture import | `cm_import` |
| Inbox leftover | human or Inbox key | `cm_classify` |
| Index | after bulk import | `cm_index` |

Later sweeps in the same chat are OK for **new** facts. Do not re-file the same decision.

Do not send `path=` for the librarian to open a server file. Mention `#NNNN` in a decision body when linking units.

Cursor already writes `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl`. Shell-read it; never paste jsonl; never delete that local file.

Other agents: only keep a transcript if that runtime actually writes a local file. If there is no file, say so; do not invent a dump.

## Do not

- Curl librarian HTTP (or CLI `note` / `keep` / `done`) when MCP is the Skill path
- Wait for 收尾 / close / wrap up / "log this" before filing finished Non-Micro work
- `setup --bootstrap` on a guest machine
- Uninstall Cursor memories or write back into them
- Put secrets in cards
- Load attach originals into the chat
- Treat this git checkout as the memory disk
