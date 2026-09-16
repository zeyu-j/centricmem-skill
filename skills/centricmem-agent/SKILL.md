---
name: centricmem-agent
description: "Organises and retrieves Markdown memory on the hosted CentricMem librarian (search, notes, decisions, transcripts). Use when starting a session, filing Non-Micro work, searching project memory, connecting an agent key, or refreshing this Skill."
license: PolyForm-Noncommercial-1.0.0
compatibility: "Requires host MCP at https://mem.centricmem.com/mcp. CLI >=0.21.50: every card is summary + key points (a keep stub is not a card); a folder is cm_keep card:false then cm_import items. Archive zip is optional. share: shelf ids; cm_move selected cards (whole paths, not lessons.md or #); cm_delete {file,shelf} a card (heading= for ##); cm_rename {file,shelf,title} a card. Omit cm_library id to list. Codex OAuth needs librarian >=0.21.51. OAuth key picker / ChatGPT Approve hop: librarian >=0.21.56. Applicant HTTPS callbacks: librarian >=0.21.55. skipExisting / copy-aside FTS skip need librarian >=0.21.50."
metadata:
  version: "0.21.73"
  compatible_cli: ">=0.21.50"
  changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
---

# CentricMem Agent Skill v0.21.73

This file is the handover (when / loop / recipes). Host MCP tool schemas are the live contract. Client connect branches, grants, bulk import, 1Password: [REFERENCE.md](REFERENCE.md).

Glossary: **Library** (one per person) → **Shelf** (`shelf=` / `library=`) → **Card** (Markdown: **summary** + **key points**, Identity / Details / Tags). No Inbox. Do not mint `unclassified`.

CentricMem is the **manager layer** (organise / retrieve / cross-agent store) **and** the literature database. Session capture stays in the agent's own memory. Do not uninstall those. Do not write back. Isolation is **one key = its grants**. Default (`*` = every shelf plus `share:`): search, sweep, `cm_library`, `cm_copy`, `cm_move`, `cm_delete` leftover shelves **or** `{file, shelf}` a card (`heading=` for `##`), `cm_rename` `{file, shelf, title}` a card, mint extras. Extra keys: granted shelves; may `cm_copy` if both grants; cannot `cm_move` / `cm_delete` / `cm_rename`; no invited `share:`. Pass `shelf=` / `library=` / `cwd=`. Tags stay about. The librarian is the only writer. Login uniquely owns billing, rotating the default key, and deleting the account. Attachments are metered; Markdown is unlimited. Humans rename labels and titles on `/app`.

## When to Use

- Starting a session, searching memory, or filing Non-Micro work
- Connecting an agent key or refreshing this Skill (`cm_*` missing)
- Plugin `mcp.json` / `mcp add` with no Bearer is first connect — this agent (and each client you install into) tries `/connect?device=` this turn
- Minting that URL failed — run `centricmem doctor connect` and they email zeyu@poppyg.com with that output (never a key); then OAuth if this agent will receive the browser login
- Skill on disk but they already have a Bearer or finished OAuth and `cm_*` still missing — new chat, do not strip Bearer
- Connect or usage still broken after that — they email zeyu@poppyg.com (never a key)
- Codex / ChatGPT still waiting after Approve — they click **Open the agent callback** on the authorize page (sign-in is not the grant; they pick which key then Approve)
- Agent callback URL is not allowed — they request it on https://centricmem.com/oauth/callbacks
- Empty shelf: offer existing durable memories as cards (once)
- Deleting one card or renaming a card title (default key or login)

## 0. Reach the librarian

