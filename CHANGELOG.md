# Changelog

All notable changes to CentricMem will be documented in this file.

## [Unreleased]

## [0.21.6] - Owner password reset email

Forgot-password emails a one-hour reset link to the owner address (generic 200 so it does not leak whether the email matches). Reset sets a new password, drops existing sessions, and signs the owner in. Tests dump mail to a file; production uses Resend (`CENTRICMEM_RESEND_API_KEY` + `CENTRICMEM_MAIL_FROM`). Website `/forgot` and `/reset`; origin HTML on the librarian host if the Worker is not updated yet.

## [0.21.5] - Guest CLI cannot write leftover hub

When `CENTRICMEM_URL` or catalog `origin` is a remote librarian, `centricmem note` / `keep` / `done` / `serve` / `index` and legacy `centricmem-mcp` refuse the leftover `CENTRICMEM_HOME`. Search / ambient / show go HTTP. `doctor` lists catalog libraries, not leftover `workspace.json` slugs.

## [0.21.4] - Manager layer; first cloud guest

Capture stays in the agent's own memory (Cursor memories / other plugins). CentricMem organises and retrieves on the librarian **and** remains the literature database: `keep` originals, read them, write corpus cards. Guests persist `origin` in `libraries.json` (env `CENTRICMEM_URL` still wins). `doctor` probes that origin instead of assuming loopback.

## [0.21.3] - Agent path matches the hosted store

Leftover CLI / Drive / `show --original` copy that would still send agents into originals or a guest-disk hub is gone. `POST /search` is the same verb as GET. Dashboard **Original** only appears when the hit has an Attach pointer. `setup --install-skill` also copies into `~/.codex/skills` and `~/.agents/skills`. New library `AGENTS.md` tells agents to use HTTP.

## [0.21.2] - Cards for agents; originals are human downloads

Search and `/show` are the Markdown unit. Attach files stay out of FTS and out of agent context. `GET /show?original=1` returns path, size, and store — not the bytes. Humans use Download Original (`GET /download?original=1`). Host MCP `cm_show` no longer has an `original` flag.

## [0.21.1] - Fill existing attach originals onto R2

Operator copy: files that already have `Attach: imported/attach/…` stubs can be uploaded under those names. No new keep units. Markdown stays on the librarian disk.

```bash
centricmem r2 fill-attach --library Academic --dir ./imported/attach
```

`--delete-source` removes each local file only after HEAD size matches. `--dry-run` counts only.

## [0.21.0] - Attach originals via presigned R2

No membership tiers yet — this is the full attach path. Markdown units stay on the librarian disk. Originals go to Cloudflare R2 with a short-lived PUT URL. Pairing keys never receive bucket credentials.

### Added
- `POST /keep/sign` → agent `PUT` to `putUrl` → `POST /keep` with `uploadId`
- When R2 env is set, byte `/keep` also stores on R2 (no `imported/attach/` on the hub disk)
- `GET /health` includes `r2: true|false`
- Host MCP `cm_keep` tries presign first, falls back to POST bytes if R2 is off

### Changed
- Skill / `min_skill` **0.21.0**
- Download Original / `show --original` read R2 when the file is not on disk
- Owner delete of a stub also deletes the R2 object

## [0.20.2] - Librarian will not open a server path

HTTP `keep` only accepts uploaded bytes. Pairing guests cannot point the librarian at a disk path. Import keeps existing YAML. CORS is an allowlist.

### Fixed
- `POST /keep` with `path=` / `file=` is **400 `KEEP_PATH_REJECTED`** (no `path.resolve` on the host)
- `attach=` on note/decision/session must already be under `imported/` (**400 `ATTACH_PATH_REJECTED`**)
- CORS no longer reflects any `Origin`; set `CENTRICMEM_CORS_ORIGIN` (comma-separated) when a browser origin is not same-site
- Loopback proxy check uses `::ffff:127.0.0.1` (the previous string was missing a colon)
- `CENTRICMEM_URL=https://host/api` keeps `/api` on `/health` and other verbs (`joinLibrarianUrl`; `new URL('/health', base)` was dropping the path)
- Import of a body that already starts with `---` is stored as-is (no second H1, YAML lists stay block form for `--filter`)
- Skip `buildIndex` when an import wrote nothing
- Catalog `atomicJson` writes mode `0600`
- Indexer stale-file pass uses a `Set` instead of `files.includes`

### Changed
- Cloudflare Worker `/api/*` allowlist is human verbs only (`/search` `/download` `/delete` `/account` `/login` `/register` `/status` `/health`). Agent writes stay on the librarian origin (nginx on the host).
- Landing copy: librarian is the store; BM25 is not a third-party memory API; humans download to open
- Host MCP `cm_keep` is filename + content only
- Skill / `min_skill` **0.20.2**

## [0.20.1] - Cloud store: download and delete, no open

The cloud librarian is storage. Agents upload. Humans download or delete. The website does not open files.

### Added
- `GET /download` (unit bytes, or `original=1` for the Attach file)
- `POST /delete` (owner login only; pairing keys 403)
- Dashboard Download / Original / Delete on search hits

### Changed
- Skill / `min_skill` **0.20.1**

## [0.20.0] - Website register and dashboard

Humans create the owner on the website and land on their own dashboard. Pairing keys stay for agents. Origin TLS on the librarian host is next; the site already terminates HTTPS at Cloudflare.

### Added
- `POST /register` and public `GET /status`
- Website `/register`, `/login`, `/app` (libraries, search, mint/revoke keys)
- Cloudflare Worker `/api/*` proxy to the librarian
- `CENTRICMEM_BIND` / `CENTRICMEM_PROXY_SECRET` so the origin can listen off-loopback behind the site proxy

### Changed
- One owner per librarian until multi-tenant; a second register is 409
- Skill / `min_skill` **0.20.0**

## [0.19.0] - Operator account (no public register)

A librarian may have one owner. Humans sign in to mint and revoke named pairing keys. Agents still use a pairing key, not the login session. There is no `/register`.

### Added
- `centricmem account bootstrap|login|logout|status|library|key` (password from `--password-file` or `CENTRICMEM_ACCOUNT_PASSWORD`)
- `POST /login`, `GET /account`, `POST /account/libraries`, `POST /account/keys`, `POST /account/keys/revoke`
- Several named pairing keys per library; revoke one without kicking the owner
- Manager: operator sign-in on the Hosted librarian card

### Changed
- Skill / `min_skill` **0.19.0**
- Wrong or revoked pairing key is still 401; a pairing key cannot manage the account (403)

## [0.18.0] - Agents write only through the librarian

The librarian process is the only writer. Agents hold new memory in the chat and sweep once at session end. CLI is not a write fallback. `setup --bootstrap` is an operator cold-start, not an agent repair.

