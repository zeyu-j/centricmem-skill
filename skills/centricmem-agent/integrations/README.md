# CentricMem lifecycle integrations

CentricMem implicit memory uses **agent-agnostic lifecycle hooks**. Wire these CLI commands wherever your agent supports session lifecycle events.

| Event | Command | Purpose |
|-------|---------|---------|
| **onSessionStart** | `centricmem ambient --write` | Refresh `.centricmem/.ambient.md` with project context |
| **onSessionEnd** | `centricmem log-session "<summary>"` then `centricmem index --all --quiet` | Capture session + rebuild index |
| **onCommit** (optional) | `centricmem index --all --quiet` | Keep index in sync after git commits (`centricmem init --git-hook`) |

If your agent has **no lifecycle hooks**, run `centricmem ambient` (or read `.centricmem/.ambient.md`) at the start of every session manually.

## Reference recipes

Copy and adapt for your environment:

| File | Agent / tool |
|------|----------------|
| [cursor-hooks.json](./cursor-hooks.json) | Cursor — install via `centricmem setup --install-hooks` or copy to `.cursor/hooks/hooks.json` |
| [claude-code-settings.snippet.json](./claude-code-settings.snippet.json) | Claude Code — merge into `.claude/settings.json` |
| [mcp-config.snippet.json](./mcp-config.snippet.json) | Any MCP-capable agent — stdio `centricmem-mcp` server |
| [capture-adapters/](./capture-adapters/) | Keep other memory skills as capture; map → ImportBundle → `centricmem import` |

Canonical skill path: `.centricmem/skills/centricmem-agent/SKILL.md`
