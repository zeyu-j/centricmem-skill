# CentricMem Test Results

**Date**: July 2026  
**Version**: 0.10.0  
**Status**: Beta-ready

## Automated suites (`npm run test:all`)

| Suite | Result |
|-------|--------|
| Integration (`npm test`) | 26/26 pass |
| MCP smoke (`npm run test:mcp`) | 15/15 pass |
| Scenarios (`npm run test:scenarios`) | 13/13 pass (S1–S5, S7, S9–S15) |

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

- Live embedding API path (mocked only)
- npm publish not in scope