### Added
- Skill/connector: `CENTRICMEM_URL` + optional `CENTRICMEM_TOKEN` when there is no local catalog
- Sweep-at-close agent loop (HTTP `/keep` as filename+bytes; no `path=` for the librarian to open)

### Changed
- Skill §0: HTTP only. Loopback is valid when this machine **is** the librarian (Manager until cutover; host systemd)
- Unreachable librarian: say once; do not create a hub; do not CLI-write
- Host MCP down-message no longer tells agents to open the Manager tray
- `min_skill` / bundled Skill **0.18.0**

## [0.17.0] - One library, one pairing key

Isolation is a library (folder + key), not a project tag inside one hub token. Agents attach many libraries like workspaces. Inbox moves to a library. Hosted librarian stays encryption model 1 (TLS + at rest, keys we hold) — not zero-knowledge.

### Added
- Machine-local catalog `%APPDATA%/centricmem/libraries.json` wrapping `projects/<id>/` in place
- Per-library pairing tokens; Bearer selects the library on one host-server process
- `centricmem libraries` (`projects` is an alias); `classify --to` / Inbox **Move to library**
- Manager library switcher, current-library key copy/rotate, create library
- Manager/demo copy: **This library**, search this library, Inbox **Move** (not Organise / topic); British English (Unorganised, en-GB)
- Corpus `--tag` also matches YAML `body_parts` / `methods` / civilization / path (bam10, recipe, …)

### Changed
- Old hub-wide `api.json` token is retired (keys do not sync with the replica)
- HTTP `--all` / `-p` cannot write or search another library with the wrong key (`LIBRARY_MISMATCH`)
- Skill §0: read the catalog; corpus = attach another library
- `doctor` reports cwd library bind

## [0.16.0] - Librarian HTTP (Phase C)

Manager is the on-disk writer. Agents knock on loopback HTTP (or CLI if the window is down). Optional accounts are still not the write path.

### Added
- Loopback librarian API on `127.0.0.1:23180` (port increments on clash; `api.json` next to the hub and `%APPDATA%/centricmem/`)
- Verbs: `GET /health` `/ambient` `/doctor` `/search` `/show` `/inbox` · `POST /note` `/log-decision` `/done` `/keep` `/import` `/classify` `/index`
- Bearer token required (401 otherwise). Multipart / JSON bytes for sandbox `keep`
- `centricmem serve` and `centricmem-host` (stdio MCP that only proxies the librarian)
- Manager: spawn the API, Settings (token copy/rotate, autostart, connector snippet, Install Skill), home/footer listening + last guest write
- Skill §0: probe librarian → CLI → say once. `doctor` reports librarian / token / hub writable

### Changed
- `writeAmbientFile` ignores EPERM/EACCES so ambient stdout still succeeds in a sandbox
- Desktop shortcut launcher uses the script directory (no hardcoded `E:\centricmem`)

## [0.15.13] - Skill × Notion views (docs)

Human browse in Notion uses the same situation names as Skill retrieval. No schema or CLI change.

### Changed
- Units views: Start / Why / Now / Know / Original / Cite / Classify / Close / Filed-in / Archive (plus Browse, By type, Type mix)
- REFERENCE retrieval table adds a Notion view column; SKILL.md one sentence
- Classify filters `Project=unclassified` (demo also keeps Type=inbox)

## [0.15.12] - One-page memory frame (docs)

Storage was already a folder of Markdown. Docs now say that once: Library → Project → Unit = Identity / Details / Tags / Body. Commands, types, and schema v8 are unchanged.

### Changed
- PRODUCT.md §1.1 is the canonical frame; Tags/Details/index repeats point there
- Skill REFERENCE, README, ARCHITECTURE use the same tree

## [0.15.11] - Addressing: tag or body, prefixes, key boost

`--tag` is a constraint, not a gate. A token in the Tags field **or** the body both retrieve; field hits rank higher. Prefixes jump type / id / project without collapsing Project into Tags.

### Added
- `chunk_keys` addressing table (schema **v8** rebuild)
- Query prefixes: `type:`, `status:`, `agent:`, `tag:`, `id:` / `#NNNN`, `project:<slug>`, `cm:slug:type:key`
- `searchScoped` — `project:` selects which indexes to query; does not default to `--all`

### Changed
- `--tag` / `tag:` = AND of (key **or** FTS) per token; tagged rows get `keyBoost`
- Bare `decision` / `work` / `ops` stay FTS words (`GENERIC_BARE_TOKENS`); `type:decision` is the type filter
- `--explain` prints `key=` and matched keys

### Migration
```bash
npm run build && npm link
centricmem setup --workspace "<library>" --persist-home --install-skill
centricmem index --all   # schema v8 rebuild
centricmem search --tag VAN68
centricmem search type:decision
centricmem search "#0016"
```

## [0.15.10] - Corpus work merge: one edition, one search hit

Same bibliographic work can live as volume + chapter + recipe cards. YAML `work:` + `card_role:` unify them; search dedupes by work and boosts volume spines.

### Added
- `corpusRetrievalBoost()` — boosts `card_role: volume`, penalizes `superseded` / `stub`
- `dedupeSearchByWork()` — one ranked hit per `work:` id; `workSiblings` counts collapsed cards
- `corpus/works/` path demotion in `pathRetrievalBoost` (manifests stay searchable, low rank)

### Changed
- Skill / ingest protocol: same edition → merge under one `work:` id, not parallel folders
- Search scoring applies corpus boost from frontmatter meta

## [0.15.9] - Retrieval grain: cards over dumps and catalogs

Search should open a recipe or reference card, not a file list or a 2MB OCR dump. Indexer skips babylonian `_fulltext`, duplicate `_fulltext_complete`, leaf `corpus/…/_index.md` catalogs, and `## Opening (OCR)` excerpts. Cards and early-chinese transcriptions stay. Ranking boosts `corpus/references/` and `corpus/recipes/`. Memory Map reports live indexed-file and chunk totals (not this-run deltas). Health conflict detector ignores retract/ingest-batch title noise.

### Added
- Index skip for babylonian `sources/**/_fulltext*`, `_fulltext_complete.md`, `_ocr-verification.md`, `_sumerogram-concordance.md`, and leaf corpus catalogs
- Chunk skip for `## Opening (OCR)` on cards; YAML `id:` stays searchable after frontmatter strip
- Fence-aware `##` splitting so JSTOR `## Page N` inside OCR excerpts is not a fake section
- `pathRetrievalBoost` so cards outrank leftover catalogs

### Changed
- Skill 0.15.9 — open `corpus/references/` or `corpus/recipes/` hits first
- Memory Map: Indexed files + Chunks from the live DB
- Health: title overlap ignores housekeeping that cites `#NNNN`; retract/ingest-batch stopwords

