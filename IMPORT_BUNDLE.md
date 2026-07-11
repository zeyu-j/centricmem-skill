# ImportBundle Protocol (v1)

CentricMem’s **single ingest contract**. Capture tools map their data here; CentricMem organizes and indexes. Normative schema: Zod in [`src/import.ts`](./src/import.ts).

```bash
centricmem import bundle.json
centricmem import bundle.json --skip-existing   # skip any row with a known external_id
```

## Minimal envelope

```json
{
  "version": 1,
  "project": "unclassified",
  "source": { "type": "my-capture-tool", "name": "optional label" },
  "decisions": [],
  "lessons": [],
  "rules": [],
  "context": { "body": "…" },
  "imported": [],
  "sessions": [],
  "research": []
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `version` | yes | Literal `1` |
| `project` | no | Target slug; default `unclassified` |
| `source` | no | Provenance only (`type`, optional `name`) |
| Arrays / `context` | no | Omit empty sections |

## Section fields

### `decisions[]`

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | |
| `context`, `decision`, `consequences` | no | |
| `agent`, `tags`, `logged_at` | no | |
| `supersedes` | no | Sequence number this replaces |
| `refs` | no | Array of decision sequence numbers |
| `external_id` | no | Stable id from capture system |

### `lessons[]`

`title` (required), `body`, `agent`, `external_id`

### `rules[]`

`body` (required), `title`, `external_id` — appended under AGENTS.md Global Rules

### `context`

`{ "body": "…" }` — **overwrites** `active_context.md`

### `imported[]` / `research[]`

| Field | Required | Notes |
|-------|----------|--------|
| `title` | yes | |
| `body` | no | |
| `external_id` | recommended | Enables upsert |
| `rel_path` | no | Under `imported/` (corpus layout / domain_boost) |
| `meta` | no | String / string[] / boolean — YAML frontmatter + `--filter` |
| `tags` | research only | |

### `sessions[]`

`title` (required), `body`, `logged_at`, `external_id`

## Re-import semantics (`external_id`)

| Section | Same `external_id` again | Default |
|---------|--------------------------|---------|
| `imported[]`, `research[]` | **Upsert** file + reindex | Capture material |
| `decisions[]`, `lessons[]`, `sessions[]` | **Skip** | Append-only organize layer |
| `rules[]` with id | **Skip** | Avoid AGENTS.md bloat |
| `rules[]` without id | Always append | Prefer stable ids |
| `context` | Always overwrite | Last import wins |

`--skip-existing` makes **all** id-bearing rows skip (one-shot migrate style).

## Example (capture dump)

```json
{
  "version": 1,
  "project": "unclassified",
  "source": { "type": "notion-database", "name": "ADRs" },
  "imported": [
    {
      "title": "Auth notes",
      "body": "Meeting dump…",
      "external_id": "notion:page-abc",
      "meta": { "type": "meeting" }
    }
  ],
  "decisions": [
    {
      "title": "Use Redis",
      "context": "Rate limiting",
      "decision": "Redis sliding window",
      "external_id": "notion:adr-1"
    }
  ]
}
```

## Adapter checklist

1. Emit `version: 1`.
2. Use stable `external_id`s from the source system.
3. Prefer `imported[]` / `research[]` for raw capture; use `decisions[]` only when already curated.
4. Run `centricmem import`; classify out of `unclassified` when ready.

See also: [skills/centricmem-agent/integrations/capture-adapters/README.md](./skills/centricmem-agent/integrations/capture-adapters/README.md), [BETA.md](./BETA.md).
