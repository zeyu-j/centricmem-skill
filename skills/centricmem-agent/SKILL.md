---
name: centricmem-agent
version: 0.14.4
compatible_cli: ">=0.14.4"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: CentricMem workspace memory — Agent-side product home; ambient loads automatically; curate high-value memories only.
---

# CentricMem Agent Skill v0.14.4

> **设计真源**：[PRODUCT.md](../../PRODUCT.md) — 记忆架构、存储、检索、隐式记忆原则。

**记忆是隐式的** — 用户无需说「记一下」。你负责在高价值时刻**策展（Curate）**。

## Session checklist

1. **Classify** — Micro → skip memory. Work / Ops / Decision / Research → continue.
2. **`centricmem ambient`** (session start). If output has `state=UNINITIALIZED`:
   ```bash
   cd <repos-parent-or-project>   # e.g. a parent of many checkouts, or a single repo
   centricmem setup --bootstrap
   # Cloud multi-repo: add --link /path/to/repo (repeatable)
   ```
   Then re-run `ambient`. Exit 0 on UNINITIALIZED — keep working.
3. **Wrong project?** After preflight, check `{slug}` vs task repo. Fix with `centricmem use <slug>` or `CENTRICMEM_PROJECT=<slug>`, then `ambient` again. Cross-repo → `search --all`.
4. **Execute** — Follow recorded decisions unless human overrides. Do not write memory on every tool call.
5. **Curate (high-value only)** — Before ending (required on Cloud / no-hooks):
   - `centricmem log-session "natural language summary"`
   - Decision / durable ops fact → `log-decision` (confirm architecture with user)
   - Pitfall → `log-lesson`
   - Never store secrets.

Empty ambient + Work/Ops → skip deep search; curate after. Ops host facts (deploy paths, backup schedules, config overrides) are worth curating — no passwords/keys.

---

# Reference

## Product home vs code repo

| What | Where | Purpose |
|------|--------|---------|
| **Product home** | `$CENTRICMEM_HOME` (default `~/.centricmem`) | Live memory, installed Skill, ambient |
| **Project memory** | `$CENTRICMEM_HOME/projects/<slug>/` | decisions / sessions / lessons / … |
| **Installed Skill** | `$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md` | What agents should follow |
| **Code clone** | wherever you develop (e.g. a git checkout of centricmem) | Source to build/publish — **not** the memory root |

Do **not** treat a source/business git repo as the memory root — develop folder ≠ product folder.

## Setup

```bash
npm install -g centricmem   # or npm link from a clone
cd <repos-parent-or-project>
centricmem setup --bootstrap                          # cold start (link-all + install-skill)
# or full desktop:
centricmem setup --migrate-from-local --link-all --install-skill --install-hooks
# explicit multi-repo:
centricmem setup --bootstrap --link /path/to/repo-a --link /path/to/repo-b
```

Env: `CENTRICMEM_HOME` (product hub), `CENTRICMEM_PROJECT` (optional pin to a slug).

## Implicit memory (lifecycle)

| Event | Command |
|-------|---------|
| Session start | `centricmem ambient --write` |
| Session end | `centricmem log-session --auto --title hooks` then `centricmem index --all --quiet` |

Hooks auto-capture **Current Focus** from `active_context.md`. After real progress, prefer a natural-language `centricmem log-session "…"`.

**No hooks? (includes many Cloud Agent runs)** — Cursor hooks live only in the **code repo** `.cursor/hooks/`; they are **not** the same as a Cloud run auto-lifecycle. Manually:

1. Session start → `centricmem ambient` (UNINITIALIZED → `setup --bootstrap`)
2. After significant progress **or** before ending → `centricmem log-session "natural language summary"` (do **not** rely on `--auto` alone)

Recipes: package `skills/centricmem-agent/integrations/` or installed `$CENTRICMEM_HOME/skills/centricmem-agent/integrations/`.

## Agent integration (optional)

CentricMem installs the canonical skill under `$CENTRICMEM_HOME/skills/` (and mirrors to `~/.cursor/skills/centricmem-agent/` when using setup). After reading this Skill:

- **Cursor** — `centricmem setup --install-skill --install-hooks` (hooks → code repo `.cursor/hooks/` only)
- **Claude Code** — merge `integrations/claude-code-settings.snippet.json` into `.claude/settings.json`
- **MCP agents** — add `centricmem-mcp` per `integrations/mcp-config.snippet.json` (L2/optional)
- **Other** — point your agent's rules at `$CENTRICMEM_HOME/skills/centricmem-agent/SKILL.md`

