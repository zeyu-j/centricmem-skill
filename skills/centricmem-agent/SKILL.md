---
name: centricmem-agent
version: 0.21.9
compatible_cli: ">=0.21.0"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: Manager layer over the agent's own memory. HTTP to the CentricMem librarian. Ambient at start. After install, tell the human how they use it. If this Skill is behind GitHub (or health.skill_latest), npx skills add once — this chat still uses the loaded text. File a sweep as soon as Non-Micro work exists; closing the agent does not run this Skill. Never CLI-write a hub.
---

# CentricMem Agent Skill v0.21.9

CentricMem is the **manager layer** (organise / retrieve / cross-agent store) **and** the literature database. Session capture stays in the agent's own memory (Cursor memories and other plugins). Do not uninstall those. Do not write back into them. New literature: keep the original, read it, write Markdown cards. A unit is Identity / Details / Tags / Body ([REFERENCE.md](REFERENCE.md)). Isolation is **one library = its pairing keys**. Tags stay about. The librarian is the only writer.

## 0. Reach the librarian

1. **URL:** `CENTRICMEM_URL` if set. Else `origin` in `%APPDATA%/centricmem/libraries.json` (or `$XDG_CONFIG_HOME/centricmem/libraries.json`). Hosted origin: `https://mem.centricmem.com`. Loopback only if this machine **is** the librarian.
2. **Token:** catalog row for cwd / `CENTRICMEM_PROJECT`, or `CENTRICMEM_TOKEN`. Bearer selects the library.
3. `GET {url}/health` with `Authorization: Bearer <token>`. Same origin for `/ambient` `/search` `/show` `/note` `/log-decision` `/keep` `/keep/sign` `/done` `/import` `/classify` `/index`. `/show` is the Markdown **card**. Never `/show?original=` and never paste `/download?original=1`. Sandbox: host MCP (`centricmem-host`); pass `library=`. `health.r2=true` means originals sit in object storage.
4. **HTTP only.** Never CLI `note`/`keep`/`done` as fallback. Never `setup --bootstrap`. Never create a hub in the git checkout. 401: say once, keep working in the agent's own memory.
5. Attach more libraries like workspaces. Corpus = **that** library's token. If `ACADEMIC.md` exists next to this file, follow it.

## 1. Classify

| Skip (Micro) | Sweep this turn (Non-Micro) |
|---|---|
| Typo, one-liner, trivial syntax, no durable fact | Implement, ops, research, architecture, corpus lookup, a product/host decision |
| | Same thread ≥2 real turns **or** one turn that shipped or decided something |

## 2. Start

HTTP `/health` then `/ambient`. Ignore a stale `.ambient.md`. Unreachable or `state=UNINITIALIZED`: **say once** — do not bootstrap. Writes follow cwd's linked library, or Inbox if `cwd_project=(unlinked)`. `corpus=<slug>` → that library's token. Never treat ambient **text** “Skill outdated” as truth (librarian hub copy). This file is `~/.cursor/skills/centricmem-agent/SKILL.md`.

**Once this chat, after health/ambient:** compare this file’s `version` to `skill_latest` on `/health` or `/ambient`. If that field is null, GET `https://raw.githubusercontent.com/zeyu-j/centricmem-skill/main/skills/centricmem-agent/SKILL.md` and parse `version`. If published is newer: `npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -g -y`. Tell the human it is on disk; **this chat still uses the already-loaded Skill**; the next chat uses the new one. If this file is newer, or fetch/npx fails: continue. Never `setup --install-skill` for this refresh.

**Once after Skill install / first ambient this chat:** tell the human how they use it (their language). They keep talking here. They do **not** have to say 收尾 / wrap up / log this. You file when the work is real, before you stop — closing the tab does not run this Skill. Cursor memories stay. They do not paste chats, tokens, or CLI. They search via you or log in to download originals. "Don't log" skips that sweep.

## 3. During the session

Search / show / ambient while working. Hold half-finished thoughts. **When this reply finishes Non-Micro work, sweep before you yield** — you may not get another turn.

Corpus retrieve: `GET /search` (`filter`, `tag` — REFERENCE). L0 snippet → L1 `show` the card. Attach files are not in FTS. If the human asks to **see the original**, tell them Dashboard Download Original — **do not** load the file into this chat. Never store secrets.

New literature: **POST `/keep`** (R2 sign+PUT when `r2`) → read from the card / a human-opened file → write cards. Cursor memories are not the literature store.

## 4. Sweep (Non-Micro) = one batch, as soon as the work exists

Do **not** wait for 收尾, close, wrap up, "log this", session end, or a later message. Runtime hooks (`sessionEnd`) are a backup and often never fire. Closing the agent does not run this file.

Human says don't log → skip. Librarian down: skip, say once.

1. **Transcript → R2.** Cursor: `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl` for **this** chat. Shell-read the file; **never paste jsonl**. `health.r2`: `POST /keep/sign` → **PUT bytes** to `putUrl` (returned `headers`) → `POST /keep` `{uploadId}`. Do **not** send `path=`. R2 off / 503: `POST /keep` filename+bytes. Leave the local jsonl in place (do not delete Cursor chat state).
2. Then `/note` `/log-decision` `/done` with `attach` = that keep pointer. **One sweep, one batch.** If they keep talking, another sweep is OK for **new** facts — do not re-file the same decision.

`inbox=N`: list; `--apply` only high-confidence. Leftovers: human `classify`.
