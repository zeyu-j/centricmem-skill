# Hermes

Hermes takes shell hooks from its profile `config.yaml`, pipes a JSON payload to the script's stdin, and reads
stdout back. `pre_llm_call` is the event whose output is injected into the next turn, which makes it the place
for the shelf's context; `on_session_end` observes, so the close just runs.

## Where Hermes actually looks

Hermes resolves its home as `HERMES_HOME` → the platform default — which on Windows is `%LOCALAPPDATA%\hermes`
and on macOS/Linux is `~/.hermes`. On this machine only the first is real: a `~/.hermes/config.yaml` is
silently ignored, while `%LOCALAPPDATA%\hermes\config.yaml` (123 KB, 25 top-level keys) is the config the CLI,
the desktop app and the dashboard all read. `hermes hooks list` prints the file it loaded, so check rather than
assume.

## Wire it up

Put this folder's `ambient-hook.mjs` at `<HERMES_HOME>/agent-hooks/centricmem-hook.mjs`, then add to
`<HERMES_HOME>/config.yaml`:

```yaml
hooks:
  pre_llm_call:
    - command: "node C:/Users/zeyu/.hermes/agent-hooks/centricmem-hook.mjs"
      timeout: 20
  on_session_end:
    - command: "node C:/Users/zeyu/.hermes/agent-hooks/centricmem-hook.mjs"
      timeout: 30
```

Use your own absolute path: Hermes splits the command with `shlex.split` and runs it with `shell=False`, so a
`~` in the path is **taken literally** instead of expanded.

## Say it in JSON

The reply is read back as JSON, and exactly one shape counts:

```jsonc
{"context": "…"}   // injected into the next turn's user message (pre_llm_call)
{}                 // nothing to say
```

`agent/shell_hooks.py` parses stdout through `_parse_context`, which reads a single `context` string and
discards anything that is not a JSON object. A bare string of ambient text is dropped with
`parsed: <none — hook contributed nothing to the dispatcher>` and never reaches the model, so this hook writes
`{"context": …}` and nothing else. `on_session_end` is an observer — it returns nothing, and its empty stdout
is expected.

## Consent: an unapproved hook never fires

Hermes prompts once per `(event, command)` pair on first use and records the answer in
`<HERMES_HOME>/shell-hooks-allowlist.json`, keyed on the exact command string rather than the script's hash. A
non-TTY run (desktop app, gateway, cron) cannot answer that prompt, so a freshly added hook sits registered but
inert — `hermes hooks doctor` reports it as `✗ not allowlisted — hook will NOT fire at runtime` — until one of
these is true:

1. `hermes --accept-hooks chat` (any session command with the flag)
2. `HERMES_ACCEPT_HOOKS=1` in the environment
3. `hooks_auto_accept: true` in `config.yaml` — this trusts every hook, so prefer 1 or 2
4. an entry in `<HERMES_HOME>/shell-hooks-allowlist.json`:

```json
{ "approvals": [ { "event": "pre_llm_call", "command": "node C:/Users/zeyu/.hermes/agent-hooks/centricmem-hook.mjs" } ] }
```

## Check it before you rely on it

```bash
hermes hooks list
hermes hooks doctor
hermes hooks test pre_llm_call --payload-file payload.json
```

Write `payload.json` as UTF-8 **without a BOM** — `{"hook_event_name": "pre_llm_call", "session_id": "…"}`.
PowerShell's `Set-Content` adds one and Hermes aborts with `Unexpected UTF-8 BOM (decode using utf-8-sig)`.
Firing the hook synthetically is enough to prove the wiring: no session needed. Verified on Hermes Agent
v0.21.4 (2026.9.21):

```
[pre_llm_call] node C:/Users/zeyu/.hermes/agent-hooks/centricmem-hook.mjs
    ✓ script exists and is executable
    ✓ allowlisted (approved …)
    ✓ produced valid JSON on synthetic payload (exit=0, 0.109s)
[on_session_end] node C:/Users/zeyu/.hermes/agent-hooks/centricmem-hook.mjs
    ✓ ran clean with empty stdout (exit=0, 0.094s) — hook is observer-only
```

`hooks test` also prints the `parsed (Hermes wire shape)`, which is where the `{"context": …}` above was
confirmed.

## What it does, and what it refuses to do

- **Injects the shelf's context** on `pre_llm_call`, cached for a minute. It fires on the hot path, and the
  shelf does not change fast enough to justify a request per turn. The fetch is the shared
  `tools/ambient.mjs` one every other host uses - it is what resolves the shelf and sets the `User-Agent` the
  librarian's edge rule expects - and the shelf is part of the cache key, so switching shelves is never served
  the previous one's context.
- **Files the session** on `on_session_end` by way of `centricmem log-session --auto` — the same call the
  Cursor, Claude Code and Codex hooks make. That command writes on a librarian host: on a machine talking to a
  hosted librarian it stops, so the close is silent there and the agent files the card. Same boundary as
  everywhere else, and it is deliberate rather than a fault.
- **Stays quiet with no credential.** No key means no context, not a guess.
- **Never fails loudly.** A hook that exits non-zero can disturb somebody's session, so every path ends in
  exit 0.
