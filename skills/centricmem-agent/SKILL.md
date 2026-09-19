---
name: centricmem-agent
description: "Organises and retrieves Markdown memory on the hosted CentricMem librarian (search, notes, decisions, transcripts). Use when starting a session, resuming after context compress / checkpoint / new chat, filing Non-Micro work, searching project memory, connecting an agent key, or refreshing this Skill."
license: PolyForm-Noncommercial-1.0.0
compatibility: "Requires host MCP at https://mem.centricmem.com/mcp. CLI >=0.21.50: every card is summary + key points (a keep stub is not a card); a folder is cm_keep card:false then cm_import items. Archive zip is optional. share: shelf ids; cm_move selected cards (whole paths, not lessons.md or #); cm_delete {file,shelf} a card (heading= for ##); cm_rename {file,shelf,title} a card. Omit cm_library id to list. Codex OAuth needs librarian >=0.21.51. OAuth key picker / ChatGPT Approve hop: librarian >=0.21.56. Applicant HTTPS callbacks: librarian >=0.21.55. skipExisting / copy-aside FTS skip need librarian >=0.21.50."
metadata:
  version: "0.21.78"
  compatible_cli: ">=0.21.50"
  changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
---

# CentricMem Agent Skill v0.21.78

Handover (when / loop). Schemas win. Branches: [REFERENCE.md](REFERENCE.md).
**Library** → **Shelf** → **Card** (summary + key points). No Inbox / `unclassified`. One key = grants. Never paste keys.
**Style** of a card (voice, length, evidence density) is yours + this agent's — not a CentricMem house voice. Structure only: REFERENCE **Card contract**.

## When to Use

Start or resume; search; file Non-Micro; connect / refresh Skill. Recipes: REFERENCE.

## 0. Reach

1. MCP only `https://mem.centricmem.com/mcp`: `cm_health` `cm_ambient` `cm_doctor` `cm_search` `cm_show` `cm_note` `cm_log_decision` `cm_done` `cm_keep` `cm_library` `cm_copy` `cm_move` `cm_delete` `cm_rename` `cm_import` `cm_index`. No curl / CLI-write / bootstrap.
2. Missing tools or short grants → **connect this turn**. REFERENCE **Reach**.
3. `cm_show` = card. `grants=["*"]` = default. `ACADEMIC.md` beside this → follow it.

## 1. Classify

| Skip (Micro) | Sweep (Non-Micro) |
|---|---|
| Typo, one-liner, no durable fact | Implement, ops, research, architecture, decision |
| | ≥2 real turns **or** one turn that shipped / decided |

## 2. Start

`cm_health` then `cm_ambient`. Unreachable: say once — no bootstrap. Named shelf for writes.

**Resume = new session.** Compress, checkpoint restore, or new chat on same task → health → ambient first.

Once after health: refresh if `skill_latest` newer (REFERENCE Skill refresh). Name the key once. Don't log → skip sweep. Empty shelf once: REFERENCE Existing memory.

## 3. During

**chunk** = accepted unit (verified fragment, locked decision, evidenced lesson, delivery). Any in this reply → same-turn sweep. Not the whole task.
**yield** = any reply end (incl. progress).

Search/show/ambient while working. Hold half-finished. **Chunk done → sweep before you yield.**
Cards need summary + key points. Keep stubs ≠ cards. File/folder: REFERENCE Writes. Voice/density: theirs + yours (REFERENCE **Card contract**), not a CentricMem template.

## 4. Sweep — single source

No wrap-up wait. Agent close does not run this. Don't log / Skill done → skip.

**Gate:** Non-Micro chunk this reply, zero `cm_*` this session, no Don't log → **sweep before you yield**.

| File now | File at wrap-up |
|---|---|
| Locked decision; method-changing lesson; finished chunk | Version-tied stats; unverified conclusions |

Same `lessons.md` title → 409; rewrite = `cm_delete` then write (REFERENCE). Early wrong write costs more.

MCP down: hold **CentricMem deferred sweep**; connect (REFERENCE); file after health.

`shelf=` / `library=` (REFERENCE **Shelf routing**):

1. Transcript plaintext exists → Shell-read → `cm_keep` (no paste / `path=`). Else skip keep.
2. Same batch: `cm_note` / `cm_log_decision` / `cm_done` (+ `attach`) as needed.
3. Copy/move/delete/rename leftovers: REFERENCE Writes.

## Typical Workflows

Connect: REFERENCE. **Daily:** §2 → work → §4 before yield. Empty shelf: REFERENCE Existing memory.
