# CentricMem lifecycle integrations

CentricMem implicit memory uses **librarian HTTP**. Agents follow [SKILL.md](../SKILL.md): ambient at start, hold writes in agent memory, **one sweep at session end**. Do not CLI-write a hub. Do not `setup --bootstrap`.

| Event | Agent |
|-------|--------|
| **onSessionStart** | HTTP `GET /ambient` (operators may still run `centricmem ambient --write` **on the librarian host** to refresh `.ambient.md`) |
| **onSessionEnd** | Skill close = one sweep (`POST /keep` bytes, `/note`, `/done`). **Do not** `centricmem log-session` from a guest / Cloud worker |
| **onCommit** (optional, librarian host only) | `centricmem index --all --quiet` |

**Install → data flows (Cursor):** `centricmem setup --install-skill` copies the Skill. `setup --install-hooks` still copies [`cursor-hooks.json`](./cursor-hooks.json) into the **code repo** `.cursor/hooks/hooks.json`. Those hook commands exec CLI — **disable or do not install them** on a hosted librarian / My Machines worker, or they become a second writer. Cloud Agent / private workers **do not** run repo hooks; Skill close is the sweep.

If the librarian is unreachable: say once, keep working, do not bootstrap.

Cold start of an **empty hub** is an operator job (`centricmem setup --workspace … --persist-home`), never an agent repair.

Ambient shows `Curate: today_sessions=N` — if `N=0` after Non-Micro work, you still owe a tagged close **sweep**.

Canonical skill path: `$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md` (also mirrored to `~/.cursor/skills`, `~/.codex/skills`, and `~/.agents/skills` on setup).

## Reference recipes

| File | Agent / tool |
|------|----------------|
| [cursor-hooks.json](./cursor-hooks.json) | Cursor — optional; do not install on a hosted librarian worker |
| [claude-code-settings.snippet.json](./claude-code-settings.snippet.json) | Claude Code — only if commands hit HTTP, not a guest-disk hub |
| [mcp-config.snippet.json](./mcp-config.snippet.json) | Host MCP `centricmem-host` → librarian URL |
| [capture-adapters/](./capture-adapters/) | Keep other memory skills as capture; map → ImportBundle → `centricmem import` |

Import contract: [IMPORT_BUNDLE.md](../../../../IMPORT_BUNDLE.md) (package root).
