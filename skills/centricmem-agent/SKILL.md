---
name: centricmem-agent
version: 0.21.8
compatible_cli: ">=0.21.0"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: Manager layer over the agent's own memory. HTTP to the CentricMem librarian. Ambient at start. After install, tell the human how they use it. At close, keep this chat's transcript on R2 then file units. Never CLI-write a hub. If the librarian is down, say once and continue.
---

# CentricMem Agent Skill v0.21.8

CentricMem is the **manager layer** (organise / retrieve / cross-agent store) **and** the literature database. Session capture stays in the agent's own memory (Cursor memories and other plugins). Do not uninstall those. Do not write back into them. New literature: keep the original, read it, write Markdown cards. A unit is Identity / Details / Tags / Body ([REFERENCE.md](REFERENCE.md)). Isolation is **one library = its pairing keys**. Tags stay about. The librarian is the only writer.

## 0. Reach the librarian

1. **URL:** `CENTRICMEM_URL` if set. Else `origin` in `%APPDATA%/centricmem/libraries.json` (or `$XDG_CONFIG_HOME/centricmem/libraries.json`). Hosted origin: `https://mem.centricmem.com`. Loopback only if this machine **is** the librarian.
2. **Token:** catalog row for cwd / `CENTRICMEM_PROJECT`, or `CENTRICMEM_TOKEN`. Bearer selects the library.
3. `GET {url}/health` with `Authorization: Bearer <token>`. Same origin for `/ambient` `/search` `/show` `/note` `/log-decision` `/keep` `/keep/sign` `/done` `/import` `/classify` `/index`. `/show` is the Markdown **card**. Never `/show?original=` and never paste `/download?original=1`. Sandbox: host MCP (`centricmem-host`); pass `library=`. `health.r2=true` means originals sit in object storage.
4. **HTTP only.** Never CLI `note`/`keep`/`done` as fallback. Never `setup --bootstrap`. Never create a hub in the git checkout. 401: say once, keep working in the agent's own memory.
5. Attach more libraries like workspaces. Corpus = **that** library's token. If `ACADEMIC.md` exists next to this file, follow it.

## 1. Classify

| Skip (Micro) | Sweep at close (Non-Micro) |
|---|---|
| Typo, one-liner, trivial syntax | Implement, ops, research, architecture, corpus lookup |
| | Same thread ≥3 turns **or** a host / infra / product-boundary fact |

## 2. Start

HTTP `/ambient`. Ignore a stale `.ambient.md`. Unreachable or `state=UNINITIALIZED`: **say once** — do not bootstrap. Writes follow cwd's linked library, or Inbox if `cwd_project=(unlinked)`. `corpus=<slug>` → that library's token. Hosted `/ambient` does **not** tell you whether *your* Skill is outdated (that check is the librarian's hub copy). This file is `~/.cursor/skills/centricmem-agent/SKILL.md` (also `~/.codex/skills` and `~/.agents/skills`). If *this* file is old, tell the human: `npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g`.

**Once after Skill install / first ambient this chat:** tell the human how they use CentricMem (their language). They keep talking here. Cursor memories stay. They do not paste chats, tokens, or CLI. After real work you file a session card and **upload this thread's transcript file to R2**; they search via you or log in at the site to download originals. "Don't log" skips that close.

## 3. During the session

Search / show / ambient only. **Do not** `note` / `keep` / `done` when knowledge appears. Hold it in the agent's own memory.

Corpus retrieve: `GET /search` (`filter`, `tag` — REFERENCE). L0 snippet → L1 `show` the card. Attach files are not in FTS. If the human asks to **see the original**, tell them Dashboard Download Original — **do not** load the file into this chat. Never store secrets.

New literature: **POST `/keep`** (R2 sign+PUT when `r2`) → read from the card / a human-opened file → write cards. Cursor memories are not the literature store.

## 4. Close (Non-Micro) = one sweep

When the human stops (or corpus `cards-written`). Human says don't log → skip. Librarian down: skip, say once.

1. **Transcript → R2.** Cursor: `~/.cursor/projects/<workspace>/agent-transcripts/<uuid>/<uuid>.jsonl` for **this** chat. Shell-read the file; **never paste jsonl**. `health.r2`: `POST /keep/sign` → **PUT bytes** to `putUrl` (returned `headers`) → `POST /keep` `{uploadId}`. Do **not** send `path=`. R2 off / 503: `POST /keep` filename+bytes. Leave the local jsonl in place (do not delete Cursor chat state).
2. Then `/note` `/log-decision` `/done` with `attach` = that keep pointer. **One close, one batch.**

`inbox=N`: list; `--apply` only high-confidence. Leftovers: human `classify`.
