---
name: centricmem-agent
version: 0.12.0
compatible_cli: ">=0.12.0"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: CentricMem workspace memory — implicit-first local memory OS. Ambient context loads automatically; curate high-value memories only.
---

# CentricMem Agent Skill v0.12.0

> **设计真源**：[PRODUCT.md](../../PRODUCT.md) — 记忆架构、存储、检索、隐式记忆原则。

**记忆是隐式的** — 默认 `centricmem ambient` 已注入上下文，用户无需说「记一下」。你负责在高价值时刻**策展（Curate）**。

Local memory: `.centricmem/projects/<slug>/`. Canonical skill: `.centricmem/skills/centricmem-agent/SKILL.md`. Default import: `unclassified`.

## Setup

```bash
git clone https://github.com/zeyu-j/centricmem-skill.git
cd centricmem-skill && npm install && npm run build && npm link
cd <workspace-root>
centricmem setup --link-all --migrate-discover --install-skill
```

Optional (Cursor only): `centricmem setup --install-hooks` — see [integrations/README.md](./integrations/README.md).

Env: `CENTRICMEM_WORKSPACE`, `CENTRICMEM_PROJECT`.

## Implicit memory (lifecycle)

Wherever your agent supports session lifecycle hooks, wire:

| Event | Command |
|-------|---------|
| Session start | `centricmem ambient --write` |
| Session end | `centricmem log-session "<summary>"` then `centricmem index --all --quiet` |

No hooks? Run Step 1 manually each session. Copy-paste recipes: `skills/centricmem-agent/integrations/` (or `.centricmem/skills/centricmem-agent/integrations/` after install).

## Agent integration (optional)

CentricMem does not install agent-specific files except the canonical skill under `.centricmem/skills/`. After reading this Skill:

- **Cursor** — symlink or copy to `.cursor/skills/`, or use `centricmem setup --install-hooks`
- **Claude Code** — merge `integrations/claude-code-settings.snippet.json` into `.claude/settings.json`
- **MCP agents** — add `centricmem-mcp` per `integrations/mcp-config.snippet.json`
- **Other** — point your agent's rules at `.centricmem/skills/centricmem-agent/SKILL.md`

## Step 0 — Classify the request

| Class | Criteria | Memory |
|-------|----------|--------|
| **Micro** | typo, one-liner, explain | Skip |
| **Work** | implement, refactor, fix | Ambient already loaded |
| **Decision** | architecture, stack, scope | Ambient + curate decision |
| **Research** | survey, external sources | Ambient + import notes |

## Step 1 — Load context (implicit)

Session start: run `centricmem ambient` (or read `.centricmem/.ambient.md`).

If `centricmem skill status` reports `outdated` or `missing`, tell the user once — run `centricmem setup --install-skill`. **Never** overwrite `.centricmem/skills/` without confirmation. If `modified`, the user edited the Skill locally — respect their copy.

**Retrieval routing** (or `centricmem route "<query>"`):

| Situation | Action |
|-----------|--------|
| Session start | `ambient` / read AGENTS + active_context |
| 「为什么选 X」 | `centricmem search` (intent=decision) |
| 「当前在做什么」 | read active_context |
| 「踩过什么坑」 | `search` + type=lessons |
| 「X 依赖/引用什么」 | `centricmem refs <seq>` (link traversal) |
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

**Memory Links**: mention `#NNNN` in a decision body and the link is indexed automatically. For curated references use `--refs "1,4"`. Walk the graph with `centricmem refs <seq>`.

## Generic Import

**契约**：任意来源 → 字段映射 → **ImportBundle v1**（或 `log-*` / 带 frontmatter 的 Markdown）。  
核心不扫描你的 Agent 安装目录；**你的 Skill 负责映射**。

| 来源类型 | Agent/Skill 做什么 | CentricMem 接收 |
|----------|-------------------|-----------------|
| 外部 DB / corpus | 写导出脚本 → JSON bundle | `import` + `meta` + `rel_path` |
| 旧规则文件 | 映射为 rules / decisions | `migrate` 或 bundle |
| 会话摘要 | 提炼后写入 | `log-session` / bundle `sessions[]` |
| 领域过滤 | 在 Skill 里选 `--filter` / config | 通用 `--filter key=value` |

域 Skill（如 `academic-db-agent`）仅示范一种 L1 映射，可复制改写成你自己的适配器。

See v0.8 ImportBundle workflow. New types: `sessions[]`, `research[]`, `imported[].meta`, `imported[].rel_path`.

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
