---
name: centricmem-agent
version: 0.21.6
compatible_cli: ">=0.21.0"
changelog_url: https://github.com/zeyu-j/centricmem-skill/blob/main/CHANGELOG.md
description: Manager layer over the agent's own memory. HTTP to the CentricMem librarian (named pairing keys). Ambient at start; file into the librarian only when organizing. Never CLI-write a hub, never setup --bootstrap. If the librarian is down, say once and continue.
---

# CentricMem Agent Skill v0.21.6

CentricMem is the **manager layer** (organise / retrieve / cross-agent store) **and** the literature database. Session capture stays in the agent's own memory (Cursor memories and other memory plugins). Do not uninstall those. Do not write back into them. New literature still goes here: keep the original, read it, write Markdown cards. A unit is Identity / Details / Tags / Body ([REFERENCE.md](REFERENCE.md)). Isolation is **one library = its pairing keys**. Tags stay about. The librarian process is the only writer.

## 0. Reach the librarian

1. **URL:** `CENTRICMEM_URL` if set. Else `origin` in `%APPDATA%/centricmem/libraries.json` (or `$XDG_CONFIG_HOME/centricmem/libraries.json`). Else loopback `http://127.0.0.1:<port>` from that catalog / `api.json`. Loopback is correct only when this machine **is** the librarian. Guests use the cloud origin.
2. **Token:** catalog row for cwd / `CENTRICMEM_PROJECT`, or `CENTRICMEM_TOKEN`. Bearer selects the library. Do not treat a leftover hub-wide `$CENTRICMEM_HOME/api.json` key as every library.
3. `GET {url}/health` with `Authorization: Bearer <token>`. Same origin for `/ambient` `/search` `/show` `/note` `/log-decision` `/keep` `/keep/sign` `/done` `/import` `/classify` `/index`. Cloud store: agents upload; humans download or delete. `/show` is the Markdown **card** (agent). Never `/show?original=` and never paste `/download?original=1` into the chat. Sandbox: host MCP (`centricmem-host`); pass `library=`. `health.r2=true` means originals sit in object storage.
4. **HTTP only.** Never CLI `note`/`keep`/`done` as fallback. Guest CLI **refuses** leftover-hub writes when `CENTRICMEM_URL` / catalog `origin` is set. Never `setup --bootstrap`. Never create a hub in the git checkout. 401 / refused: say once, keep working in the agent's own memory. Do not retry without a new key.
5. Attach more libraries like workspaces. Corpus = **that** library's token. One key cannot search another, even with `--all`.

## 1. Classify

| Skip (Micro) | Sweep at close (Non-Micro) |
|---|---|
| Typo, one-liner, trivial syntax | Implement, ops, research, architecture, corpus lookup |
| | Same thread ≥3 turns **or** a host / infra / product-boundary fact |

## 2. Start

HTTP `/ambient`. Ignore a stale `.ambient.md`. Unreachable or `state=UNINITIALIZED`: **say once** — do not bootstrap. Close writes follow cwd's linked library, or Inbox if `cwd_project=(unlinked)`. `corpus=<slug>` → attach that library's token.

## 3. During the session

Search / show / ambient only. **Do not** `note` / `keep` / `done` when knowledge appears. Hold it in the agent's own memory (Cursor memories, this transcript, other memory plugins). CentricMem is not the capture store.

Corpus retrieve: `GET /search` with that Bearer (`filter`, `tag` — REFERENCE). L0 snippet (nearby card text) → L1 `show` the Markdown unit. Cards are for the agent. Attach files are not in FTS. If the human asks to **see the original**, tell them to Download Original (dashboard) or save `/download?original=1` to a local path they named — **do not** load the file into this chat. Never store secrets.

New literature (same library, usually `corpus=`): **POST `/keep`** the original → read it in this chat from the card / human-opened file → write cards (`note` / ImportBundle / `imported/…` with YAML). That is the database path. Cursor memories are not the literature store.

## 4. Close (Non-Micro) = one sweep

When the human stops (or a corpus work is `cards-written`). Human says don't log → skip. Skip if nothing needs **filing into the librarian** (the agent's own memory already holds the session). File decisions, keep originals, and corpus cards that should be searchable across agents.

If `health.r2` is true: **POST `/keep/sign`** → **PUT** the file bytes to `putUrl` (send the returned `headers`) → **POST `/keep`** with `uploadId`. Do **not** send `path=`. If `r2` is false or `/keep/sign` is 503: POST `/keep` with filename + bytes (or multipart) for small files. Then `/note` `/log-decision` `/done` as needed — **one close, one batch**. Ledger ingest in the same chat waits for the human to stop.

`inbox=N`: list; `--apply` only high-confidence. Leftovers: human `classify`. Librarian down: skip close, say once.
