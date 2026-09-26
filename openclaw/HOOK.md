---
name: centricmem-ambient
description: "Print this shelf's context before an agent answers, using the CentricMem librarian. Silent when no credential is present."
metadata:
  "openclaw":
    emoji: "🧠"
    events: ["session"]
    requires:
      bins: ["node"]
---

# centricmem-ambient

Puts the shelf's ambient context in front of the model at the start of a session, so a session begins
oriented instead of asking what it already knows. It is the OpenClaw counterpart of the Claude Code plugin
hook and of the goose MOIM refresher: the same `/ambient` endpoint, the same rules.

The rules, all learned from the two implementations that came before this one:

- **Never fail.** Every path exits 0. A hook that exits non-zero can break somebody else's session, and a
  network problem must only ever mean a quieter session.
- **Never guess a credential.** It reads the shared `tools/ambient.mjs` lookup: `CENTRICMEM_TOKEN`,
  `CENTRICMEM_AGENT_KEY`, `CENTRICMEM_API_KEY`, then the Bearer a host already recorded for `centricmem` in
  `~/.cursor/mcp.json`, `~/.claude.json` or `~/.codex/config.toml`, and last an `api.json` beside the user's
  config. It prints nothing when it finds none - the normal case on an OAuth-connected host, where no
  copyable key exists.
- **Never print the wrong thing.** The endpoint answers `{ok, state, text, ...}`; the hook prints `text`.

Set `CENTRICMEM_SHELF` to name a shelf, otherwise it uses the library recorded in `api.json`. Set
`CENTRICMEM_URL` to point at a self-hosted librarian; the default is https://mem.centricmem.com.

The handler is a small Node script with no dependencies. Here is the whole of what it does:

```js
const tok = token();                       // env, then api.json
if (!tok) return;                          // silent: no credential is a normal state
const body = await fetchAmbient(tok, shelf());
if (!body) return;                         // unreachable or refused: say nothing rather than something wrong
process.stdout.write(text(body).slice(0, 8000) + "\n");
```
