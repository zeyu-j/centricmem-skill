# MiMoCode

MiMoCode (`mimo`, Xiaomi's OpenCode fork) has a real plugin lifecycle, so this host gets all three
halves: ambient context at session start, a deterministic sweep reminder after a turn, and shelf
context that survives compaction.

## What the hooks say (read out of the binary, then confirmed at runtime)

MiMoCode 0.1.15 keeps the OpenCode plugin API - the import is `@opencode-ai/plugin` (npm 1.18.32);
there is **no** `@mimocode/plugin` package - and wraps every turn with `session.pre` / `session.post`.

| Hook | Input | Output | Note |
| --- | --- | --- | --- |
| `chat.message` | `{sessionID}` | `{message, parts}` | `parts` is mutable - **the injection point** |
| `session.pre` | `{sessionID, agentID}` | `{}` | Setting `cancel` **aborts the session**. Never set it. Fires once per **turn**, not per session. |
| `chat.params` | `{sessionID, agent, model, provider}` | - | full model metadata |
| `tool.execute.after` | `{tool, ...}` | - | used here to stamp a `cm_*` call |
| `session.post` | `{sessionID, agentID, outcome, error, assistantMessageID, trajectory}` | `{}` | **observation-only** |
| `experimental.session.compacting` | `{sessionID}` | `{context[], prompt?}` | `prompt` replaces the compaction prompt outright |
| `experimental.chat.messages.transform` | `{messages}` | - | mutable outgoing messages |

Events seen firing: `session.created`, `session.updated`, `session.status`, `session.diff`,
`session.idle`, `session.error`, `message.updated`, `message.part.updated`, `actor.registered`,
`metrics.agent_request`, `tui.instructions.loaded`.

### Two constraints that shape this plugin

**There is no force-another-turn hook.** `session.post` receives an empty output object, so a plugin
cannot reopen the turn that just ended. This one queues the reminder and appends it to the *next*
outgoing message through `chat.message` - deterministic for the user's next turn, never blocking.

**File hooks are hard-limited.** Reading the loader out of the shipped binary:

```js
K = 5000, V = 3, H = new Map()            // timeout, failure budget, per-hook counter
w = structuredClone(M)                    // snapshot the output object
await Promise.race([ hook(N, M), timeout(5000, "hook timed out after 5000ms") ])
catch -> Object.assign(M, w)              // output rolled back
         H.set(D, count + 1)              // 3 failures -> "hook circuit-breaker open, skipping"
```

Every file hook runs under a **5000ms timeout**, its output is **rolled back on failure**, and after
**3 failures that hook is skipped for the life of the process**. A network call inside a hook is
therefore not merely slow - it can permanently disable the hook. So no hook here touches the network:
the plugin reads a **cache file** that `refresh-ambient.mjs` writes out of band.

## Install

```
~/.config/mimocode/plugins/centricmem.ts      <-  mimocode/centricmem.ts
mimocode/refresh-ambient.mjs                  <-  run from a checkout; it imports the shared
                                                  ../tools/ambient.mjs
```

Only the one plugin file goes into the config directory - it is deliberately self-contained, with no
imports beyond Node builtins, so nothing relative has to resolve. A project-local
`.mimocode/plugins/` works the same way. Restart MiMoCode; plugins are read from the directory, so
nothing needs to appear in `mimocode.jsonc`.

Seed the ambient cache:

```sh
node refresh-ambient.mjs        # writes ~/.config/mimocode/centricmem-ambient.md
```

Run that on a schedule (Task Scheduler, a shell profile, or by hand). With no cache file the plugin
injects nothing and says nothing - it does not stall a session trying to fetch one.

## What it does

- **Ambient** - `chat.message` reads the cache and appends it to the outgoing message, once per
  session. Read there rather than in `session.pre` because of the ordering below.
- **Remind** - `tool.execute.after` stamps a file under `os.tmpdir()` when a `cm_*` tool actually
  ran. A turn that completes with no stamp queues a sweep reminder for the next message.
- **Compaction** - `experimental.session.compacting` pushes the shelf text into `output.context` so it
  survives compaction instead of being summarised away. When nothing is available it says so, rather
  than injecting nothing quietly.
- **Close (optional L3)** - with `CENTRICMEM_HOOK_L3=1`, a completed turn with no `cm_*` stamp runs
  one `centricmem done`, at most once per session. **Off by default**: `session.post` fires on
  *every* turn, and filing on every turn would flood the shelf.

## Env

| Var | Effect |
| --- | --- |
| `CENTRICMEM_HOOK_DISABLE=1` | no-op |
| `CENTRICMEM_HOOK_DRY_RUN=1` | log the close, write nothing |
| `CENTRICMEM_DONT_LOG=1` | skip the close half |
| `CENTRICMEM_HOOK_L3=1` | enable the auto-file close |
| `CENTRICMEM_HOOK_SHELF=<id>` | shelf for `done` (else `CENTRICMEM_PROJECT`) |
| `CENTRICMEM_HOOK_TRACE=1` | append every hook call to `%TEMP%/centricmem-mimocode-trace.log` |
| `CENTRICMEM_AMBIENT_FILE=<path>` | cache location (default `~/.config/mimocode/centricmem-ambient.md`) |
| `CENTRICMEM_AMBIENT_MAX_AGE_HOURS=<n>` | treat a stale cache as absent (default 24) |
| `CENTRICMEM_BIN=<path>` | CLI to spawn for the close |

## Verified

A trace from `CENTRICMEM_HOOK_TRACE=1` under mimocode 0.1.15 on Windows, with the cache seeded:

```
new session ses_ffe5f2fe48471fferMmmiMdCQr
ambient queued chars=54
chat.message queued=1
chat.message injected=1
```

- The plugin loads from `~/.config/mimocode/plugins/` (`INFO service=plugin path=... loading plugin`),
  and the hook mechanism itself was proven earlier by a probe plugin that logged every trigger:
  `session.pre`, `chat.message`, `chat.params`, `session.post`,
  `experimental.chat.messages.transform` and the events all fired.
- Ambient reaches the **first** outgoing message. The first version queued it from `session.pre` and
  the trace showed `chat.message queued=0` followed by `session.pre queued ambient chars=54` -
  `chat.message` runs **before** `session.pre` on the first turn, so the ambient was one turn late.
  Reading the cache from `chat.message` fixed it.
- Hook names and signatures above are present in the shipped binary and were matched against live
  payloads.

## Not verified

- **The close has never run to completion.** The MiMo free tier has since ended - every turn now dies
  with `error: MiMo free API service has ended. Sign in or configure a third-party API.` - so a
  session that reaches `outcome: "completed"` and exercises the L3 path was not observed. Until
  someone authenticates and watches `session.post` with `CENTRICMEM_HOOK_L3=1`, treat the close as
  written-to-contract but unexercised.
- The name MiMoCode gives an MCP tool (`cm_note` vs `centricmem_cm_note`). The stamp matches either,
  and any name containing `centricmem`.
- `experimental.session.compacting` is present in the binary with the signature quoted above, but no
  compaction was triggered, so the injection is unexercised.

## Notes

- Plugin init runs **twice** per process - once bound to the global project, once to the real working
  directory.
- `tui.instructions.loaded` reports `files: ["Users\\zeyu\\CLAUDE.md"]`, so MiMoCode discovers
  `CLAUDE.md` from the home directory. That is where an L1 text snippet would land.
- Both shipped model routes are dead without authentication: `xiaomi/mimo-v2.5` answers
  `401 Invalid API Key` and `mimo/mimo-auto` answers `MiMo free API service has ended`. An earlier
  note here claimed the free route still worked - it does not. Sign in or configure a provider before
  expecting MiMoCode to do anything at all.
