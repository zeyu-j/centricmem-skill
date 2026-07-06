# CentricMem

**Give your coding agent a memory that survives between chats.**

Every new conversation, the agent forgets what you decided last week, what pitfalls you hit, and what the project is about. CentricMem fixes that — locally, in plain Markdown you can read and version-control.

---

## What it is

CentricMem is a **project memory layer** for any agent (Cursor, Claude Code, Manus, Windsurf, MCP clients, …). It stores decisions, lessons, current focus, and session notes — and helps agents find the right context at the right time.

```
You + Agent  →  CentricMem  →  .centricmem/  (Markdown on disk)
                    ↑
              remembers across sessions
```

Canonical agent skill: **`.centricmem/skills/centricmem-agent/SKILL.md`**

---

## Implicit memory (lifecycle)

Good memory shouldn't require saying "remember this" every five minutes.

| Event | Command |
|-------|---------|
| Session start | `centricmem ambient --write` |
| Session end | `centricmem log-session "…"` then `centricmem index --all --quiet` |

If your agent supports lifecycle hooks, wire these commands (see `skills/centricmem-agent/integrations/`).  
**Cursor only:** `centricmem setup --install-hooks` installs hooks automatically.

No hooks? The Skill tells the agent to run `centricmem ambient` at session start manually.

---

## Get started

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill
npm install && npm run build && npm link

cd <your-workspace-root>
centricmem setup --link-all --migrate-discover --install-skill
```

Optional (Cursor): `centricmem setup --install-hooks`

**Typical workflow:**

1. Agent reads `.centricmem/skills/centricmem-agent/SKILL.md`
2. Session start — context loads (`centricmem ambient` or hooks)
3. Before big assumptions → `centricmem search "auth strategy"`
4. After a significant choice → `centricmem log-decision --title "…" --context "…" --decision "…"`
5. Before ending → `centricmem log-session "what we accomplished"`

After upgrading: `centricmem setup --install-skill` then `centricmem skill status` (should show `ok`).

---

## Workspace layout

```text
.centricmem/
  workspace.json
  skills/
    centricmem-agent/SKILL.md
  projects/
    my-app/
    unclassified/
```

Link a subfolder: `centricmem link ./my-app`  
Switch focus: `centricmem use my-app`  
Search everywhere: `centricmem search "redis" --all`

---

## What's in the box (v0.12.0)

- **Agent-agnostic Skill** at `.centricmem/skills/` (not tied to one IDE)
- Lifecycle integration recipes (`integrations/` — Cursor, Claude Code, MCP)
- Local-first storage (Markdown + FTS5 index)
- Decision history with memory links (`centricmem refs`)
- **Skill status** — `centricmem skill status` (pull-based updates)
- Import via **ImportBundle**; workspace multi-project hub
- Optional semantic search (`--semantic`); MCP for sync only

---

## Documentation

| Doc | For |
|-----|-----|
| [BETA.md](./BETA.md) | Install, configure, troubleshoot |
| [PRODUCT.md](./PRODUCT.md) | Memory architecture (design source of truth) |
| [skills/centricmem-agent/integrations/README.md](./skills/centricmem-agent/integrations/README.md) | Lifecycle hook recipes |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical implementation |
| [SYNC.md](./SYNC.md) | Optional cloud sync contract |

---

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, research, and noncommercial use.  
Commercial use requires a separate license.
