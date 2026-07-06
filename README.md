# CentricMem

**Give your AI agents a memory that outlives the chat.**

Every time you start a new conversation, the agent forgets what you decided last week, what pitfalls you hit, and what the project is actually about. CentricMem fixes that — locally, on your machine, in plain files you can read and version-control.

---

## What it is

CentricMem is a **project memory layer** for all agents (Cursor, Claude Code, and others). It stores what matters about your work — decisions, lessons, current focus, session notes — and helps agents find the right context at the right time.

Think of it as a **shared project journal** that any agent can read and contribute to, without sending your history to a cloud memory service.

```
You + Agent  →  CentricMem  →  .centricmem/  (Markdown on disk)
                    ↑
              remembers across sessions
```

---

## Why memory needs structure

Not all memories are the same. CentricMem organizes them by *what they are for*, not just by keyword:

| Kind of memory | What it holds | Example |
|----------------|---------------|---------|
| **Context** | What you're working on *right now* | "Refactoring auth module" |
| **Decisions** | Choices you made and *why* | "We chose SQLite because offline-first" |
| **Lessons** | Mistakes and how to avoid them | "Don't use sync writes on the hot path" |
| **Sessions** | What happened in a work session | "Shipped login flow, tests still flaky" |
| **Rules** | Stable conventions for the project | "Always run tests before commit" |

Agents don't need to memorize your stack — they read this structure and stay aligned.

---

## Memory that connects

Decisions don't live in isolation. When one choice builds on another, CentricMem tracks the link:

- Mention `#0003` in a decision → the connection is indexed automatically
- Ask *"what does decision 5 depend on?"* → `centricmem refs 5` walks the graph
- Frequently referenced decisions surface first in search

**Tags** group by topic (`auth`, `database`). **Supersedes** shows how ideas evolve over time. **Links** show how ideas relate. Three layers, one coherent picture.

---

## Implicit memory (it just works)

Good memory shouldn't require saying "remember this" every five minutes.

- **Session start** — a short preflight summary loads automatically (`centricmem ambient`); warns if the Skill is outdated (`centricmem skill status`)
- **Session end** — progress can be logged with one line (`centricmem log-session`)
- **Hooks** — optional Cursor hooks handle ambient + indexing without you thinking about it

High-value moments (architecture choices, hard lessons) still get curated explicitly. Everything else is captured lightly in the background.

---

## Get started

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill
npm install && npm run build && npm link

cd <your-project-folder>
centricmem setup --install-skill --install-hooks
```

That's it. Your agent reads `skills/centricmem-agent/SKILL.md` and knows how to use memory from there.

**Typical workflow:**

1. Agent loads context at session start (automatic with hooks)
2. Before big assumptions → search memory: `centricmem search "auth strategy"`
3. After a significant choice → log it: `centricmem log-decision --title "..." --context "..." --decision "..."`
4. Before ending → `centricmem log-session "what we accomplished"`

After upgrading CentricMem: `centricmem setup --install-skill` then `centricmem skill status` (should show `ok`).

---

## Multi-project workspaces

One folder can hold memory for several projects (monorepo, side projects, client work):

```
.centricmem/
  workspace.json
  projects/
    my-app/
    another-service/
    unclassified/    ← imports land here first, then you classify
```

Link a subfolder: `centricmem link ./my-app`  
Switch focus: `centricmem use my-app`  
Search everywhere: `centricmem search "redis" --all`

---

## For agents vs for humans

| | Agents | Humans |
|---|--------|--------|
| **Primary path** | Read the Skill → use CLI commands | Browse `.centricmem/projects/<name>/` in your editor |
| **Decisions** | `centricmem log-decision` | Read `decisions/0001-*.md` — plain Markdown, git-friendly |
| **Deep dive** | `centricmem route "your question"` suggests how to retrieve | [PRODUCT.md](./PRODUCT.md) explains the full memory model |

MCP and cloud sync are **optional** — for backing up or syncing memory to Drive. The core works fully offline.

---

## What's in the box (v0.11.1)

- Local-first storage (Markdown + searchable index)
- **Any agent via Skill** — your Skill maps data in; core does not bind to one IDE
- Decision history with evolution chains (supersede, not delete)
- Memory links between related decisions (`centricmem refs`)
- **Corpus metadata** — `--filter key=value` on imported docs with YAML frontmatter
- **Skill status** — `centricmem skill status` (pull-based updates, no push)
- Import via **ImportBundle** (decisions, lessons, corpus with `meta` + `rel_path`)
- Workspace hub for multiple projects

---

## Documentation

| Doc | For |
|-----|-----|
| [BETA.md](./BETA.md) | Install, configure, troubleshoot |
| [PRODUCT.md](./PRODUCT.md) | Memory architecture (design source of truth) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical implementation |
| [ACADEMIC_DB_REPORT.md](./ACADEMIC_DB_REPORT.md) | L1 corpus adapter example (optional) |
| [SYNC.md](./SYNC.md) | Optional cloud sync contract |

---

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free for personal, research, and noncommercial use.  
Copies must retain the license and attribution. **Commercial use requires a separate license.**
