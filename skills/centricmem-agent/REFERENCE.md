# CentricMem Agent — reference

Read this when you need setup, retrieval routing, import, or multi-project. The session loop lives in [SKILL.md](SKILL.md).

## One-page frame

```text
Hub ($CENTRICMEM_HOME) — disk root
  └── Library (projects/<id>/ + pairing keys + SQLite cache)
        └── Unit (.md or one ##)
              Identity / Details / Tags / Body
              Original (optional) — pointer in Details, bytes in imported/attach/
```

Library = filed in + named pairing keys (revocable). Tags = about. Index prefixes (`project:` / `type:` / `#id`; `project:` is a library-id alias) are cache, not extra types. Corpus YAML is that library's Details. Full write-up: PRODUCT.md §1.1.

## Product home vs code repo

| What | Where | Purpose |
|------|-------|---------|
| **Client** | npm global, or the clone you `npm link` | CLI / Skill source — not the memory disk |
| **Librarian** | HTTP process on the hub (`centricmem serve` / Manager / host systemd) | **Only writer** — ingest, egress, search |
| **Library** | `projects/<id>/` under the hub, **named pairing keys** | decisions / sessions / lessons / … |
| **Installed Skill** | `$CENTRICMEM_HOME/skills/centricmem-agent/` | `SKILL.md` + this file |
| **Code clone** | wherever you develop (e.g. `/opt/centricmem` on a worker) | Source to build/publish — **not** the memory root |

Like Steam: client install and game library are independent. Do not treat the source git repo as the memory root. Agents attach many libraries like workspaces.

Env: `CENTRICMEM_HOME` (hub folder, **operator/librarian**), `CENTRICMEM_URL` (librarian origin for guests; wins over catalog `origin`), catalog `%APPDATA%/centricmem/libraries.json` (`origin` + tokens; not synced), `CENTRICMEM_TOKEN` (optional pairing key when there is no catalog), pointer file `%APPDATA%/centricmem/home.json`, `CENTRICMEM_PROJECT` (optional **write** pin = library id). Guest CLI **refuses leftover-hub writes** when the origin is remote; Skill HTTP is the write path.

## Setup (operators, not agents)

Humans / first-time hub:

```bash
npm install -g centricmem   # or npm link from a clone
centricmem setup --workspace "D:\\CentricMem" --persist-home --install-skill
```

`--bootstrap` is an **operator** cold-start of an empty hub. Agents must **not** run it. If `ambient` says `UNINITIALIZED` or the librarian is down: say once and continue. Never mkdir a hub inside a git checkout.

`centricmem doctor` checks hub, skill, librarian (running / token), and whether cwd is linked.

If `centricmem skill status` is `outdated` or `missing`, tell the user once — `setup --install-skill`. Never overwrite `$CENTRICMEM_HOME/skills/` without confirmation. `modified` means they edited the Skill — respect it. Hub cold start is `hub: UNINITIALIZED` (not the same as skill `missing`).

## Librarian HTTP

The librarian is one process. Agents use **HTTP only**. Bearer selects the library.

- Origin: `CENTRICMEM_URL`, else catalog `origin`, else loopback `http://127.0.0.1:<port>` from the catalog / `api.json` beside it. Loopback is correct when this machine runs that process (Windows Manager until cutover; host systemd). Same machine ≠ permission to write the hub folder with the CLI.
- Catalog: `%APPDATA%/centricmem/libraries.json` or `$XDG_CONFIG_HOME/centricmem/libraries.json`. Guest `api.json` in the same folder lists keys; hub `api.json` does **not** store tokens. Guests persist the cloud URL as catalog `origin` (and/or `CENTRICMEM_URL`). `CENTRICMEM_TOKEN` is optional when the catalog already has the library key.
- No token → 401. Not running → connection refused. Say once; do not CLI-write; do not `setup --bootstrap`.

Verbs: `GET /health` `/ambient` `/doctor` `/search` `/show` `/download` `/inbox` · `POST /search` (same as GET) `/note` `/log-decision` `/done` `/keep` `/keep/sign` `/import` `/classify` `/index` `/delete` (delete is owner-only)

Query/body: `library` (or `project` alias), `cwd`, `tags`, `filter`. `--all` on HTTP does not leak other libraries. Prefer `POST /keep/sign` then PUT to `putUrl` then `POST /keep` with `uploadId` when `health.r2` is true (originals are not stored on the librarian disk). Small files without R2: `filename`+`content`. **Do not** send `path=` for the librarian to open a server file. Host MCP: `node dist/host-connector.js` (or `centricmem-host`); pass `library=` so the host picks that key. `centricmem serve` is the same API.

## CLI (operators / scripts)

CLI still exists for operators on the **librarian host**, pointed at `$CENTRICMEM_HOME`. Agents must not use it as a write fallback. Writes (`note` / `done` / `keep` / `log-*`): `CENTRICMEM_PROJECT` / `-p` / `library=` → cwd matched to a linked `sourceDir` → **Inbox library (`unclassified`)**. `centricmem use` / Manager switcher only pins the open library; it does **not** silently receive writes.

