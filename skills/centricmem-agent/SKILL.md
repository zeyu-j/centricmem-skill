---
name: centricmem-agent
version: 0.14.5
compatible_cli: ">=0.14.5"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: CentricMem — Non-Micro sessions MUST close with tagged log-session/decision/lesson before the final user reply; ambient loads context; curate high-value memory only.
---

# CentricMem Agent Skill v0.14.5

> **设计真源**：[PRODUCT.md](../../PRODUCT.md) — 记忆架构、存储、检索、隐式记忆原则。

**记忆是隐式的** — 用户无需说「记一下」。你负责在高价值时刻**策展（Curate）**。

## Session checklist

1. **Classify** — Micro → skip memory. Work / Ops / Decision / Research → continue (**Non-Micro**).
2. **`centricmem ambient`** (session start). If `state=UNINITIALIZED` → `centricmem setup --bootstrap` (+ `--link` as needed), then ambient again. Exit 0 on UNINITIALIZED — keep working.
3. **Wrong project?** Check `{slug}` vs task repo. Fix with `use <slug>` / `CENTRICMEM_PROJECT`, then ambient. Cross-repo → `search --all`.
4. **Execute** — Follow recorded decisions unless human overrides. Do not write memory on every tool call.
5. **Close contract (REQUIRED for Non-Micro)** — Before the final user-facing reply, run the applicable writes below. **Last memory action = curation.** Do not end a Non-Micro turn after only code/tools with no `log-*` / `done`.

### Close contract

| Class | Required writes | Example tags |
|-------|-----------------|--------------|
| **Micro** | none | — |
| **Work** | `centricmem done --tags work,… "summary"` or `log-session --tags work,…` | `work`, `fix`, `docs` |
| **Ops** | session **and** durable host fact → `log-decision --tags ops,infra,…` (no secrets) | `ops`, `infra`, `deploy` |
| **Decision** | session **and** `log-decision --tags …` (confirm architecture with user) | `decision`, domain tags |
| **Research** | session (+ import/notes as needed) | `research` |

Prefer close verb:

```bash
centricmem done --tags work,deploy "Shipped X; noted Y"
# equals log-session --tags …
centricmem log-decision --tags ops,infra --title "…" --context "…" --decision "…"
centricmem log-lesson --tags ops --title "…" --body "…"   # pitfall
```

**Tag vocabulary (closed + free-form):**  
`work | ops | decision | research | infra | security | deploy | fix | docs`  
plus project tags (`matrix`, `palworld`, …).

Ambient shows `Curate: today_sessions=N`. If `N=0` after Non-Micro work, you still owe a close write.

**Anti-pattern (Cloud / no-hooks):** `--auto` alone is insufficient. Always use a natural-language summary **and** `--tags`. Skipping close → memory never existed (not “lost”).

Empty ambient + Work/Ops → skip deep search; curate after. Never store secrets.

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
| Session end (hooks) | `centricmem log-session --auto --title hooks` then `index --all --quiet` |
| Session end (agent / Cloud) | `centricmem done --tags work,… "natural language summary"` |

Hooks auto-capture **Current Focus** from `active_context.md`. After real progress, prefer tagged natural-language close (`done` / `log-session --tags`).

**No hooks? (includes many Cloud Agent runs)** — Cursor hooks live only in the **code repo** `.cursor/hooks/`; they are **not** the same as a Cloud run auto-lifecycle. Follow the **Close contract** above.

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
| **Work** | implement, refactor, fix | Ambient → execute → **close** |
| **Ops** | deploy, host config, backups, infra triage | Ambient → execute → session + durable `log-decision` |
| **Decision** | architecture, stack, scope | Ambient → execute → session + `log-decision` |
| **Research** | survey, external sources | Ambient → execute → session (+ import) |

**Empty ambient / cold project:** preflight shows no decisions and search would return nothing → do **not** deep-search; execute, then close contract.

## Step 1 — Load context (implicit)

Session start: run `centricmem ambient` (or read `$CENTRICMEM_HOME/.ambient.md`).

If ambient prints `state=UNINITIALIZED`, run `centricmem setup --bootstrap` (optionally `--link <path>`), then ambient again. Do not treat UNINITIALIZED as a hard stop.