## [0.15.8] - Skip secondary dumps and Strahil OCR in FTS

Corpus retrieval grain is `corpus/` cards plus secondary catalogs. Large JSTOR/OCR dumps and the dirty Strahil tree stay on disk but leave the SQLite index. Re-index then VACUUM the project `memory.db` (never Cursor chat state).

### Added
- Index skip for `imported/academic/sources/strahil-medical-md` and any path segment `reading/`
- Index skip for `imported/academic/secondary/**/*.md` except `_index.md`, `_catalog.md`, `_README.md`, `_manifest.md`

### Changed
- Skill 0.15.8 — corpus search uses cards; `show` a dump path when the OCR page is needed

## [0.15.7] - Corpus `-p` and ingest-helper index skip

Working in the CLI clone still binds writes to project `centricmem`. Corpus keep/done/ambient must pass `-p <slug>`. Indexer no longer FTS-indexes `_RESUME-SLICE.md` or OCR audit notes.

### Added
- Index skip for `_RESUME-SLICE.md`, `ocr_completion*`, `ocr_quality_notes.md` (any folder)
- Skill: `ambient -p <slug>` when `corpus=` is set; ledger continuation does not `keep`+`done` every turn

### Changed
- Skill 0.15.7 — corpus search prefers cards + `--filter`; `log-decision` flags documented; non-Latin OCR cards keep recoverable transliteration

## [0.15.6] - Steam-style client vs memory library

CLI install location and the memory library are independent. `setup --workspace` picks the library; `--persist-home` remembers it. Setup refuses to use the CentricMem source folder as the library.

### Added
- `setup --workspace --persist-home --migrate-home --from-home --retire-old-home`
- Library pointer at `%APPDATA%/centricmem/home.json` (or `~/.config/centricmem/home.json`)
- `doctor` prints **Client** and **Library** as two paths

### Changed
- If `CENTRICMEM_HOME` points at the CLI folder and a library pointer exists, the pointer wins
- Manager no longer hardcodes `E:\centricmem`; it uses the same env + pointer rules

### Migration
```bash
centricmem setup --workspace "<library-path>" --from-home "<old-hub>" --migrate-home --persist-home --retire-old-home --install-skill
```

## [0.15.5] - Core skill manages structured corpora

The main agent skill can search, filter, show, and re-index a faceted markdown corpus. Ambient lists those projects as `corpus=<slug>` (any project with `domain_boost` or `imported/academic/`). Dimension names stay in that project's `config.json`. `academic-db-agent` is optional.

### Added
- Ambient `corpus=` hint; Skill + REFERENCE corpus workflow (`--filter`, full-file `show`, `index -p`).

### Changed
- Indexer already follows directory junctions under `imported/` (Windows). `setup --install-academic-skill` also copies to `~/.cursor/skills/`.

## [0.15.4] - Manager 0.2: status first

The Windows Manager now opens on a plain-language status dashboard instead of a Markdown reader. It shows monitoring, inbox and backup health before browsing.

### Added
- Complete desktop search through the existing FTS index (`centricmem search --json`), including imported history.
- One-click inbox filing into an existing project, correct lesson/session section previews, and automatic hub discovery on first run.
- Persisted backup result, overlapping-folder protection, bounded sync subprocesses, and UI smoke tests.

### Changed
- Desktop **0.2.0** uses five task screens: Home, All Memory, Needs Attention, Backup, and Settings.
- Primary screens hide CLI/Markdown/robocopy/rsync jargon; remote sync stays under Advanced.
- Backups include imported attachments; only rebuildable `.index/` data is excluded.
- Custom memory locations survive restart through a small app-level pointer; watcher/index failures are visible instead of reporting a false healthy state.

## [0.15.3] - Host filing + classify hints

Inbox can match a project via `classify_hints` in that project's `config.json`. This machine's ops (VAN68, disk junctions) live in project `host`, so a clean inbox is the baseline.

## [desktop 0.1.0] - Memory manager (Windows)

Tray app in `desktop/`: watch `$CENTRICMEM_HOME/projects/`, open a memory file, show where it lives, copy `projects/` to a cloud folder or rsync remote. Not a second database.

## [0.15.2] - Session titles from the summary

`done "what happened"` stores that text as a short heading (first sentence, ≤72 chars), like a chat title. `--title` still overrides. No more `21:01 session` / `auto` when the summary is already there.

---
## [0.15.1] - Unique session files (multi-writer)

`done` / `log-session` no longer append into a shared `sessions/YYYY-MM-DD.md`. Each close is one file: `sessions/<UTC-stamp>-<writer>-<id>.md`, so laptop and VPS rsync/Drive copies add instead of overwriting.

### Changed
- Session units include **writer in the filename** and `logged_by` in the body. Readers still accept leftover daily bundles.
- Inbox treats unique session files as independent; only legacy `YYYY-MM-DD.md` stays skip.

### Migration
Existing daily files keep working. New closes write new files. Rebuild index: `centricmem index --all`.

---
## [0.15.0] - Inbox filing (personal beta)

Writes go to the linked project, or to `unclassified` as an inbox — never silently into `workspace.current`. File from the inbox with `centricmem inbox`.

### Changed
- **Write routing:** `-p` / `CENTRICMEM_PROJECT` → cwd matched to a linked `sourceDir` → **`unclassified`**. `centricmem use` only pins display / ambient hint.
- `setup --link` refreshes `sourceDir` when you re-link the same slug.
- Skill **0.15.0** — filing is part of close: `cwd_project=(unlinked)` → inbox, then `inbox` / `classify`. Do not write into the wrong `current`.
- `REFERENCE.md` — L0 `search` / L1 `show` / L2 `show --original`. Ambient prints `inbox=N` and `working_set=3dec+3tail`.
- `suggest-classify` weights Tags vs slug and `sourceDir` basename.

