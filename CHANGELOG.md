# Changelog

## [0.9.0] - Initial public release

CentricMem: cross-agent workspace memory — Skill-first, local Markdown source of truth + SQLite FTS5 index.

### Memory core
- Workspace hub: `.centricmem/workspace.json` + `projects/<slug>/`, with `unclassified` staging
- Memory taxonomy: decisions (append-only + supersede chains), active context, rules, lessons, sessions (episodic), imported (cold)
- ImportBundle v1: normalized write contract for any external source (decisions/lessons/rules/context/sessions/research), idempotent by `external_id`
- Migration adapters: cursor-rules, memory-bank, plain markdown

### Retrieval
- SQLite FTS5 + BM25 with CJK bigram segmentation
- Multi-signal ranking: relevance × time decay × status penalty × ref boost × intent boost × feedback penalty
- Intent router (`centricmem route`) and `search --explain` score breakdown
- Optional hybrid semantic search (`--semantic`) via OpenAI-compatible embedding API (env key only)
- Negative feedback: `centricmem dismiss`

### Implicit memory
- `centricmem ambient` session-start preflight (+ Cursor hooks via `setup --install-hooks`)
- `centricmem log-session` append-only episodic capture
- `centricmem promote` confirm-gated rule promotion from distilled patterns

### Tooling
- Agent Skill: `skills/centricmem-agent/SKILL.md`
- Full CLI: setup, link/use/projects, import/classify/suggest-classify, log-decision/log-lesson/log-session, search, status (project + workspace), index
- Optional MCP server (legacy tool wrapper; Drive MCP recommended for sync only — see SYNC.md)
- CI: integration tests, MCP smoke tests, 13 scenario tests (Ubuntu + Windows)