Outside a linked tree, ambient shows `cwd_project=(unlinked)` and `inbox=N`. Operator fix: `setup --link <cwd>` or `-p` / env. Then `centricmem inbox` / `classify <rel> --to <library>` (Move to library). Cross-library search on CLI: `centricmem search "…" --all` (open catalog). HTTP guests search only the library their key selected.

Do not keep a second copy of this Skill in `.cursorrules` / `CLAUDE.md` / workspace rules. One short Skill + a fresh `ambient` is enough.

## Retrieval routing

Progressive disclosure (search → unit → original):

| Layer | Command | What you get |
|-------|---------|--------------|
| **L0** | `search` hit | snippet from the Markdown card (tags / body / YAML) |
| **L1** | `show <file>` | the card — agent context |
| **Download** | human only | attached original (`imported/attach/` on R2 when enabled). Not FTS. Not agent context |

Ambient working set is capped (3 recent decisions + 3 session tails). `inbox=N` is a count, not a dump.

| Situation | CLI / HTTP | Notion Units view |
|-----------|------------|-------------------|
| Session start | HTTP `/ambient` (never a stale `.ambient.md`). Corpus: attach that library's token | Start — working set |
| 「为什么选 X」 | `search` (intent=decision) / `type:decision` | Why — active decisions |
| 「当前在做什么」 | read `active_context.md` | Now — context |
| 「怎么想 / 已知什么」 | `search` + lessons / `--tag` | Know — lessons |
| 要看卡片 | L1 `show` | — |
| 人要看原文 | Dashboard **Download Original**（或本机保存下载） | Original — has attach. Agent does not ingest |
| 「X 依赖/引用什么」 | `centricmem refs <seq>` | Cite — has refs |
| Close | HTTP sweep batch (`/keep` bytes, `/note`, `/done`) — not every turn | Close — sessions |
| Classify unclassified | `inbox` / `classify` | Classify — inbox |
| 调研 / 外部资料 | `search` + type=imported | (no demo dump; Browse + Type=imported) |
| 按主题 | `search --tag <name>`（YAML `tags` / `body_parts` / path，或正文；打过 tag 的更靠前） | Tags column / Browse |
| 类型 / 编号 / 项目 | `type:decision`、`#0016` / `id:0016`、`project:<slug>`（裸词 `decision` 不是类型过滤；`project:` 跳索引，不要默认 `--all`） | By type / Filed-in — by project |
| 结构化语料（ambient `corpus=slug`） | `ambient -p <slug>`；`search -p <slug> --filter key=value -t imported`；优先 `corpus/references/` 卡片，不要把生 dump 页当已验收；`show` 对照表全文；编辑后 `index -p <slug>` | not in Notion (local cards) |
| 跨项目 | `search --all` | Filed-in — by project |
| superseded | Status in Details | Archive — superseded |
| 空 ambient + Ops/Work | skip deep search; curate after | — |

Empty ambient + Work/Ops → do not deep-search; execute, then close.

## Optional writes (not the default close)

Agents hold these until **one sweep at session end**, and only when filing into the librarian (organise). Session capture stays in the agent's own memory. Operators on the librarian host may still use the CLI against `$CENTRICMEM_HOME`.

| Type | When | How |
|------|------|-----|
| Session | Non-Micro end | `done --tags …` (alias of `log-session`) |
| Knowledge | durable model / fact | `note --tags … --title … --body …` |
| Original | any file worth keeping | POST `/keep` filename+bytes (agents). Operators: `keep` on the librarian host |
| Context | focus changes | update `active_context.md` |
| Decision | architecture **or** durable host fact | `log-decision --title … --decision … --context … --tags …` (`-p` for corpus) |
| Rules | repeated pattern, user asked | `promote --from-distill` then `--confirm` |

Memory Links: mention `#NNNN` in a decision body; curated `--refs "1,4"`; walk with `centricmem refs <seq>`.

## Lifecycle (hooks vs Cloud)

Three clocks — do not mix them:

| Clock | What it is | Backup | Curate |
|-------|------------|--------|--------|
| **Chat** | One Composer/thread UUID | Agent-native memory (Cursor memories) plus local transcript | File into the librarian only when organizing a durable unit |
| **Turn** | One user message → one assistant reply | Same | Hold in agent memory; do **not** write the library |
| **IDE session** | Cursor `sessionStart` / `sessionEnd` hooks | Only if hooks are installed in the **code repo** | Must **not** CLI-write the hub. Cloud Agent / My Machines workers do **not** fire repo hooks — Skill close is the sweep |

Cursor desktop already writes:

`~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl`

That file **is** Cursor's local backup, not CentricMem capture. Do not ingest it by default. Close: file a unit into the librarian only when the human wants it organised/searchable across agents. If you do keep a file, POST bytes to `/keep` (not `path=`). Original lands in object storage when `health.r2` is true (pointer still `imported/attach/…`; not FTS-indexed).