1. **MCP only.** Same `cm_*` tools at `https://mem.centricmem.com/mcp` (Bearer: default or extra key): `cm_health` `cm_ambient` `cm_doctor` `cm_search` `cm_show` `cm_note` `cm_log_decision` `cm_done` `cm_keep` `cm_library` `cm_copy` `cm_move` `cm_delete` `cm_rename` `cm_import` `cm_index`. DSH names them `mcp__centricmem__cm_*` — call those. Never curl librarian HTTP. Never CLI `note`/`keep`/`done`. Never `setup --bootstrap`. Never create a hub in the git checkout.
2. If those tools are **missing**, or this extra key cannot see every shelf the owner needs: **connect them this turn**. Never paste keys. Never one-click install. Never copy JSON into chat. Do not invent a hub.
   **First connect** (no Bearer and no finished OAuth — URL-only MCP counts here): **this same reply** must send https://centricmem.com/login?signup=1 **and** try to send a `/connect?device=` URL (never a bare `/connect`) **and** tell them to **save a backup** of the key — Keys shows it **only once**; never paste it here. Plugin `mcp.json` is **not a completed connect**. **This agent** (and each client you install into) mints that URL this turn when it can — do not skip minting because OAuth or `mcp login` exists. If `centricmem` on PATH has no `connect --device`, ignore that leftover binary — do not npm-install. Shell works, `centricmem` missing: POST `https://mem.centricmem.com/connect/device` `{hostname}` once; send JSON `url`; keep `secret` off chat; they enter the key (ten minutes); poll then POST `/connect/device/<id>/claim`; write Bearer off-chat. Never print the token. **`centricmem` on PATH and `connect --device` exists:** prefer `centricmem connect --device --url-only` (print URL, exit) then later `centricmem connect --claim` (and `--target` for this host’s MCP file). Blocking `centricmem connect --device` is still valid. Send **only** the printed URL. **If minting that URL fails** (error, leftover CLI, blocked shell): run `centricmem doctor connect` and tell them to email zeyu@poppyg.com with that output (which agent; never a key or token). Do not send that mail for them. **Then MCP OAuth** only if this agent will receive the login after they finish a browser prompt: add `https://mem.centricmem.com/mcp` with no Bearer (Cursor: Add to Cursor on https://centricmem.com; Codex on this machine: `codex mcp add` then `codex mcp login`; Hermes: `hermes mcp add --url https://mem.centricmem.com/mcp --auth oauth centricmem`; cloud agents that can have them operate a browser this agent is waiting on — Grok Bot, Manus, Cursor Cloud, Claude). Do not send a Loopback `127.0.0.1` authorize link when this agent is not listening there. After a failed mint with no receivable browser login: they paste Bearer in this agent's MCP settings. Do not download a settings file that contains a key. Retry `cm_health`. New chat only if still 401. Guest `setup --install-skill` copies Skill files only. Vault MCP (including 1Password): REFERENCE — never reveal a key into this chat. If connect still fails this turn, or they have a usage problem this Skill cannot fix: tell them to email zeyu@poppyg.com (which agent + what they saw; never a key or token). Do not send that mail for them.
   **Already added** a Bearer or a finished OAuth login in this agent: do not mint `/connect?device=`. Do not tell them to add the URL with no Bearer (that drops the key). Ask for a **new chat** so this session loads MCP. URL-only plugin `mcp.json` or `codex mcp add` is **not** this branch. Still missing after a new chat → email zeyu@poppyg.com (never a key).
3. `cm_show` is the Markdown **card**. Never original=. Never paste `/download`. `cm_health` `grants=["*"]` is the default key. Pass `shelf=` / `library=` / `cwd=`. If `ACADEMIC.md` exists next to this file, follow it.

## 1. Classify

| Skip (Micro) | Sweep this turn (Non-Micro) |
|---|---|
| Typo, one-liner, trivial syntax, no durable fact | Implement, ops, research, architecture, corpus lookup, a product/host decision |
| | Same thread ≥2 real turns **or** one turn that shipped or decided something |

## 2. Start

`cm_health` then `cm_ambient`. Ignore a stale `.ambient.md`. Unreachable or `state=UNINITIALIZED`: **say once** — do not bootstrap. Writes need a **named shelf**. Unmatched cwd is not a shelf. `library=(none)` → pick from `libraries=` or list (`cm_library` omit `id`) then mint (`cm_library` `{id}`). Guests do not `--link`. `corpus=<slug>` → `library=` that slug. Ignore hub `skill_status=outdated`. Folder name is always `centricmem-agent` (Cursor, Hermes, Claude, Codex, Pi, OpenClaw, DSH, Kiro, Kilo, Copilot, CodeBuddy/WorkBuddy, Kimi, Agent Plugins `plugin.json` + `mcp.json`).

**Once this chat, after health/ambient:** if published `skill_latest` is newer than this file's `metadata.version`, refresh with `npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -y` (omit `-g` if no user-wide skills dir). DSH: copy into `$DSH_HOME/skills/centricmem-agent` (`dsh/copy-skill.mjs`); never `-g`. Shell blocked: this client's plugin UI. **Tell the human** it is on disk; **this chat still uses the already-loaded Skill**. Never `setup --install-skill` for this refresh.

**Once after Skill install / first ambient:** if `cm_*` are missing, the **same reply** must connect them (step 0.2). This agent (and each client you install into) tries `/connect?device=` first. If they already have a Bearer or finished OAuth, that is a new chat, not a first connect. URL-only MCP is first connect. **Which key (once)** after first `cm_health`: `grants=["*"]` = **default**; else name those ids — **extra**. Extra keys do not see `share:`. More/fewer shelves → they **tick grants** on **Keys**. Need every shelf → authenticate **default**. Never paste a key. Never change grants via `cm_*`. They do not have to say wrap up — you file when the work is real. If they pasted a key, they rotate it on Keys (new secret **only once**). "Don't log" skips that sweep.

