# CentricMem Test Results

**Date**: July 2026  
**Version**: 0.11.1  
**Status**: Beta-ready

## Automated suites (`npm run test:all`)

| Suite | Result |
|-------|--------|
| Integration (`npm test`) | 39/39 pass |
| MCP smoke (`npm run test:mcp`) | 15/15 pass |
| Scenarios (`npm run test:scenarios`) | 14/14 pass (S1–S5, S7, S9–S16) |

## v0.11.1 coverage

- **Skill status**: missing / outdated / modified / incompatible; ambient hint line

## v0.11 coverage

- **Corpus metadata**: `parseYamlFrontmatter`, `chunk_meta`, `--filter` / MCP `meta`, hot columns (schema, default off)
- **domain_boost**: path_prefix + keyword boost in explain breakdown
- **ImportBundle**: `meta` + `rel_path` under `imported/`
- **Academic routing**: crosswalk/corpus queries → search + imported type
- **crosswalk**: 1 file = 1 chunk (no row splitting)

## v0.10 coverage

- **Memory Links**: supersedes/refs/mentions extraction, explicit-ref-suppresses-mention, self-ref dropped, bidirectional `getLinks` traversal, ref_boost ranking uplift, dependency-query routing to `refs`
- Workspace init, link/use, ImportBundle import + classify, `search --all`
- Sessions (`log-session`, recent tail), route, promote (confirm-gated)
- `search --explain`, `dismiss` negative feedback
- Semantic hybrid search with mock embeddings (no network in CI)
- `classify` path-traversal rejection
- Supersede chains, time decay ordering, CJK/injection safety, multi-agent attribution
- Mixed migration (cursor-rules + memory-bank → sessions/)

## Removed from suite

- S6 (BM25 limit probes) and S8 (stress) — exploratory, no assertions; superseded by integration tests.

## Known test gaps

- Live embedding API (requires key; semantic path covered with mocks)
- Full 4,674-doc corpus re-import (manual Reasonix validation)