### Added
- `centricmem inbox` — list independent unclassified files (`decisions/*.md`, `imported/**/*.md`) with a top suggestion
- `centricmem inbox --apply` — move high-confidence matches only (score ≥ 3 and clearly ahead of #2)

### Migration
```bash
npm run build && npm link
centricmem setup --install-skill
centricmem setup --link <your-code-repo>   # fix sourceDir if cwd_project=(unlinked)
centricmem inbox                           # drain backlog; --apply only for high-confidence
```

---
## [0.14.10] - Chat transcript is the backup

「Session end」was three different clocks. The local Cursor jsonl is already the chat backup; close should `keep` it, not paste the conversation.

### Changed
- Skill **0.14.10** — close = `keep <transcript.jsonl>` + `done --attach`. A **turn** may `done`; a **chat** is the jsonl; IDE `sessionEnd` hooks are a third clock (Cloud does not fire them).
- `keep` of `.jsonl` / `agent-transcripts` stores the original in `imported/attach/` and does **not** put the dump into the searchable stub.

### Migration
```bash
npm run build && npm link
centricmem setup --install-skill
# on Non-Micro close, if you have the path:
centricmem keep "$TRANSCRIPT_JSONL" --tags chat --title "…"
centricmem done --tags topic --attach "$TRANSCRIPT_JSONL" "what happened"
```

---
## [0.14.9] - Short Skill, fail closed

Cloud / private-worker agents were reading a 200-line Skill (or skipping it), while `centricmem` was missing from PATH. Memory never ran. This release makes the Skill short, the CLI honest, and ambient safe to inject.

### Changed
- Skill **0.14.9** — ~50-line checklist + `REFERENCE.md`. Description loads on session start/end **and** host/infra/explain-the-machine. Micro is typo/one-liner only; same-thread ≥3 turns or a host fact is Non-Micro.
- Close defaults to one verb: `centricmem done --tags …`. `log-decision` only for durable facts. Do not pretend a close happened if the CLI is missing.
- `ambient` always refreshes `.ambient.md` (do not treat a stale file as a substitute). Shows `cwd_project=(unlinked)` when cwd is not linked.
- Session tails and writes redact credential-shaped strings. Ambient also masks the word `password`.

### Added
- `centricmem doctor` — hub, skill, cwd→project bind
- `REFERENCE.md` installed next to `SKILL.md`

### Migration
```bash
npm run build && npm link
# runtime user (Cloud worker `cursor` included) must have `centricmem` on PATH
centricmem setup --install-skill
centricmem setup --link /path/to/assignment-repo   # if cwd_project=(unlinked)
centricmem doctor
```

---
## [0.14.8] - Keep originals, show full text

### Added
- `centricmem keep <path>` — collect any file as a tagged stub + attached original (`imported/attach/`, not FTS-indexed)
- `centricmem show <file> [--heading] [--original]` — print the memory unit, or the attached source
- `--attach <path>` on `note` / `done` / `log-session` / `log-decision` / `log-lesson`
- Search hits print `show:` / `attach:` so full text is one command away

### Migration
```bash
npm run build && npm link
centricmem setup --install-skill
centricmem keep ./notes.md --tags topic
centricmem show "imported/kept/notes.md" --original
```

---

## [0.14.7] - Collect any useful knowledge

### Changed
- Skill **0.14.7** — CentricMem collects mental models, facts, logic, and work; write a `note` when knowledge appears, not only at session close.
- `lessons.md` is durable knowledge (not only pitfalls). `centricmem note` aliases `log-lesson`. ImportBundle `lessons[]` accepts `tags`.
- Intent router treats 「怎么想 / 知识 / mental model」 as lessons.

### Migration
```bash
npm run build && npm link
centricmem setup --install-skill
centricmem note --tags dual-hub --title "…" --body "…"
```

---

## [0.14.6] - Folksonomy tags (field search + reuse)

### Changed
- Tags are an **open folksonomy** — Skill no longer ships a closed `work|ops|…` vocabulary. Reuse names from ambient `Tags:`, or mint a specific one (`VAN68`, `腹心疾`).
- `search --tag <name>` (repeatable, AND) filters the Tags field, not body text. Tag-only browse: `search --tag VAN68` with no query, ranked by recency.
- Ambient lists existing tags (`Tags: VAN68×4, wifi×2`); class words (`work`, `ops`, …) sort last so agents reuse specific names.
- Search hits print `tags: …`. Index schema **v6** rebuilds so existing Tags lines become field-filterable.

### Migration
```bash
npm run build && npm link   # if developing from clone
centricmem setup --install-skill
# first search after upgrade rebuilds the index (schema v6)
centricmem search --tag VAN68
centricmem done --tags VAN68,wifi "what shipped"
```

---

## [0.14.5] - Curate contract (session tags + close)

### Added
- `log-session --tags` / `done --tags` — sessions store `- **Tags**: …` (FTS-searchable); preferred Cloud close verb is `done`
- `log-lesson --tags` parity
- Ambient `Curate: today_sessions=N` hint (`N=0` reminds Non-Micro to close)
- Agent Skill **Close contract** — Non-Micro MUST end with tagged curation; closed tag vocab; Skill **0.14.5**

### Migration
```bash
npm run build && npm link   # if developing from clone
centricmem setup --install-skill
# close Non-Micro work:
centricmem done --tags work,ops "what shipped"
```

---

## [0.14.4] - Cold-start UX (UNINITIALIZED + bootstrap)

### Added
- **Soft UNINITIALIZED preflight** for `ambient`, `status`, and `skill status` when product home is missing (exit 0; parseable `state=UNINITIALIZED` / `hub: UNINITIALIZED`) — distinct from skill status `missing`
- `setup --bootstrap` — implies `--link-all` + `--install-skill` (hooks stay off)
- `setup --link <path>` — repeatable explicit project paths (Cloud multi-repo)
- Agent Skill session checklist + cold-start recipe; Skill version **0.14.4**

### Migration
```bash
npm run build && npm link   # if developing from clone
# Cloud / empty home:
centricmem setup --bootstrap
# or: centricmem setup --bootstrap --link /path/to/repo
centricmem setup --install-skill   # refresh Skill
```

---

## [0.14.3] - Security: import path confinement

### Fixed
- **ImportBundle `rel_path`**: resolve destination under `imported/` and reject absolute paths, `..`, empty segments, and escaped idempotency map entries (write confinement)

### Migration
```bash
npm run build && npm link   # if developing from clone
```

---

## [0.14.2] - Agent Skill UX (multi-repo / ops / no-hooks)

### Changed
- **Agent Skill**: product-home vs code-repo table; **Ops** classify class; multi-repo `use` / `CENTRICMEM_PROJECT` when cwd misses linked `sourceDir`; skip deep search on empty ambient; Cloud / no-hooks must `log-session` with natural language; ops host facts in Step 3 (no secrets)
- Integrations README: Cloud / no-hooks session-end guidance aligned with Skill

### Migration
```bash
npm run build && npm link   # if developing from clone
centricmem setup --install-skill
```

---

## [0.14.1] - Usability polish

### Added
- `log-session --auto` — summary from `active_context.md` **Current Focus** (hooks use this instead of placeholder text)
- Workspace health warns on **broken `sourceDir`** and **`CENTRICMEM_HOME`/`WORKSPACE` without `workspace.json`**
- `search --all --semantic` / `--explain` via `searchAllAsync` (RRF across projects)
- Ambient preflight surfaces workspace-level link/env warnings

### Changed
- Cursor / Claude sessionEnd hooks: `log-session --auto --title hooks`
- PRODUCT §9 / BETA upgrade notes aligned to 0.14.x

### Migration
```bash
npm run build && npm link
centricmem setup --install-skill --install-hooks
```

---

## [0.14.0] - Retrieval quality (RRF + validity + explain trajectory)

### Changed (breaking for `--semantic`)
- **`--semantic` uses Reciprocal Rank Fusion** over dual candidate lists (FTS + vector), not `α·BM25+(1-α)·cosine`
- `embedding.rrf_k` (default 60); `hybrid_alpha` ignored for semantic ranking
- Cursor / Claude sessionEnd hooks now `log-session` then `index` (was index-only)

### Added
- Optional **`valid_from` / `valid_until`** (YAML or body lines) → `validity_penalty` in search
- Historical-intent queries soften superseded `status_penalty` (0.5 vs 0.1)
- `--explain` trajectory: BM25# / Vec# / RRF + optional supersedes lineage
- [IMPORT_BUNDLE.md](./IMPORT_BUNDLE.md) formal ingest contract
- Docs / web aligned to product home (`$CENTRICMEM_HOME`) for 0.13+

### Migration
```bash
centricmem setup --install-skill --install-hooks   # refresh Skill + hooks
# Re-index if you rely on --semantic embeddings
centricmem index --all
```

---

## [0.13.0] - Agent product home

### Changed (breaking)
- **Product hub** lives at `$CENTRICMEM_HOME` (default `~/.centricmem`), not inside code repos
- Layout: `$CENTRICMEM_HOME/{workspace.json,projects/,skills/}` — no nested `repo/.centricmem/`
- `CENTRICMEM_WORKSPACE` is treated as an alias for the product home (not the git cwd)
- `link` stores **absolute** `sourceDir`; current project resolves from cwd match
- Skill install: `$CENTRICMEM_HOME/skills/` + user-level `~/.cursor/skills/centricmem-agent/`
- Code repos only get optional `.cursor/hooks/` when explicitly requested; **no** `.cursorrules` / `CLAUDE.md` product pointers in git trees
- Develop package stays source-only; Agent usage content lives under `$CENTRICMEM_HOME` / `~/.cursor/skills`

### Added
- `centricmem setup --migrate-from-local` — move `cwd/.centricmem` into product home and delete the local hub
- `getProductHome()`, `matchProjectByCwd()`

### Migration
```bash
centricmem setup --migrate-from-local --install-skill --install-hooks
# Ensure .centricmem/ is gitignored in business/source repos
```

---

## [0.12.1] - Capture → organize

### Added
- **Coexistence model** — other memory skills as capture; CentricMem as organize/retrieve (PRODUCT §2.2, Skill, BETA)
- **Import upsert** for `imported[]` / `research[]` on the same `external_id` (default); CLI `--skip-existing` for one-shot migrate
- **`rules[].external_id`** — skip on re-import; cursor-rules migrate sets path-based IDs
- `setup --install-skill` copies `integrations/` (incl. `capture-adapters/`) and refreshes `.cursorrules` / `CLAUDE.md`
- Capture adapter recipes under `skills/centricmem-agent/integrations/capture-adapters/`

### Fixed
- Import CLI no longer asks for a redundant `index` after import (index already rebuilt)
- Drive MCP hint no longer conflates L2 Drive sync with optional `centricmem-mcp`
- Scenario CLI clears `CENTRICMEM_WORKSPACE` / `CENTRICMEM_PROJECT` so tests are not polluted by the parent env

### Changed
- Docs / web ecosystem copy aligned to shipped adapters (ImportBundle + migrate + recipes), not unshipped product names

---

## [0.12.0] - Agent-agnostic Skill

### Changed (breaking)
- **Canonical skill path** is now `.centricmem/skills/<name>/SKILL.md` (was `.cursor/skills/`)
- `setup --install-skill` installs to `.centricmem/skills/`; pointer files (`.cursorrules`, `CLAUDE.md`) reference the new path
- `--install-hooks` is Cursor-only convenience; lifecycle contract documented in `skills/centricmem-agent/integrations/`
- `skill status` no longer treats legacy `.cursor/skills/` as installed — run `centricmem setup --install-skill` to migrate

### Added
- `skills/centricmem-agent/integrations/` — lifecycle README + Cursor, Claude Code, and MCP reference snippets
- Legacy install detection hint when `.cursor/skills/` exists but canonical path is missing

### Migration
```bash
centricmem setup --install-skill
# Optional Cursor hooks: centricmem setup --install-hooks
```

---

## [0.11.1] - Skill Status

### Added
- **`centricmem skill status [name]`** — compare bundled vs installed Skill (`--json`, `--path`)
- Status values: `ok` | `outdated` | `missing` | `modified` | `incompatible`
- Skill frontmatter contract: `version`, `compatible_cli`, `changelog_url`
- **`ambient`** appends one-line hint when Skill is not `ok`
- `src/skill.ts`; 7 integration tests

### Changed
- `centricmem-agent` / `academic-db-agent` SKILL frontmatter updated to v0.11.1

---

## [0.11.0] - Corpus Metadata + Academic Domain

### Added
- **YAML frontmatter parsing** for imported corpus docs → `chunk_meta` table (schema v5)
- **Generic metadata filter**: `centricmem search --filter civilization=chinese --filter type=recipe`
- MCP `centricmem_search` optional `meta` parameter
- **`domain_boost`** in project `config.json` — dimension keywords + `path_prefix` ranking signal
- **P2 hot columns** (`meta_civilization`, `meta_type`, `meta_has_incantation`) — default off via `metadata.hot_columns_enabled`
- ImportBundle: `imported[].meta`, `imported[].rel_path` (preserves corpus subdirs under `imported/`)
- **`skills/academic-db-agent/SKILL.md`** + `setup --install-academic-skill`
- **`templates/config.ancient-medicine.json`** — 15 comparison dimensions (L1 example config)
- Academic routing in `retrieve.ts` (corpus / crosswalk query hints)
- Scenario `s16-academic-filter.mjs`; 32 integration tests

### Changed

- PRODUCT §2.1 **Adapter in, not Platform out** — core does not bind specific Agent brands

### Removed

- Agent session directory discovery from core (`discoverAgentSessionDirs`); session observability stays out of L0

### Docs
- [ACADEMIC_DB_REPORT.md](./ACADEMIC_DB_REPORT.md) — academic corpus optimization report (9 sections)

## [0.10.0] - Memory Links + Architecture Consolidation

### Added
- **Memory Links layer** (PRODUCT §3.6): typed edges between decisions, extracted from Markdown at index time
  - `supersedes` (existing pointer, now indexed) / `refs` (explicit `- **Refs**: #0001`) / `mentions` (automatic inline `#NNNN`)
  - `centricmem refs <seq> [--depth 1-3]` — walk the link neighborhood in both directions
  - `centricmem log-decision --refs "1,4"`; ImportBundle decisions accept `refs[]`
  - Structural in-degree feeds `ref_boost` (referenced decisions rank higher, 2x weight vs search hits)
  - `route` recognizes dependency/reference queries → suggests `refs` instead of `search`
- Index schema v4 (`links` table; fully derivative, rebuilt from Markdown)

### Simplified (16 → 12 modules)
- `session.ts` → merged into `memory.ts` (all memory-unit writes in one module)
- `workspace-health.ts` → merged into `workspace.ts`
- `route.ts` + `ambient.ts` → merged into `retrieve.ts` (read-side strategy)
- `import-schema.ts` → merged into `import.ts` (schema + materialization together)
- Public function signatures unchanged; only import paths moved

### Tests
- 26 integration tests (adds link extraction, bidirectional traversal, ref-boost ranking, refs routing)

## [0.9.0] - Implicit Memory + Roadmap Completion

### Added
- **Implicit memory layer**: `centricmem ambient`, Cursor hooks (`setup --install-hooks`), `.ambient.md`
- **Session / episodic memory**: `sessions/YYYY-MM-DD.md`, `centricmem log-session`
- **Retrieval routing**: `centricmem route`, research intent, full Skill routing table
- **Promote workflow**: `centricmem promote --from-distill --confirm`
- **ImportBundle**: `sessions[]`, `research[]` types
- **`centricmem suggest-classify`**, **`status --workspace`** (unclassified backlog)
- **Hybrid search**: `search --semantic` (OpenAI-compatible embedding API)
- **`search --explain`**, **`centricmem dismiss`** (negative feedback)
- **MCP**: `centricmem_log_session`, search `explain`/`semantic` params
- **Docs**: PRODUCT §3.5, [SYNC.md](./SYNC.md)

### Changed
- memory-bank `progress.md` migrates to `sessions/` not `active_context`
- Memory Map includes Sessions count
- Index schema v3 (embeddings + feedback tables)

### Hardened / simplified (audit pass)
- **Security**: `classify` / `suggest-classify` reject path traversal; MCP server no longer scaffolds `.centricmem` in arbitrary cwd
- **CLI**: `log-decision` / `log-lesson` commands (Skill-first, no MCP required)
- **Skill-first everywhere**: `.cursorrules`, templates, and repo AGENTS.md reference CLI, not MCP tool names
- **Hooks**: `sessionEnd` → `centricmem index --all --quiet`
- **Removed dead code**: sync embed stub, duplicate index helper, deprecated `findProjectRoot` / `initProjectMemory`
- **Scenarios**: S3/S9/S12/S13/S15 ported to workspace layout with assertions; S6/S8 (exploratory, no assertions) removed; 13 scenarios in CI
- **Tests**: 23 integration (adds traversal rejection + mock-embedding semantic search)
- **Docs**: README/BETA/ARCHITECTURE/TEST_RESULTS aligned with v0.9

## [0.8.0] - Workspace Hub + Skill-first

Breaking: single-root `.centricmem/` removed. Use workspace hub.

### Added
- **Workspace hub**: `.centricmem/workspace.json` + `projects/<slug>/`
- **`unclassified` project**: default import/classify staging
- **CLI**: `setup`, `link`, `use`, `projects`, `classify`, `import`
- **ImportBundle v1**: `centricmem import` with idempotency keys
- **Skill**: `skills/centricmem-agent/SKILL.md`
- **`buildIndexAll` / `search --all`**: multi-project index and search
- **CI**: GitHub Actions (ubuntu + windows)
- **BETA.md**, issue templates, scenario smoke runner

### Changed
- `init` creates workspace hub (not flat `.centricmem/`)
- `migrate` routes through ImportBundle → `unclassified`
- Pointer files recommend Skill + CLI (MCP optional/sync-only)
- `centricmem-mcp` supports `CENTRICMEM_WORKSPACE` + `CENTRICMEM_PROJECT`

### Removed
- Single-project `.centricmem/` at repo root (use `projects/<slug>/`)

## [0.7.0] - Rename to CentricMem

Breaking rename from MemProject / `memproject` to **CentricMem** / `centricmem`.

### Changed (breaking)
- **npm package & CLI**: `memproject` → `centricmem` (`centricmem-mcp` for MCP server)
- **Memory directory**: `.memproject/` → `.centricmem/` (legacy `.memproject/` still detected for reads)
- **MCP tools**: `memproject_*` → `centricmem_*`
- **Env vars**: `MEMPROJECT_ROOT` / `MEMPROJECT_AGENT` → `CENTRICMEM_ROOT` / `CENTRICMEM_AGENT`
- **HTML markers**: `memproject:map` / `memproject:meta` → `centricmem:map` / `centricmem:meta` (legacy markers still parsed)

### Migration
1. Rename `.memproject/` → `.centricmem/` in your project root
2. Update MCP config: tool names and `command: "centricmem-mcp"`
3. Rebuild index: `rm .centricmem/.index/memory.db* && centricmem index`
4. Replace git hook marker if installed: `# memproject-hook` → `# centricmem-hook`

## [0.6.0] - Scenario-Driven Hardening Round 2

Driven by 8 boundary-stress scenario experiments (S8–S15, see `scenarios_report_v2.md`). 9 gaps found, 8 fixed, 1 documented.

### Fixed
- **Concurrent decision-sequence race (major, S10)**: `logDecision()` now claims its sequence number atomically via an O_EXCL sentinel file (`.NNNN.seq`) with a retry loop. Ten parallel processes previously produced duplicate numbers (e.g. two `#0003`); now guaranteed unique.
- **CJK compound-word search (S9)**: new `segmentCjk()` splits contiguous CJK runs into overlapping bigrams, applied to both indexed text and queries. `会话缓存` now matches inside `使用 Redis 做会话缓存`. The FTS5 table gained a `seg` column (raw text kept for snippets, bm25 weights 4/2/1); a `user_version` schema check auto-rebuilds old indexes transparently.
- **Migration agent label inconsistency (S12)**: all migrated content is now stamped `migration` (was a mix of `migrate`/`migration`), so `--agent migration` filtering works across rules, decisions, and context.
- **Memory Map rule counting (S12)**: imported rule sections in AGENTS.md are now counted in the Rules row; imported files are counted recursively.
- **Empty-title validation (S11)**: `logDecision()` and `logLesson()` reject empty/whitespace titles with a clear error instead of writing `untitled` files.
- **Intent router accuracy (S14)**: added patterns (`decided`, `rationale`, `today`, `focus`, `went wrong`, `mistake`, `failure`, `进展`) — benchmark accuracy 16/20 → 20/20.
- **Distill title-noise (S15)**: generic decision verbs (`add`, `adopt`, `switch`, `replace`, `migrate`…) added to the stopword list so they no longer surface as fake patterns.
- **`search()` limit validation (S11)**: non-numeric `limit` arguments are coerced/fall back to config instead of leaking a raw SqliteError.

### Known limitations (documented)
- Emoji are not searchable (FTS5 `unicode61` strips them as punctuation). Text around them indexes normally.

### Performance (S8 baseline, 50 decisions)
- buildIndex: 12 ms (51 files, 55 chunks); search: avg 0.5 ms; distill: 3 ms.

## [0.5.1] - Tags Searchable, Log Lesson, DX Polish

### Added
- **Tags are now searchable**: Decision chunks append `tags: <word> <word>` to their FTS5-indexed content, so searching a tag word (e.g. `database`) hits decisions even when the body text never uses that word.
- **`logLesson()` / `centricmem_log_lesson` MCP tool**: Append a lesson learned (pitfall, gotcha, hard-won knowledge) to `.centricmem/lessons.md`. Idempotent by `## {title}` heading. Triggers incremental index rebuild. Agent attribution stamped via `logged_by=` meta comment and correctly parsed by the indexer.
- **Lesson agent attribution**: `extractMeta` now parses `logged_by=` in `<!-- centricmem:meta ... -->` comments, so lessons logged via MCP show the correct agent in search results.

### Updated
- **README**: Features list now includes Decision Evolution Chain, Agent Filtering, and Memory Map sections; Quick Start search examples include `--agent` filter; MCP tool list updated to 5 tools with accurate descriptions.
- **MCP tool descriptions**: `centricmem_search` description now mentions agent filter; `centricmem_read_context` description updated to reflect structure-aware summary behaviour.

## [0.5.0] - Scenario-Driven Optimisation

Driven by 7 scripted user-journey experiments (see `scenarios_report.md`). All fixes verified by re-running the corresponding scenario plus the full 10-case integration suite and MCP end-to-end suite.

### Fixed
- **[S7, critical] Structure-aware summary truncation**: `readContext(level="summary")` previously took the first 50 lines of `AGENTS.md` blindly, so a large file (e.g. 60 imported rules) pushed the Memory Map out of view — defeating progressive disclosure. The Memory Map block is now **always pinned** into the summary (appended as `## Memory Map (pinned)` when outside the head window).
- **[S4, major] Supersede chain back-pointers**: `logDecision({ supersedes: N })` now also writes `- **Superseded by**: #NNNN` into the old decision file. The chain is displayed in both directions: `centricmem status` shows `→ superseded by #0005` / `(supersedes #0003)`, and search results tag superseded hits with `→ superseded by #NNNN` so agents immediately see where the current answer lives.
- **[S2, minor] Migration agent attribution**: imported rule chunks were indexed as `by: unknown`. Importers now stamp provenance (`imported <ISO> by migration` / `updated_by=migration`) and the chunker extracts per-chunk attribution, so imported content is searchable with `--agent migration`.
- **[S1, minor] Snippet quality**: decision chunks are indexed without the H1/metadata bullet lines, so FTS5 snippets start at the real Context/Decision content instead of `- **Status**: Accepted - **Logged at**: …`.
- **[S5, medium] Distill stopword noise**: prepositions/qualifiers (`via`, `through`, `per`, `within`, … 30+ words) added to the stopword list — no more `"via" ×3` pseudo-patterns.
- **[S5, medium] Health distillation nudge**: threshold for “many decisions but empty Global Rules” lowered from 50 to 10; additionally, a tag cluster (≥3 same tag) with empty Global Rules now emits an info-level nudge from 5 active decisions.

### Added
- **[S3, major] Agent filter for search**: `SearchFilters.agent`, CLI `search --agent <name>`, and MCP `centricmem_search` `agent` parameter. Chunks store the source agent; multi-agent projects can now slice memory by author.
- **[S3, minor] Agent contribution summary in `status`**: e.g. `Agents: cursor: 3, claude-code: 3`.
- **[S1, minor] Better onboarding**: `centricmem init` now prints a concrete “log your first decision” step.
- **[S2, medium] Large AGENTS.md warning**: `centricmem migrate` warns when AGENTS.md exceeds 100 lines and suggests curating imported rules into `## Global Rules`.
- **[S6, minor] BM25 guidance on no results**: the MCP search tool now explains the keyword-overlap requirement and suggests alternative keywords or `centricmem_read_context`.
- **Schema**: `chunks.superseded_by` column; `SearchResult.supersededBy` and `DecisionSummary.supersedes/supersededBy` exposed in the public types.

### Notes
- Index DBs created by ≤0.4.1 need one `rm .centricmem/.index/memory.db* && CentricMem index` to pick up the new column (the schema is additive; fresh projects are unaffected).

## [0.4.1] - Memory Map, Supersedes & npx

### Added
- **Memory Map auto-update**: `buildIndex()` now automatically regenerates the `<!-- centricmem:map --> ... <!-- /centricmem:map -->` block in `AGENTS.md` after every index run. The block shows decision counts (with active/superseded breakdown), rules count, lessons count, imported count, last indexed timestamp, and total chunk count. If the markers are absent, they are inserted under `## Memory Map` (or appended at EOF).
- **`supersedes` parameter in `logDecision()`**: pass `supersedes: N` to mark decision #N as `Superseded` automatically. The new decision file records `- **Supersedes**: #NNNN`. Works in both CLI (programmatic) and MCP (`centricmem_log_decision` tool).
- **`AGENTS.md` template updated**: the initial Memory Map section now includes the `<!-- centricmem:map -->` marker pair so it is auto-managed from the first `centricmem index` run.

### Fixed
- **Integration test 3** updated to account for AGENTS.md being rewritten by `updateMemoryMap` on the second `buildIndex` call (incremental run may index 0 or 1 file).

### Verified
- Both `dist/cli.js` and `dist/mcp-server.js` have `#!/usr/bin/env node` shebang on line 1.
- `package.json` `bin` field exposes both `CentricMem` and `centricmem-mcp`.
- `node /path/to/dist/cli.js init` (npx-equivalent) works correctly in a fresh directory.

## [0.4.0] - Final Polish

### Added
- **Integration test suite** (`tests/integration.test.ts`): 10 test cases covering all core paths using Node.js built-in `node:test` runner — no extra dependencies. Run with `pnpm test`.
- **`closeAllCached()` export** from `indexer.ts`: MCP Server now registers a `process.on('exit')` handler to flush WAL and close all cached DB connections gracefully.
- **Separate `tsconfig.tests.json`**: Tests compile to `dist/tests/` independently from `dist/`, keeping `rootDir=src` clean for the main build.

### Changed
- **Distill algorithm upgraded** — two-strategy pattern mining:
  - *Tag heuristic*: explicit `tags` set by the user on 2+ decisions are treated as high-confidence patterns (ranked above keyword patterns).
  - *Keyword frequency*: unchanged, now de-duplicated against tag patterns.
  - Patterns show `[tag]` or `[keyword]` source label.
- **Distill early-exit message improved**: when fewer than 5 active decisions exist, outputs `"X decisions logged. Distillation works best with 5+ decisions — keep logging."` instead of a generic "not enough" message.
- **`package.json` metadata**: added `repository`, `homepage`, `bugs`, `author` fields for npm publish readiness.
- **`files` field in `package.json`**: now includes `src/`, `tests/`, and `tsconfig.tests.json` so the published package ships full TypeScript source.
- **README**: added *How It Works* section with architecture flow diagram before the Features list.
- **Version bumped to 0.4.0**.

## [0.3.1] - Code & Architecture Optimisation

### Changed (Architecture)
- **Search no longer calls `buildIndex`**: `centricmem_search` now reuses the long-lived DB connection via `getDb()` without triggering a full file scan. Only write operations (`log_decision`, `update_context`, `migrate`) rebuild the index.
- **DB connection reuse in MCP Server**: Introduced `getDb(paths)` in `indexer.ts` that returns a cached `Database` instance for the process lifetime. CLI commands continue to open/close their own connections (short-lived processes).
- **Removed `vectorSearch` stub**: Dead code that returned an empty array unconditionally. Will be re-added when vector search is actually implemented.
- **FTS5 query safety**: Reserved words (`AND`, `OR`, `NOT`, `NEAR`) are now wrapped in double quotes when they appear as search terms, preventing unexpected FTS5 parse errors.

### Changed (Code Quality)
- **Exported public types**: `MemoryChunk`, `SearchResult`, `SearchFilters`, `IndexStats`, `MemConfig` are all exported from their respective modules for external consumers.
- **MCP tool error handling**: Every tool handler is now wrapped in `try/catch` and returns `{ isError: true, content: [...] }` on failure instead of crashing the server process.
- **`migrate.ts` refactored**: Extracted shared `appendToAgents(agentsFile, sectionTitle, body, source)` helper used by both cursor-rules and memory-bank importers, eliminating the duplicated read-modify-write pattern.

### Changed (DX)
- **`init` git tracking tip**: After initialising in a git repository, prints `Tip: Run git add .centricmem/ .cursorrules CLAUDE.md to track memory in version control.`
- **Smarter `search` no-results message**: Distinguishes between "no decisions logged yet" (empty decisions/) and "query returned no matches" (index exists but query missed), with actionable guidance in each case.

## [0.3.0] - MVP Iteration 4

### Changed
- **CLI Simplification**: Reduced CLI commands from 8 to 5 for a more focused experience.
  - Merged `health`, `list`, and `distill` into a single unified `centricmem status` command.
  - Merged `template` commands into `centricmem init` (`--template <name>` and `--list-templates`).
- **MCP Simplification**: Reduced MCP tools from 6 to 4.
  - Removed `centricmem_list_decisions` and `centricmem_distill` (these are now considered human-facing tasks via CLI, keeping the agent toolset lean).
- **Codebase Consolidation**: Merged `config.ts` into `core.ts`, and `project-templates.ts` into `templates.ts`.

## [0.2.0] - MVP Iteration 3

### Added
- **Progressive Disclosure**: `centricmem_read_context` now supports `level` ("summary" or "full"). The default summary mode returns only the first 50 lines of `AGENTS.md` to save context window tokens.
- **Memory Map**: `AGENTS.md` template now includes a routing table instructing agents on which files to read for which purposes.
- **Auto-Distillation**: Added `CentricMem distill` CLI command and `centricmem_distill` MCP tool. It scans active decisions for recurring keyword patterns and suggests rules to promote to `AGENTS.md`.
- **Memory Health Check**: Added `CentricMem health` CLI command to report on stale context, distillation needs, and potentially conflicting decisions (via title word overlap).
- **Project Templates**: Added `CentricMem template list` and `CentricMem template apply <name>` to jump-start project memory with domain-specific rules (`web-app`, `api-service`, `research`, `general`).
- **MCP Enhancements**: 
  - `centricmem_search` now supports `type` and `status` filtering.
  - `centricmem_log_decision` now accepts an optional `tags` array.
  - Added `centricmem_list_decisions` for a fast overview of decision history.

## [0.1.0] - MVP Iteration 2

### Added
- **Query Intent Router**: The search engine now detects user intent (e.g., "why", "current focus", "pitfalls") and boosts relevant memory types (decisions, context, lessons) using a rule-based classifier.
- **Advanced Temporal Decay**: Replaced simple half-life decay with an inverse-linear decay formula (`1 / (1 + decay_rate * days_old)`), configurable via `.centricmem/config.json`.
- **Reference Counting**: The indexer now tracks how often a memory chunk is returned in search results. Highly referenced chunks receive a logarithmic score boost (PageRank-lite).
- **Configuration File**: Added support for `.centricmem/config.json` to customize `decay_rate`, `max_results`, and `ref_weight`.
- **Git Hook Integration**: `centricmem init` now prompts to install a `post-commit` git hook that automatically runs `CentricMem index --quiet`, ensuring the index stays perfectly synced with code changes.
- **Historical Status Support**: The indexer now recognizes `**Status**: Historical` in addition to `Superseded` and `Deprecated`, applying a 0.1x score penalty to downrank them without removing them from the audit trail.
- **Memory Bank Progress Mapping**: `CentricMem migrate --from memory-bank` now maps `progress.md` into an imported section appended directly to `active_context.md` rather than archiving it.

### Changed
- **CLI Search Output**: `centricmem search` now displays the detected query intent and explicit status tags (e.g., `[SUPERSEDED]`) next to results.
- **Migration Idempotency**: `centricmem migrate` now skips importing decision records if a file with the same slug already exists in `decisions/`, preventing duplicates on repeated imports.
- **MCP Server Auto-Init**: The MCP server will now automatically initialize the project (creating `.centricmem/` and default files) if it is started in a fresh directory, preventing hard failures.
- **Error Handling**: All CLI commands that require an initialized project now exit gracefully with a clear instruction to run `centricmem init` first.

## [0.1.0-alpha] - MVP Iteration 1

### Added
- Initial release of `@CentricMem/cli` and `@CentricMem/mcp`.
- SQLite FTS5 hybrid indexer with memory-aware chunking.
- One-way `migrate` tool for Cursor Rules, Memory Bank, and generic Markdown.
- Core MCP tools: `centricmem_search`, `centricmem_read_context`, `centricmem_log_decision`, `centricmem_update_context`.
