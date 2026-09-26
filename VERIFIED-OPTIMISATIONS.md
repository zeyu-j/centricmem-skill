# Verified optimisations

**Marks.** ✅ verified - we ran it and read the answer. ◐ same core as the CLI - the CLI was verified, this
wrapper was not exercised. 📄 documented - a convention, nothing claimed.

**One core, one test.** Where a product ships a CLI and a GUI or IDE, the core is tested once and the
wrapper is marked ◐: they read the same config, the same plugin registry, the same hooks (CodeBuddy Code and
WorkBuddy share one CLI; a desktop app and its bundled CLI share one plugin registry; the Hermes app and its
CLI share `config.yaml`). CLI evidence does not transfer for **browser and OAuth hops**, for **session-end
behaviour** (only a real session ends), or where a GUI ships **its own snapshot** of the core.

These were built on top of the installs in [VERIFIED-INSTALLS.md](./VERIFIED-INSTALLS.md), and the marks say
what was run here and what was only read.

| Host | What was added | Evidence |
| --- | --- | --- |
| **Claude Code** 2.1.280 | `hooks/hooks.json` - a SessionStart hook bundled in the plugin | `claude plugin details` reports `Hooks (1) SessionStart (harness-only - no model context cost)`; the hook script prints 496 characters with a credential and nothing without one |
| **Codex** 0.156.1 | the same `hooks/hooks.json` in the plugin, so SessionStart and SessionEnd both apply | Codex discovers hooks as `hooks.json` or inline `[hooks]` in `config.toml`, and installed plugins may bundle lifecycle config through their manifest or a default `hooks/hooks.json` - the file Claude reads. Its events include `SessionStart`, `SubagentStart`, `SessionEnd` (documented as running when the main thread ends, not for subagents), `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact` and `SubagentStop`. **Not exercised**: no Codex session was run, so this wiring follows its documentation rather than a run here |
| **Cursor** | both halves, by the client's own installer: `centricmem setup --install-hooks` | The only host with a first-class hook installer, and the only one here where both halves are wired. Its MCP connection was already configured. The hooks are real work rather than reminders: `sessionStart` runs `centricmem ambient --write`, and `sessionEnd` runs `centricmem log-session --auto` followed by a reindex, so a Cursor session refreshes its own context and files its own card. Verified by reading the installed files (`.cursor/hooks/hooks.json` in the code repository and `~/.cursor/hooks/hooks.json`). **Not exercised**: no Cursor session was run, so the wiring is verified and the behaviour at session end is not |
| **OpenClaw** 2026.6.35 | `openclaw/` - a hook pack (`HOOK.md` + `handler.js`, subscribed to the session event category) | `openclaw plugins install ./openclaw` installs it and `openclaw hooks info` reports it ready with node present; the handler returns 496 characters with a credential and 0 without. **No close half is possible**: its session events are `session:compact`, `session:auto-reset` and `session:patch`, and there is no session-end event at all - nor a `Stop`. `command:stop` and `gateway:shutdown` exist, but neither means "this session finished", which is why the pack contributes context and nothing else |
| **goose** 1.52.0 | `goose/*.yaml` recipes, `goose/centricmem-ambient.mjs`, and the plugin's `hooks/hooks.json` | The refresher writes `status=OK` with a credential and `status=NO-KEY` without one, and disclaims both. goose **does** have a hook surface through plugins: `SessionStart` and `SessionEnd` run `hooks/ambient.mjs` and `hooks/close.mjs`. On goose a hook's stdout is the decision channel and carries no context, so the ambient half writes the file named by `GOOSE_MOIM_MESSAGE_FILE` instead of printing - the built-in **Top Of Mind** extension is what injects it, and it must be enabled |
| **Hermes** v0.21.4 | `hermes/` - a shell hook pair (`pre_llm_call` + `on_session_end`), with the Skill installed from this repository | `hermes hooks test pre_llm_call --payload-file` fires the hook and prints `parsed (Hermes wire shape): {"context": …}`; `hermes hooks doctor` reports `produced valid JSON on synthetic payload (exit=0, 0.109s)` for `pre_llm_call` and `ran clean with empty stdout (exit=0, 0.094s) - hook is observer-only` for `on_session_end`. Both entries had to be allowlisted first, because a non-TTY host cannot answer the consent prompt - until then doctor reports `not allowlisted - hook will NOT fire at runtime` |
| **Qwen Code** 0.24.4 | `qwen/` - a `SessionStart` hook that prints Qwen's own shape (`hookSpecificOutput.additionalContext`) plus a `settings-hooks.example.json`. No extension manifest: the field that points an extension at its own directory is unverified | The hook returns real context in Qwen's shape when a credential is present and nothing when it is not. Both directions are now exercised on Linux and macOS: `smoke.yml` asserts silence with no credential, and the positive-path job points the wrappers at a stub librarian and asserts the envelope actually comes out. **Still unverified**: whether Qwen requires `hookEventName` in that envelope, which needs a real Qwen session |
| **DSH** | a Cordis funnel plus the Claude Code hooks bridge and a native close plugin | The hook half is verified with the environment stripped of every credential variable, where it still prints the JSON envelope with live context. Delivery inside the dsh web profile was not observed, so it is best effort rather than claimed, and `dsh/README.md` records that together with the bundle trap and the fact that the web profile disables `skill-filesystem`, `tool-skill`, `skill-badge` and `agent-instructions` |

**Where the close half works, and where it does not.** The SessionEnd hook calls
`centricmem log-session --auto`, which is a **host-side** command: on a guest it stops with "this command
cannot write the leftover hub" and points at import or the MCP tools instead. So on a machine that talks to a
hosted librarian the hook is silent, and the card is filed by the **agent**, which the Skill requires anyway.
The hook was left that way rather than made to post a card itself: a hook cannot read the session, and this
project's rule is that a card's summary states the key points rather than a placeholder. Cursor's installed
hooks have the same shape and the same boundary - they file on a librarian host and fall silent elsewhere.
On dsh the close half runs as a native plugin instead, because the hooks bridge has no `SessionEnd`.

All of it runs wherever Node runs: `.github/workflows/smoke.yml` proves that on Linux and macOS on every push,
with no credential present, asserting that each wrapper stays silent and exits 0 - and it now runs the close
hook too, which is the assertion that would have caught the release where that hook could not even load. The
PowerShell refresher this replaced did not run outside Windows, which is why there is one implementation now
(`tools/ambient.mjs`) with thin wrappers around it. `hermes/` used to carry its own copy because Hermes runs
its hook from outside the package; it imports the shared credential lookup now and only its own HTTP call
remains, which is the one place a host still leaves the shared path - and it drops the shelf query the shared
implementation builds.

## Two corrections worth keeping

**Codex does have hooks.** It was listed here as having none, on the strength of `codex plugin --help` not
mentioning them. Its documentation does: hooks live in `hooks.json` or inline `[hooks]`, plugins may bundle a
`hooks/hooks.json`, and the shape is the one Claude uses. Absence in a CLI's help is not absence of the
feature - the flags a client exposes on a command line and the files it reads at session boundaries are
different surfaces, and only one of them was checked.

**A credential is not where it looks likely.** The hooks first read only the environment and `api.json`, which
meant they stayed silent on a machine whose key was sitting in the host MCP config all along - `api.json` is
written by a *local hub*, so on a guest it never appears, and the CLI consults it last on purpose because it
is often a stale key. Both halves now read what the CLI reads: environment, claimed host config, then
`api.json`.
