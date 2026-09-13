---
name: centricmem-agent
description: "Organises and retrieves Markdown memory on the hosted CentricMem librarian via host MCP (search, notes, decisions, transcripts). Use when starting a session, filing Non-Micro work, searching project memory, connecting an agent key, or refreshing this Skill. After Skill install this turn, if cm_* are missing that same reply must send https://centricmem.com/login?signup=1 and a /connect?device= URL — plugin mcp.json is not a completed connect. OAuth-capable clients may also add https://mem.centricmem.com/mcp with no Bearer and finish the browser prompt. Tell them to save a backup of the key (it appears only once). Every card needs a summary and key points in the body. Named shelves only, never curl librarian HTTP, never paste keys in chat."
license: PolyForm-Noncommercial-1.0.0
compatibility: "Requires host MCP at https://mem.centricmem.com/mcp. CLI >=0.21.36: every card is summary + key points (a keep stub is not a card); a folder is cm_keep card:false then cm_import items. Archive zip is optional. share: shelf ids; cm_move selected cards; cm_delete {file,shelf} a card; cm_rename {file,shelf,title} a card."
metadata:
  version: "0.21.60"
  compatible_cli: ">=0.21.36"
  changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
---

# CentricMem Agent Skill v0.21.60

This file is the handover (when / loop / recipes). Host MCP tool schemas are the live contract. Client connect branches, grants, bulk import, 1Password: [REFERENCE.md](REFERENCE.md).

Glossary: **Library** (one per person) → **Shelf** (`shelf=` / `library=`) → **Card** (Markdown: **summary** + **key points**, Identity / Details / Tags). No Inbox. Do not mint `unclassified`.

CentricMem is the **manager layer** (organise / retrieve / cross-agent store) **and** the literature database. Session capture stays in the agent's own memory. Do not uninstall those. Do not write back. Isolation is **one key = its grants**. Default (`*` = every shelf plus `share:`): search, sweep, `cm_library`, `cm_copy`, `cm_move`, `cm_delete` leftover shelves **or** `{file, shelf}` a card, `cm_rename` `{file, shelf, title}` a card, mint extras. Extra keys: granted shelves; may `cm_copy` if both grants; cannot `cm_move` / `cm_delete` / `cm_rename`; no invited `share:`. Pass `shelf=` / `library=` / `cwd=`. Tags stay about. The librarian is the only writer. Login uniquely owns billing, rotating the default key, and deleting the account. Attachments are metered; Markdown is unlimited. Humans rename labels and titles on `/app`.

## When to Use

- Starting a session, searching memory, or filing Non-Micro work
- Connecting an agent key or refreshing this Skill (`cm_*` missing)
- Empty shelf: offer existing durable memories as cards (once)
- Deleting one card or renaming a card title (default key or login)

## 0. Reach the librarian

