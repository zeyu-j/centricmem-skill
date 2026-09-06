---
name: centricmem-agent
description: "Organises and retrieves Markdown memory on the hosted CentricMem librarian via host MCP (search, notes, decisions, transcripts). Use when starting a session, filing Non-Micro work, searching project memory, connecting an agent key, or refreshing this Skill. Never write Inbox, never curl librarian HTTP, never paste keys in chat."
license: PolyForm-Noncommercial-1.0.0
compatibility: "Requires host MCP at https://mem.centricmem.com/mcp (or stdio centricmem-host). CLI >=0.21.14 for connect --device."
metadata:
  version: "0.21.24"
  compatible_cli: ">=0.21.14"
  changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
---

# CentricMem Agent Skill v0.21.24

Glossary: **Library** (one per person) → **Shelf** (pairing-key vault; pass `shelf=<id>` or `library=<id>`) → **Card** (Markdown: Identity / Details / Tags / Body, [REFERENCE.md](REFERENCE.md)). Inbox is a system shelf, never a sweep target.

CentricMem is the **manager layer** (organise / retrieve / cross-agent store) **and** the literature database. Session capture stays in the agent's own memory (Cursor memories and other plugins). Do not uninstall those. Do not write back into them. New literature: keep the original, read it, write Markdown cards. Isolation is **one key = its grants**. Default account key (`*` = every shelf in this library): search, sweep, `cm_library`, drain Inbox. A pairing key opens only that shelf. Pass `shelf=` / `library=` / `cwd=` so writes route. Tags stay about. The librarian is the only writer. Login uniquely owns delete and billing. The default account key (`*`) may mint, rename, grant, and revoke other keys, including every pairing key on a shelf. Pairing keys cannot. Attachments are metered per plan; Markdown is unlimited.

## 0. Reach the librarian

1. **MCP only.** Same `cm_*` tools whether the agent points at `https://mem.centricmem.com/mcp` (Bearer: shelf pairing key or owner-granted account key) or at stdio `centricmem-host`: `cm_health` `cm_ambient` `cm_doctor` `cm_search` `cm_show` `cm_note` `cm_log_decision` `cm_done` `cm_keep` `cm_library` `cm_inbox` `cm_import` `cm_classify` `cm_index`. Never curl librarian HTTP. Never CLI `note`/`keep`/`done`. Never `setup --bootstrap`. Never create a hub in the git checkout.
2. If those tools are **missing**, or this chat is a pairing key and the owner needs every shelf, or they need to add this librarian to the agent: **send the authenticate link**. Never ask them to paste the key here. Never one-click install. Never copy JSON into chat. Do not curl. Do not invent a hub. Keep working in the agent’s own memory.
   Run `centricmem connect --device`. Send **only** the printed URL (`/connect?device=…`). Never the device secret. They have ten minutes to enter the key. Then a new chat.
   They enter **the key they want** on that page (default = every shelf in this library, or a pairing key = that shelf). Humans sign in at the website for the dashboard — do not send a loopback `/connect`.
3. `cm_show` is the Markdown **card**. Never original=. Never paste `/download`. `cm_health` `r2=true` means originals sit in object storage. `cm_health` `scope=grant` with `grants=["*"]` is the default key — manage every shelf; `scope=pairing` is one shelf. Owner stuck on a pairing key: send the authenticate link (step 2); **this chat keeps the old Bearer**. Pass `shelf=` / `library=` / `cwd=` so writes route. Corpus = that shelf’s key or grant. If `ACADEMIC.md` exists next to this file, follow it.

## 1. Classify

| Skip (Micro) | Sweep this turn (Non-Micro) |
|---|---|
| Typo, one-liner, trivial syntax, no durable fact | Implement, ops, research, architecture, corpus lookup, a product/host decision |
| | Same thread ≥2 real turns **or** one turn that shipped or decided something |

## 2. Start

`cm_health` then `cm_ambient`. Ignore a stale `.ambient.md`. Unreachable or `state=UNINITIALIZED`: **say once** — do not bootstrap. Writes need a **named shelf** — never Inbox / `unclassified`, even when `cwd_project=(unlinked)`. `corpus=<slug>` → `library=` that slug. Never treat ambient **text** “Skill outdated” as truth (librarian hub copy). This file is `~/.cursor/skills/centricmem-agent/SKILL.md`.

**Once this chat, after health/ambient:** compare this file’s `version` to `skill_latest` on `cm_health` / `cm_ambient`. If that field is null, GET `https://raw.githubusercontent.com/zeyu-j/centricmem-skill/main/skills/centricmem-agent/SKILL.md` and parse `version`. If published is newer: `npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -g -y`. Tell the human it is on disk; **this chat still uses the already-loaded Skill**; the next chat uses the new one. If this file is newer, or fetch/npx fails: continue. Never `setup --install-skill` for this refresh.

**Once after Skill install / first ambient this chat:** tell the human how they use it (their language). They keep talking here. They do **not** have to say 收尾 / wrap up / log this. You file when the work is real, before you stop — closing the tab does not run this Skill. Cursor memories stay. They do not paste chats, tokens, or CLI. They search via you or log in to download originals. "Don't log" skips that sweep.

## 3. During the session

`cm_search` / `cm_show` / `cm_ambient` while working. Hold half-finished thoughts. **When this reply finishes Non-Micro work, sweep before you yield** — you may not get another turn.

Corpus: `cm_search` (`q`, `tags`, `type` — REFERENCE). L0 snippet → L1 `cm_show` the card. Attach files are not in FTS. If the human asks to **see the original**, tell them Dashboard Download Original — **do not** load the file into this chat. Never store secrets.

New literature: **`cm_keep`** (MCP signs + PUT when `r2`) → read from the card / a human-opened file → write cards. Cursor memories are not the literature store.

## 4. Sweep (Non-Micro) = one batch, as soon as the work exists

Do **not** wait for 收尾, close, wrap up, "log this", session end, or a later message. Runtime hooks (`sessionEnd`) are a backup and often never fire. Closing the agent does not run this file.

Human says don't log → skip. MCP missing or librarian down: skip, say once.

**Shelf first — never Inbox.** Ambient `libraries=` may still list `unclassified`; skip it. Pick:

1. cwd linked, or `corpus=<slug>` → that shelf
2. work belongs in an existing named shelf on that list → that id
3. none fit → account key: `cm_library` `{id}` (slug like `my-project`) then file there. Pairing key, or `cm_library` missing: send the authenticate link (step 0.2 — `centricmem connect --device`, only the printed `/connect?device=` URL) so they can enter a key on that page (default to mint/manage every shelf, or that shelf’s pairing key); **hold the sweep in agent memory**. Do not write `unclassified`.

Then, with `shelf=` / `library=` that id:

1. **Transcript → R2.** Cursor: `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl` for **this** chat. Shell-read the file; **never paste jsonl**. `cm_keep` with that filename + file bytes (never `path=`). Leave the local jsonl in place (do not delete Cursor chat state).
2. Then `cm_note` `cm_log_decision` `cm_done` with `attach` = that keep pointer. **One sweep, one batch.** If they keep talking, another sweep is OK for **new** facts — do not re-file the same decision.

Existing Inbox leftovers: `cm_inbox`; `apply=true` high-confidence; remaining `cm_classify` into an existing named shelf, or `cm_library` then classify. Do not leave leftovers for the human. If this key cannot see Inbox, say once.
