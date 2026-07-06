---
name: centricmem-agent
description: CentricMem workspace memory — implicit-first local memory OS. Ambient context loads automatically; curate high-value memories only.
---

# CentricMem Agent Skill v0.9

> **设计真源**：[PRODUCT.md](../../PRODUCT.md) — 记忆架构、存储、检索、隐式记忆原则。

**记忆是隐式的** — 默认 `centricmem ambient` 已注入上下文，用户无需说「记一下」。你负责在高价值时刻**策展（Curate）**。

Local memory: `.centricmem/projects/<slug>/`. Default import: `unclassified`.

## Setup

```bash
npm install -g centricmem
cd <workspace-root>
centricmem setup --link-all --migrate-discover --install-skill --install-hooks
```

Env: `CENTRICMEM_WORKSPACE`, `CENTRICMEM_PROJECT`.

## Step 0 — Classify the request

| Class | Criteria | Memory |
|-------|----------|--------|
| **Micro** | typo, one-liner, explain | Skip |
| **Work** | implement, refactor, fix | Ambient already loaded |
| **Decision** | architecture, stack, scope | Ambient + curate decision |
| **Research** | survey, external sources | Ambient + import notes |

## Step 1 — Load context (implicit)

Session start: run `centricmem ambient` (or read `.centricmem/.ambient.md`).

**Retrieval routing** (or `centricmem route "<query>"`):

| Situation | Action |
|-----------|--------|
| Session start | `ambient` / read AGENTS + active_context |
| 「为什么选 X」 | `centricmem search` (intent=decision) |
| 「当前在做什么」 | read active_context |
| 「踩过什么坑」 | `search` + type=lessons |
| 调研/外部资料 | `search` + type=imported |
| 不确定关键词 | Memory Map → refine → search |
| 跨项目 | `centricmem search --all` |

Preflight:
```
CentricMem: project={slug} | Health={n} | Recent: {titles} | Session tail: {…} | Conflicts: {none|list}
```

## Step 2 — Execute work

Follow recorded decisions unless human overrides. Do not write memory on every tool call.

## Step 3 — Curate (high-value only)

| Type | When | How |
|------|------|-----|
| **Session** | session end / significant progress | `centricmem log-session "summary"` |
| **Context** | focus changes | update `active_context.md` |
| **Decision** | architecture choice (confirm with user) | `centricmem log-decision --title ... --context ... --decision ...` |
| **Lesson** | pitfall discovered | `centricmem log-lesson --title ... --body ...` |
| **Rules** | repeated pattern | `centricmem promote --from-distill` then `--confirm` |

Sessions auto-capture; decisions need human alignment. **Always `log-session` before ending a session.**

## Generic Import

See v0.8 ImportBundle workflow. New types: `sessions[]`, `research[]`.

## Classify unclassified

`centricmem suggest-classify <path>` → `centricmem classify <path> --to <slug>`

## Multi-project

- `centricmem link subdir/`
- `centricmem use <slug>`
- `centricmem search "query" --all`

## Rules

- Decisions append-only (supersede, never delete)
- MCP (Drive) = sync only — see [SYNC.md](../../SYNC.md)
- Secrets never in memory
- Human says "don't log" → skip Step 3
- Dismiss bad hits: `centricmem dismiss <file> [--heading]`