If `centricmem skill status` reports `outdated` or `missing`, tell the user once — run `centricmem setup --install-skill`. **Never** overwrite `$CENTRICMEM_HOME/skills/` without confirmation. If `modified`, the user edited the Skill locally — respect their copy. Hub-level cold start is `hub: UNINITIALIZED` (distinct from skill `missing`).

### Multi-repo / wrong-project check

After preflight, verify `{slug}` matches the task’s repo or topic.

- CLI prefers `CENTRICMEM_PROJECT`, then cwd→linked `sourceDir`, else `workspace.json` **current**.
- Outside a linked tree → `centricmem use <slug>` or `export CENTRICMEM_PROJECT=<slug>`, then ambient.
- Cross-repo → `centricmem search "…" --all`.

**Retrieval routing** (or `centricmem route "<query>"`):

| Situation | Action |
|-----------|--------|
| Session start | `ambient` / read AGENTS + active_context |
| 「为什么选 X」 | `search` (intent=decision) |
| 「当前在做什么」 | read active_context |
| 「踩过什么坑」 | `search` + type=lessons |
| 「X 依赖/引用什么」 | `centricmem refs <seq>` |
| 调研/外部资料 | `search` + type=imported |
| tag / 行为类型 | `search work` / `search deploy` (session/decision tags) |
| 跨项目 | `search --all` |
| 空 ambient + Ops/Work | skip deep search; curate after |

Preflight includes `Curate: today_sessions=N`.

## Step 2 — Execute work

Follow recorded decisions unless human overrides. Do not write memory on every tool call.

## Step 3 — Curate (Close contract)

See checklist **Close contract**. Extra notes:

| Type | When | How |
|------|------|-----|
| **Session** | Non-Micro end / significant progress | `done --tags …` / `log-session --tags …` |
| **Context** | focus changes | update `active_context.md` |
| **Decision** | architecture **or** durable ops/host fact | `log-decision --tags …` |
| **Lesson** | pitfall | `log-lesson --tags … --title … --body …` |
| **Rules** | repeated pattern | `promote --from-distill` then `--confirm` |

**Ops examples:** connect/deploy paths, backup schedules, config override traps. **Never** store passwords, API keys, or app secrets.

**Memory Links**: mention `#NNNN` in a decision body; curated `--refs "1,4"`; walk with `centricmem refs <seq>`.

## Coexistence — capture elsewhere, organize here

Do **not** ask users to uninstall other memory skills.

| Role | Who | Action |
|------|-----|--------|
| **Capture** | Other memory skill / plugin | Keep writing there |
| **Organize + retrieve** | CentricMem | Import → classify → ambient / search / links |
| **Curate** | CentricMem only | `log-decision` / `log-lesson` / `promote` — never write back |

```text
other memory skill  →  capture
        │  map → ImportBundle → centricmem import
        ▼
CentricMem          →  organize + retrieve
```

Raw docs upsert on `external_id`. Decisions / lessons / sessions stay append-oriented. Use `--skip-existing` for one-shot migrate.

## Generic Import

**契约**：任意来源 → 字段映射 → **ImportBundle v1**（或 `log-*` / frontmatter Markdown）。  
核心不扫描 Agent 安装目录；**你的 Skill 负责映射**。

域 Skill（如 `academic-db-agent`）仅示范 L1 映射。

See ImportBundle workflow: `sessions[]`, `research[]`, `imported[].meta`, `imported[].rel_path`.

## Classify unclassified

`centricmem suggest-classify <path>` → `centricmem classify <path> --to <slug>`

## Multi-project

- `centricmem link subdir/`
- `centricmem use <slug>`
- `centricmem search "query" --all`
- Pin: `CENTRICMEM_PROJECT=<slug>`

## Rules

- Decisions append-only (supersede, never delete)
- MCP (Drive) = sync only — see [SYNC.md](../../SYNC.md)
- Secrets never in memory
- Human says "don't log" → skip Close contract
- Dismiss bad hits: `centricmem dismiss <file> [--heading]`
- Non-Micro without close contract = incomplete session