**Empty shelf.** Ambient `Curate: empty` / `library=(none)`, or `cm_search` with `shelf=` lists only templates: **once**, offer **existing durable memories** as cards (REFERENCE). Capture stays.

## 3. During the session

`cm_search` / `cm_show` / `cm_ambient` while working. Hold half-finished thoughts. **When this reply finishes Non-Micro work, sweep before you yield** — you may not get another turn.

**Every card** needs a **summary** (`title`, and `cm_done` `summary=`) **and** **key points** in the body. Title-only / **keep stub** / empty headings is not a card. Attachments are not in FTS. Originals: Dashboard Download Original. Never store secrets.

A file they want remembered: **this turn** — `cm_keep` the original, then a card (`cm_note` / import `body`). A **folder**: `cm_keep` `{card:false}` then one `cm_import` `{items}`. Do not zip via MCP. Caps: `cm_health` `package`.

## 4. Sweep (Non-Micro) = one batch, as soon as the work exists

Do **not** wait for wrap up, session end, or a later message. **Closing the agent** does not run this file. Don't log / done with this Skill → skip.

MCP missing / librarian down / token failed: compose the sweep (named shelf, bodies, transcript path); persist **CentricMem deferred sweep** in this agent's memory (no secrets); connect once (step 0.2). If still failing, they email zeyu@poppyg.com (never a key). File the hold when `cm_health` succeeds.

**Named shelf (routing).** Fixed priority for every agent: (1) user explicit this turn — named shelf / `shelf=` / `corpus=` / already-linked project they own (2) match each shelf's charter (include / exclude / axis / aliases); until charter ships, match `displayName` + ambient `libraries=` topic (3) path (cwd / repo) only as a **tiebreak** among charter matches — never the primary key (4) mint only when the human is present and supplies the id/name. Forbidden: the agent's own folder as classifier, guessing a name, silent mint. Before writing, cite the charter line (or displayName/topic) you matched; if you cannot cite, ask. Extra key cannot mint — authenticate default; hold the sweep. 403 `SHELF_LIMIT` / 400 `LIBRARY_REQUIRED`: existing named shelf. **Label:** leftover slug → `cm_library` `{id, displayName}` this turn. Writes still `shelf=<id>`. Details: REFERENCE **Shelf routing**.

Then, with `shelf=` / `library=` that id:

1. **Transcript → R2.** If this runtime wrote a local plaintext transcript for **this** chat, Shell-read it; never paste it. `cm_keep` filename + bytes (never `path=`). Leave the local file. Cursor: `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl`. DSH `session.v3.jsonl.zstd` is not a keep source. No file → skip keep; still file note / decision / done.
2. Then `cm_note` `cm_log_decision` `cm_done` with `attach`. Each needs a **summary** and **key points** (`cm_done` uses `summary=`). **One sweep, one batch.**

Leftover Inbox / shelves / one card / title: `cm_copy` `{from,to}` then `cm_delete` `{id}`; `cm_move` `{from,to,files}` (whole Markdown paths only, not `lessons.md`, not `#`); `cm_delete` `{file, shelf}` (`heading=` for `##`); `cm_rename` `{file, shelf, title}` (`heading=` for `##`). Default key or login. Extra keys cannot delete/rename/move. Shared shelves cannot. Never download originals here. Details: REFERENCE Writes.

## Typical Workflows

**First connect.** `cm_*` missing and no Bearer / finished OAuth → step 0.2. This agent (and each client you install into) tries signup + `/connect?device=` + save a backup. URL-only plugin is first connect. If minting that URL fails → run `centricmem doctor connect` and they email zeyu@poppyg.com with that output (never a key); then OAuth only if this agent will receive the browser login (Grok Bot / Manus may; a Loopback `127.0.0.1` callback does not when this agent is not listening there). They already have a Bearer or finished OAuth → **new chat**, do not strip Bearer. DSH after Bearer overlay: **new chat** (catalog is frozen at boot). Retry `cm_health`. Still failing → they email zeyu@poppyg.com (never a key). Vault MCP does not replace this.

**Daily.** `cm_health` → `cm_ambient` → search/show while working → when Non-Micro exists, named shelf + transcript keep + cards **before you yield**.

**Empty shelf → cards.** Offer once (REFERENCE Existing memory). They may skip. You file; capture stays.
