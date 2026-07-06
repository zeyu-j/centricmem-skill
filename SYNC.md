# CentricMem Sync Contract (L2)

> External sync layer — optional. Local Markdown remains the Source of Truth.

## Scope

| Item | Value |
|------|-------|
| Sync unit | **Project-level** — `.centricmem/projects/<slug>/` |
| Remote role | Replica / backup only |
| Conflict resolution | **Local wins** — never auto-merge decision files |

## Recommended flow

1. `centricmem index --all` — ensure local index is current
2. Sync project folder to remote (e.g. Drive MCP)
3. On pull: treat remote as read-only unless human confirms overwrite

## Do not

- Auto-merge `decisions/` on conflict
- Use MCP as local search/write path
- Store secrets in synced memory files

## Roadmap: remote read-only index

`config.json` may include `remote_index_url` for future read-only remote indexes. Not implemented in v0.9.

## Related

- [PRODUCT.md](./PRODUCT.md) — L2 external layer
- [BETA.md](./BETA.md) — setup with `--drive-mcp-hint`
