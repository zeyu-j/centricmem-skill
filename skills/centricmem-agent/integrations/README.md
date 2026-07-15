# CentricMem lifecycle integrations

CentricMem implicit memory uses **agent-agnostic lifecycle hooks**. Wire these CLI commands wherever your agent supports session lifecycle events.

| Event | Command | Purpose |
|-------|---------|---------|
| **onSessionStart** | `centricmem ambient --write` | Refresh `$CENTRICMEM_HOME/.ambient.md` with project context |
| **onSessionEnd** | `centricmem log-session --auto --title hooks` then `centricmem index --all --quiet` | Capture focus from `active_context.md` + rebuild workspace index |
| **onCommit** (optional) | `centricmem index --all --quiet` | Keep index in sync after git commits (`centricmem init --git-hook`) |

**Install → data flows (Cursor):** `centricmem setup --install-hooks` copies [`cursor-hooks.json`](./cursor-hooks.json) into the **code repo** `.cursor/hooks/hooks.json`. Session start refreshes ambient; session end auto-logs **Current Focus** (not a placeholder) and reindexes.

For meaningful session notes after real progress, agents should still run `centricmem log-session "natural language summary"` — `--auto` is the zero-friction baseline.

If your agent has **no lifecycle hooks** (including many **Cloud Agent** runs), run `centricmem ambient` (or read `$CENTRICMEM_HOME/.ambient.md`) at the start of every session, and after significant progress or before ending run `centricmem log-session "natural language summary"`. Cursor hooks in a code repo `.cursor/hooks/` do **not** auto-fire for Cloud runs — do not rely on `--auto` alone there.

**Cold start:** if `ambient` / `status` / `skill status` prints `state=UNINITIALIZED` or `hub: UNINITIALIZED` (exit 0), bootstrap then continue:

```bash
cd <repos-parent-or-project>
centricmem setup --bootstrap
# multi-repo Cloud mounts: add --link /path/to/repo (repeatable)
centricmem ambient
```

Other agents: use the **same CLI contract** (ambient / log-session / index) — Claude Code snippet, MCP config, or your own lifecycle.

## Reference recipes

Copy and adapt for your environment:

| File | Agent / tool |
|------|----------------|
| [cursor-hooks.json](./cursor-hooks.json) | Cursor — install via `centricmem setup --install-hooks` or copy to `.cursor/hooks/hooks.json` |
| [claude-code-settings.snippet.json](./claude-code-settings.snippet.json) | Claude Code — merge into `.claude/settings.json` |
| [mcp-config.snippet.json](./mcp-config.snippet.json) | Any MCP-capable agent — stdio `centricmem-mcp` server (L2/optional) |
| [capture-adapters/](./capture-adapters/) | Keep other memory skills as capture; map → ImportBundle → `centricmem import` |

Canonical skill path: `$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md` (also mirrored to `~/.cursor/skills/centricmem-agent/` on setup).

Import contract: [IMPORT_BUNDLE.md](../../../../IMPORT_BUNDLE.md) (package root).
