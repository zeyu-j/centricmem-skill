# CentricMem

**Give your AI coding agent a memory that survives between chats.**

Every new conversation starts from zero — the agent forgets what you decided, what broke last time, and what the project is really about. CentricMem fixes that by saving project memory as plain Markdown files on your machine. No cloud account required.

Works with **Cursor**, **Claude Code**, and other agents that read Skills or run CLI commands.

---

## Install

Requires **Node.js 20+**.

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill
npm install && npm run build && npm link
```

---

## Quick Start

In the folder where you work (your repo or workspace root):

```bash
centricmem setup --install-skill --install-hooks
```

This creates a `.centricmem/` folder, installs an agent Skill, and (optionally) hooks that load context when a session starts.

From there, your agent reads `skills/centricmem-agent/SKILL.md` and knows how to search, save, and update memory.

**Typical day:**

1. Open a session — context loads automatically (with hooks enabled)
2. Ask the agent to search past work: `centricmem search "auth strategy"`
3. After a big decision, log it: `centricmem log-decision --title "..." --context "..." --decision "..."`
4. Before you stop, note what you did: `centricmem log-session "shipped login, tests still flaky"`

After upgrading CentricMem, refresh the Skill:

```bash
centricmem setup --install-skill
centricmem skill status   # should show ok
```

---

## Usage

Start in any project folder that has `.centricmem/`:

```bash
centricmem search "redis caching"          # find related memories
centricmem log-decision --title "..." ...  # record a decision
centricmem log-session "what we did today" # end-of-session note
centricmem ambient                         # print current project context
centricmem refs 5                          # see what decision #5 links to
centricmem --help                          # full command list
```

Memory files live under `.centricmem/projects/<name>/` — normal Markdown you can open, edit, and commit to git.

---

## What gets remembered

CentricMem sorts memory by purpose, not just keywords:

- **Context** — what you're working on right now
- **Decisions** — choices you made and why
- **Lessons** — mistakes and how to avoid them again
- **Sessions** — short notes from each work session
- **Rules** — stable project conventions

Related decisions can link to each other (`#0003` in text), evolve over time (supersede old ones instead of deleting), and be grouped with tags like `auth` or `database`.

---

## Multiple projects in one folder

Useful for monorepos or a parent folder with several repos:

```bash
centricmem link ./my-app      # attach a subfolder as its own project
centricmem use my-app         # switch which project is "active"
centricmem search "redis" --all   # search across all linked projects
```

Layout:

```
.centricmem/
  workspace.json
  projects/
    my-app/
    another-service/
    unclassified/    ← new imports land here until you classify them
```

---

## For you vs for your agent

| | You | Your agent |
|---|-----|------------|
| Browse memory | Open `.centricmem/projects/<name>/` in your editor | Run CLI commands or follow the Skill |
| Read decisions | `decisions/0001-*.md` files | `centricmem search`, `centricmem log-decision` |
| Go deeper | [PRODUCT.md](./PRODUCT.md) | `centricmem route "your question"` |

**MCP and cloud sync are optional** — handy for backup or Google Drive sync. Everything works offline without them.

---

## Documentation

| Doc | What's inside |
|-----|----------------|
| [BETA.md](./BETA.md) | Install details, setup flags, troubleshooting |
| [PRODUCT.md](./PRODUCT.md) | Full memory model and design |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the code is built |
| [SYNC.md](./SYNC.md) | Optional cloud sync |

---

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, research, and noncommercial use. Commercial use requires a separate license.
