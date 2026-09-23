# MiMoCode

MiMoCode (`mimo`, Xiaomi's OpenCode fork) has a real plugin lifecycle, so this host gets ambient
context at session start, a deterministic sweep reminder after a turn, and shelf context that
survives compaction.

## What the hooks say (read out of the binary, then confirmed at runtime)

MiMoCode 0.1.15 keeps the OpenCode plugin API - the import is `@opencode-ai/plugin` (npm 1.18.32);
there is **no** `@mimocode/plugin` package - and wraps every turn with `session.pre` / `session.post`.

| Hook | Input | Output | Note |
| --- | --- | --- | --- |
| `chat.message` | `{sessionID, agent, model, messageID, variant}` | `{message, parts}` | `parts` is mutable - **the injection point** |
| `session.pre` | `{sessionID, agentID}` | `{}` | Setting `cancel` **aborts the session**. Never set it. Fires once per **turn**, not per session. |
| `chat.params` | `{sessionID, agent, model, provider}` | - | full model metadata |
| `tool.execute.after` | `{tool, ...}` | - | used here to stamp a `cm_*` call |
| `session.post` | `{sessionID, agentID, outcome, error, assistantMessageID, trajectory}` | `{}` | **observation-only** |
| `experimental.session.compacting` | `{sessionID}` | `{context[], prompt?}` | `prompt` replaces the compaction prompt outright |
| `experimental.chat.messages.transform` | `{messages}` | - | mutable outgoing messages |

Events seen firing: `session.created`, `session.updated`, `session.status`, `session.diff`,
`session.idle`, `session.error`, `message.updated`, `message.part.updated`, `actor.registered`,
`metrics.agent_request`, `tui.instructions.loaded`.

### Three constraints that shape this plugin

**A part must be a whole part.** `output.parts` is not a loose bag - MiMoCode runs
`AD.Part.safeParse` over every element and then persists each one with `updatePart`:

```js
r.trigger("chat.message", { sessionID, agent, model, messageID, variant }, { message: Xw, parts: G0 })
G0.forEach((Th, Gy) => { let Y3 = AD.Part.safeParse(Th); if (!Y3.success) log("invalid user part before save", {...}) })
yield* f.updateMessage(Xw)
for (let Th of G0) yield* f.updatePart(Th)
```

Pushing `{type: "text", text}` aborts the turn with
`error: SyncEvent.run: "sessionID" required but not found`. A part needs at least
`id`, `type`, `text`, `sessionID` and `messageID`.

**There is no force-another-turn hook.** `session.post` receives an empty output object, so a plugin
cannot reopen the turn that just ended. This one queues the reminder and appends it to the *next*
outgoing message through `chat.message` - deterministic for the user's next turn, never blocking.

**File hooks are hard-limited.** From the loader in the shipped binary:

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
  session. Read there rather than in `session.pre` because `chat.message` runs first.
- **Remind** - `tool.execute.after` stamps a file under `os.tmpdir()` when a `cm_*` tool actually
  ran. A turn that completes with no stamp queues a sweep reminder for the next message.
- **Compaction** - `experimental.session.compacting` pushes the shelf text into `output.context` so it
  survives compaction instead of being summarised away. When nothing is available it says so, rather
  than injecting nothing quietly.
- **Close (optional L3)** - with `CENTRICMEM_HOOK_L3=1`, the first completed turn of a session with no
  `cm_*` stamp runs one `centricmem done`. **Off by default.** Read the next section before turning
  it on.

## The close half does not work on a guest host

Running the exact command this plugin spawns, on a machine that is a guest of the librarian:

```
$ centricmem done "..." --tags hook-l3,session-sweep -p host
Guest of https://mem.centricmem.com: this command cannot write the leftover hub (CENTRICMEM_HOME).
For CLI import/index set CENTRICMEM_TOKEN (or claim so a local mcp.json has Bearer) and retry, or use
cm_import on host MCP. Operators write on the librarian host.
```

That refusal is **by design, and correct** - it is the guard behind *never CLI-write a leftover hub*.
On the test machine `CENTRICMEM_TOKEN` was set (user scope, 64 chars), `CENTRICMEM_API_KEY` was set,
and unsetting `CENTRICMEM_HOME` changed nothing: the CLI still refused. The guest check does not hinge
on that variable. Since the baseline contract is *agents talk to the hosted librarian only through
host MCP*, the close cannot reasonably be a CLI spawn on a guest at all.

So the close is opt-in, it pre-checks for `CENTRICMEM_TOKEN` / `CENTRICMEM_API_KEY` and skips
silently without one, and it attempts **at most once per session** whatever the outcome - because the
spawn is a real Node process and retrying every turn to be told no is a waste. On a guest, the
working path for the same job is simply the `cm_*` tools over MCP, which is what the reminder half
already drives the model to do.

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

A trace under mimocode 0.1.15 on Windows, `deepseek/deepseek-flash`, cache seeded:

```
new session ses_ffe5f2fdbd0d4ffeSPwE97HkgV
ambient queued chars=54
chat.message queued=1
chat.message injected=1
session.pre ses_ffe5f2fdbd0d4ffeSPwE97HkgV
session.post outcome=completed
```

- The plugin loads from `~/.config/mimocode/plugins/`, and a probe plugin that logged every trigger
  proved the mechanism: `session.pre`, `chat.message`, `chat.params`, `session.post`,
  `experimental.chat.messages.transform` and the events all fire.
- Ambient reaches the **first** outgoing message. An earlier version queued it from `session.pre` and
  the trace read `chat.message queued=0` then `session.pre queued ambient chars=54` - `chat.message`
  runs **before** `session.pre`, so the ambient was a turn late.
- A turn now runs to `outcome: "completed"` with an injected part present, and the reminder is queued
  from `session.post`.

## Not verified

- **The close has never succeeded.** See above: a guest host refuses the CLI write, so `session.post
  sweep status=1` is as far as it has been observed. The MCP alternative has not been implemented.
- **`experimental.session.compacting` has never fired.** `compaction.max_context` was set to `"1K"`
  and confirmed present in `mimo debug config`, then four turns were run into one session with
  `mimo run -c`; `compacting` never appeared in the trace. Each `mimo run` is its own process, so no
  single process ever accumulated enough context to overflow. Verify this one inside a real
  long-running TUI session instead.
- The name MiMoCode gives an MCP tool (`cm_note` vs `centricmem_cm_note`). The stamp matches either,
  and any name containing `centricmem`.

## Notes

- Plugin init runs **twice** per process - once bound to the global project, once to the real working
  directory.
- `tui.instructions.loaded` reports `files: ["Users\\zeyu\\CLAUDE.md"]`, so MiMoCode discovers
  `CLAUDE.md` from the home directory. That is where an L1 text snippet would land.
- Both shipped MiMo routes are dead without authentication: `xiaomi/mimo-v2.5` answers
  `401 Invalid API Key` and `mimo/mimo-auto` answers `MiMo free API service has ended`. Configure a
  provider before expecting MiMoCode to do anything at all. Configuring one catalog provider is
  enough - the provider then appears in `mimo models`.