Other agents: only keep a transcript if that runtime actually writes a local file. If there is no file, say so; do not invent a dump.

| Event | Agent |
|-------|--------|
| Session start | HTTP `/ambient`. Corpus work: also that library's Bearer |
| During work | Search / show only. Hold notes in the agent's own memory (Cursor memories / other plugins) |
| Close (one sweep) | File into the librarian what should be searchable across agents. Skip if nothing to organise. Human "don't log" → skip |
| IDE hooks | Optional `/ambient` refresh only. Do not `log-session` from hooks onto a hosted hub |

Recipes: `integrations/` next to this file, or `$CENTRICMEM_HOME/skills/centricmem-agent/integrations/`.

- **Cursor** — `setup --install-skill` (operators). Hooks in the code repo must not become a second writer
- **Claude Code** — merge `integrations/claude-code-settings.snippet.json` only if those commands hit HTTP, not a guest-disk hub
- **MCP agents** — `integrations/mcp-config.snippet.json` (`centricmem-host` → librarian URL)

## Coexistence

CentricMem is the **manager layer**. Cursor memories and other memory skills stay the **capture** store. Do not uninstall them. Do not write back into them.

When something must be organised and searchable across agents, map **claims** (not dumps) → ImportBundle / `note` / `log-*`. Transcript jsonl is Cursor backup — not default ingest.

Raw docs upsert on `external_id`. Decisions / lessons / sessions stay append-only. `--skip-existing` for one-shot migrate.

**Import 契约**：任意来源 → 字段映射 → ImportBundle v1（或 `log-*` / frontmatter Markdown）。核心不扫描 Agent 安装目录。结构化语料由本 Skill 管理（ambient `corpus=`）；`academic-db-agent` 只是可选示例，不是必装的第二套技能。

## Structured corpus

CentricMem is the literature database. New work: `keep` the original, read it, write cards in **that** library. Cursor memories are not a substitute for corpus cards.

A library is a corpus when its `config.json` has `domain_boost` or it has `imported/academic/` (often a junction to the live markdown tree). Ambient prints `corpus=<id>`. Attach that library (its token / `-p <id>`); `-p` is a library-id alias.

```bash
centricmem ambient -p <slug>
centricmem search "hemorrhoid" -p <slug> -t imported
centricmem search "urine" -p <slug> --filter civilization=babylonian
centricmem show "imported/academic/analysis/01-disease-concepts/_overview.md" -p <slug>
centricmem index -p <slug>
```

`--filter` needs leading YAML. Prefer `corpus/references/` and `corpus/recipes/` cards; do not treat unread dump pages or `_index` tables as finished ingest. Do not re-export JSON batches. Indexer excludes `imported/_flat_dump/`, `imported/academic/_scripts`, `_RESUME-SLICE.md`, `ocr_completion*` / `ocr_quality_notes.md` / `_ocr-verification.md`, `imported/academic/sources/strahil-medical-md`, any `reading/` folder, `imported/academic/secondary/` dumps except catalogs, babylonian `sources/**/_fulltext*`, `_fulltext_complete.md`, leaf `corpus/<kind>/<slug>/_index.md` catalogs, and `## Opening (OCR)` excerpts on cards. Early-chinese `_fulltext.md` stays. OCR dumps are not agent context — `show` the **card**. Humans download an attached original if they asked to see the file. PDFs stay on the source tree until an agent `keep`s bytes (or signed R2 PUT) into a unit. Comparison-dimension keywords live in that project’s config, not in this Skill.

When a dump’s non-Latin script is stripped or unreadable: card recoverable transliteration, apparatus English, and explicit `[unclear]` / FLAG notes. Do not invent lemmas. **Same edition → one `work:` id** (`corpus/works/<id>.md` manifest). Merge volume + chapter + recipe cards under that id; set `card_role: volume|chapter|recipe|ritual`. Overlap with prior cards is **merge**, not a skip or a parallel folder. Different edition = new `work:` id. Indexer dedupes search by `work:` and boosts `card_role: volume`.

Ledger ingest in one chat is one session: update the ledger and `index -p <slug>` after cards; `keep`+`done` only when the human stops or a work is `cards-written`.

## Classify inbox (Move to library)

Independent files under the Inbox library `projects/unclassified/` (`decisions/*.md`, `imported/**/*.md`, unique `sessions/<stamp>-<writer>-<id>.md`). Not split: `lessons.md`. Legacy daily `sessions/YYYY-MM-DD.md` is listed as skip.

```bash
centricmem inbox                 # list + top suggestion
centricmem inbox --apply         # high-confidence only
centricmem classify <rel> --to <library>
```

## Rules

- Decisions append-only (supersede, never delete)
- Product sync is not Drive/rsync; cold backup is operator restic→R2
- Secrets never in memory (ambient tails and `--auto` sessions are redacted)
- Dismiss bad hits: `centricmem dismiss <file> [--heading]`
- Collect claims, not transcripts
- Agents write only via librarian HTTP; never CLI on a guest disk