1. **MCP only.** Same `cm_*` tools at `https://mem.centricmem.com/mcp` (Bearer: default or extra key): `cm_health` `cm_ambient` `cm_doctor` `cm_search` `cm_show` `cm_note` `cm_log_decision` `cm_done` `cm_keep` `cm_library` `cm_copy` `cm_move` `cm_delete` `cm_rename` `cm_import` `cm_index`. Never curl librarian HTTP. Never CLI `note`/`keep`/`done`. Never `setup --bootstrap`. Never create a hub in the git checkout.
2. If those tools are **missing**, or this extra key cannot see every shelf the owner needs: **connect them this turn**. Never paste keys. Never one-click install. Never copy JSON into chat. Do not invent a hub.
   **This same reply** must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL (never a bare `/connect`) **and** tell them to **save a backup** of the key — Keys shows it **only once**; never paste it here. Plugin `mcp.json` is **not a completed connect**. WorkBuddy/CodeBuddy: mint that connect URL this turn. **MCP OAuth (additive):** add `https://mem.centricmem.com/mcp` with no Bearer and finish the browser prompt (Cursor: Add to Cursor on https://centricmem.com; Codex: `codex mcp add centricmem --url https://mem.centricmem.com/mcp` then `codex mcp login centricmem` **and still send the connect URL unless cm_* already work**). Do not download a settings file that contains a key. Shell blocked (Grok): signup only; they paste Bearer in this agent's MCP settings. Shell works, `centricmem` missing: POST `https://mem.centricmem.com/connect/device` `{hostname}` once; send JSON `url`; keep `secret` off chat; they enter the key (ten minutes); poll then POST `/connect/device/<id>/claim`; write Bearer off-chat. Never print the token. **`centricmem` on PATH:** `centricmem connect --device`; send **only** the printed URL. Retry `cm_health`. New chat only if still 401. Guest `setup --install-skill` copies Skill files only. Vault MCP (including 1Password): REFERENCE — never reveal a key into this chat.
3. `cm_show` is the Markdown **card**. Never original=. Never paste `/download`. `cm_health` `grants=["*"]` is the default key. Pass `shelf=` / `library=` / `cwd=`. If `ACADEMIC.md` exists next to this file, follow it.

## 1. Classify

| Skip (Micro) | Sweep this turn (Non-Micro) |
|---|---|
| Typo, one-liner, trivial syntax, no durable fact | Implement, ops, research, architecture, corpus lookup, a product/host decision |
| | Same thread ≥2 real turns **or** one turn that shipped or decided something |

## 2. Start

`cm_health` then `cm_ambient`. Ignore a stale `.ambient.md`. Unreachable or `state=UNINITIALIZED`: **say once** — do not bootstrap. Writes need a **named shelf**. Unmatched cwd is not a shelf. `library=(none)` → pick from `libraries=` or mint (`cm_library`). Guests do not `--link`. `corpus=<slug>` → `library=` that slug. Ignore hub `skill_status=outdated`. Folder name is always `centricmem-agent` (Cursor, Hermes, Claude, Codex, Pi, OpenClaw, DSH, Kiro, Kilo, Copilot, CodeBuddy/WorkBuddy, Kimi, Agent Plugins `plugin.json` + `mcp.json`).

**Once this chat, after health/ambient:** if published `skill_latest` is newer than this file's `metadata.version`, refresh with `npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -y` (omit `-g` if no user-wide skills dir). Shell blocked: this client's plugin UI. **Tell the human** it is on disk; **this chat still uses the already-loaded Skill**. Never `setup --install-skill` for this refresh.

**Once after Skill install / first ambient:** if `cm_*` are missing, the **same reply** must connect them (step 0.2). **Which key (once)** after first `cm_health`: `grants=["*"]` = **default**; else name those ids — **extra**. Extra keys do not see `share:`. More/fewer shelves → they **tick grants** on **Keys**. Need every shelf → authenticate **default**. Never paste a key. Never change grants via `cm_*`. They do not have to say wrap up — you file when the work is real. If they pasted a key, they rotate it on Keys (new secret **only once**). "Don't log" skips that sweep.

**Empty shelf.** Ambient `Curate: empty` / `library=(none)`, or `cm_search` with `shelf=` lists only templates: **once**, offer **existing durable memories** as cards (REFERENCE). Capture stays.

## 3. During the session

`cm_search` / `cm_show` / `cm_ambient` while working. Hold half-finished thoughts. **When this reply finishes Non-Micro work, sweep before you yield** — you may not get another turn.

**Every card** needs a **summary** (`title`, and `cm_done` `summary=`) **and** **key points** in the body. Title-only / **keep stub** / empty headings is not a card. Attachments are not in FTS. Originals: Dashboard Download Original. Never store secrets.

A file they want remembered: **this turn** — `cm_keep` the original, then a card (`cm_note` / import `body`). A **folder**: `cm_keep` `{card:false}` then one `cm_import` `{items}`. Do not zip via MCP. Caps: `cm_health` `package`.

## 4. Sweep (Non-Micro) = one batch, as soon as the work exists

Do **not** wait for wrap up, session end, or a later message. **Closing the agent** does not run this file. Don't log / done with this Skill → skip.

MCP missing / librarian down / token failed: compose the sweep (named shelf, bodies, transcript path); persist **CentricMem deferred sweep** in this agent's memory (no secrets); connect once (step 0.2). File the hold when `cm_health` succeeds.

**Named shelf.** (1) cwd linked or `corpus=` (2) existing id on `libraries=` including `share:` as listed (3) none fit → default `cm_library` `{id}`; extra: authenticate default; hold the sweep. 403 `SHELF_LIMIT` / 400 `LIBRARY_REQUIRED`: existing named shelf. **Label:** leftover slug → `cm_library` `{id, displayName}` this turn. Writes still `shelf=<id>`.

Then, with `shelf=` / `library=` that id:

1. **Transcript → R2.** If this runtime wrote a local transcript for **this** chat, Shell-read it; never paste it. `cm_keep` filename + bytes (never `path=`). Leave the local file. Cursor: `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl`. No file → skip keep; still file note / decision / done.
2. Then `cm_note` `cm_log_decision` `cm_done` with `attach`. Each needs a **summary** and **key points** (`cm_done` uses `summary=`). **One sweep, one batch.**

Leftover Inbox / shelves / one card / title: `cm_copy` `{from,to}` then `cm_delete` `{id}`; `cm_move` `{from,to,files}`; `cm_delete` `{file, shelf}`; `cm_rename` `{file, shelf, title}` (`heading=` for `##`). Default key or login. Extra keys cannot delete/rename/move. Shared shelves cannot. Never download originals here. Details: REFERENCE Writes.

## Typical Workflows

**First connect.** `cm_*` missing → step 0.2 this same reply (signup + `/connect?device=` + save a backup). OAuth-capable also add the MCP URL with no Bearer. Retry `cm_health`. Vault MCP does not replace this.

**Daily.** `cm_health` → `cm_ambient` → search/show while working → when Non-Micro exists, named shelf + transcript keep + cards **before you yield**.

**Empty shelf → cards.** Offer once (REFERENCE Existing memory). They may skip. You file; capture stays.
