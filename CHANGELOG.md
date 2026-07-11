# Changelog

All notable changes to CentricMem will be documented in this file.

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