## Step 0 — Classify the request

| Class | Criteria | Memory |
|-------|----------|--------|
| **Micro** | typo, one-liner, explain | Skip |
| **Work** | implement, refactor, fix | Ambient already loaded |
| **Ops** | deploy, host config, backups, infra triage | Ambient → execute; curate durable host facts (no secrets) |
| **Decision** | architecture, stack, scope | Ambient + curate decision |
| **Research** | survey, external sources | Ambient + import notes |

**Empty ambient / cold project:** preflight shows no decisions and search would return nothing → do **not** deep-search; execute the task, then `log-session` (and decision/lesson if durable).

## Step 1 — Load context (implicit)

Session start: run `centricmem ambient` (or read `$CENTRICMEM_HOME/.ambient.md`).

If ambient prints `state=UNINITIALIZED`, run `centricmem setup --bootstrap` (optionally `--link <path>`), then ambient again. Do not treat UNINITIALIZED as a hard stop.

If `centricmem skill status` reports `outdated` or `missing`, tell the user once — run `centricmem setup --install-skill`. **Never** overwrite `$CENTRICMEM_HOME/skills/` without confirmation. If `modified`, the user edited the Skill locally — respect their copy. Hub-level cold start is reported as `hub: UNINITIALIZED` (distinct from skill `missing`).

### Multi-repo / wrong-project check

After preflight, verify `{slug}` matches the task’s repo or topic.

- CLI already prefers `CENTRICMEM_PROJECT`, then cwd→linked `sourceDir`, else `workspace.json` **current**.
- If you started outside a linked tree (common Cloud Agent cwd like a parent mount) and the task is another project → `centricmem use <slug>` **or** `export CENTRICMEM_PROJECT=<slug>`, then re-run `ambient`.
- Cross-repo questions → `centricmem search "…" --all`. Do **not** assume `workspace.json` current is correct.

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
| 空 ambient + Ops/Work | skip deep search; curate after |

Preflight:
```
CentricMem: project={slug} | Health={n} | Recent: {titles} | Session tail: {…} | Conflicts: {none|list}
```

Cold start:
```
CentricMem: state=UNINITIALIZED | home=… | next=centricmem setup --bootstrap
```

## Step 2 — Execute work

Follow recorded decisions unless human overrides. Do not write memory on every tool call.

## Step 3 — Curate (high-value only)

| Type | When | How |
|------|------|-----|
| **Session** | session end / significant progress | `centricmem log-session "summary"` |
| **Context** | focus changes | update `active_context.md` |
| **Decision** | architecture **or** durable ops/host fact (confirm with user when architectural) | `centricmem log-decision --title ... --context ... --decision ...` |
| **Lesson** | pitfall discovered (incl. infra gotchas) | `centricmem log-lesson --title ... --body ...` |
| **Rules** | repeated pattern | `centricmem promote --from-distill` then `--confirm` |

**Ops examples to curate:** how to connect/deploy, backup paths/schedules, config override traps (e.g. a world-options file shadowing server ini). **Never** store passwords, API keys, or app secrets in memory.

Sessions auto-capture; decisions need human alignment when they change architecture. **Always `log-session` before ending a session** (Cloud / no-hooks: natural-language summary required).

**Memory Links**: mention `#NNNN` in a decision body and the link is indexed automatically. For curated references use `--refs "1,4"`. Walk the graph with `centricmem refs <seq>`.

## Coexistence — capture elsewhere, organize here

Do **not** ask users to uninstall other memory skills. Split roles:

| Role | Who | Action |
|------|-----|--------|
| **Capture** | Other memory skill / plugin | Keep writing there |
| **Organize + retrieve** | CentricMem | Import → classify → `ambient` / `search` / links |
| **Curate** | CentricMem only | `log-decision` / `log-lesson` / `promote` — never write back to the capture store |

```text
other memory skill  →  capture
        │  map → ImportBundle → centricmem import
        ▼
CentricMem          →  organize + retrieve
```

Raw docs (`imported[]` / `research[]`) upsert on the same `external_id` by default. Decisions / lessons / sessions stay skip-only (append-only). Use `--skip-existing` for one-shot migrate semantics.

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
- Pin without switching workspace current: `CENTRICMEM_PROJECT=<slug>`

## Rules

- Decisions append-only (supersede, never delete)
- MCP (Drive) = sync only — see [SYNC.md](../../SYNC.md)
- Secrets never in memory
- Human says "don't log" → skip Step 3
- Dismiss bad hits: `centricmem dismiss <file> [--heading]`
