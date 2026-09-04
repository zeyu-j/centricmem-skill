# CentricMem backup (not product sync)

The librarian disk is the source of truth. Product sync is **not** rsync, Drive MCP, or a bidirectional folder replica. Agents do not write R2. Humans do not push a laptop copy back as the hub.

## Disaster recovery (operators)

| Item | Value |
|------|-------|
| Cold backup | **restic → Cloudflare R2** (a **separate** bucket from attach originals) |
| What | Markdown + `imported/attach/` pointers; attach bytes already live in the keep bucket when R2 is on |
| Skip | `.index/` — rebuild with `centricmem index --all` after restore |
| Secrets | restic password ≠ pairing keys ≠ R2 keep credentials |

Restore: R2 → librarian disk → start the process → `index`. Do not treat the backup bucket as a writable memory store.

## Human pull-only copy

Owners may export Markdown (no keys) and open files on their computer. Pull, do not push. A downloaded folder is not the hub.

## Session units (multi-writer)

Each `log-session` / `done` writes `sessions/<UTC-stamp>-<writer>-<id>.md`. Pre-0.15.1 daily `YYYY-MM-DD.md` files still read. Do not auto-merge leftover daily files.

## Do not

- Auto-merge `decisions/` on conflict
- Use MCP as a second search/write store
- Store secrets in memory files
- Dual-write a leftover Windows Manager hub and the cloud librarian (guest CLI refuses leftover-hub writes)

## Related

- [PRODUCT_HOST.md](./PRODUCT_HOST.md) — hosted use, restic, no Drive/rsync product path
- [PRODUCT.md](./PRODUCT.md) — memory architecture
