# Verified optimisations

**Marks.** ✅ verified - we ran it and read the answer. ◐ same core as the CLI - the CLI was verified, this
wrapper was not exercised. 📄 documented - a convention, nothing claimed.

**One core, one test.** Where a product ships a CLI and a GUI or IDE, the core is tested once and the
wrapper is marked ◐: they read the same config, the same plugin registry, the same hooks (CodeBuddy Code
and WorkBuddy share one CLI; a desktop app and its bundled CLI share one plugin registry; the Hermes
app and its CLI share `config.yaml`). CLI evidence does not transfer for **browser and OAuth hops**, for
**session-end behaviour** (only a real session ends), or where a GUI ships **its own snapshot** of the
core.

Same idea as the installs above: these were run against real clients on this machine, and the marks say what
was run and what was only read.

| Host | What was added | Evidence |
|---|---|---|
| **Claude Code** 2.1.280 | `hooks/hooks.json` - a SessionStart hook, bundled in the plugin | `claude plugin details` reports `Hooks (1) SessionStart (harness-only - no model context cost)`; the hook script prints 496 characters with a credential and 0 without |
| **OpenClaw** 2026.6.35 | `openclaw/` - a hook pack (`HOOK.md` + `handler.js`, events: `session`) | `openclaw plugins install ./openclaw` installs it and `openclaw hooks info` reports it ready with node present; the handler returns 496 characters with a credential, 0 without  **No close half is possible**: its session events are `session:compact`, `session:auto-reset` and `session:patch`, and there is no session-end event at all - nor a `Stop`, which is why the pack contributes context and nothing else. `command:stop` and `gateway:shutdown` exist but neither means "this session finished" |
| **goose** 1.51.0 | `goose/*.yaml` recipes and `goose/centricmem-ambient.mjs` | the refresher writes `status=OK` with a credential and `status=NO-KEY` without one, disclaiming both |
| **Codex** 0.156.1 | the same `hooks/hooks.json` in the plugin, so `SessionStart` and `SessionEnd` both apply | Codex discovers hooks as `hooks.json` or inline `[hooks]` in `config.toml`, and "installed plugins can also bundle lifecycle config through their plugin manifest or a default `hooks/hooks.json` file" - the file Claude reads. Its events include `SessionStart`, `SubagentStart`, `SessionEnd` (documented as running when the main thread ends, not for subagents), `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact` and `SubagentStop`. **Not exercised**: no Codex session was run, so the wiring follows its documentation rather than a run here |
| **Cursor** | both halves, by the client's own installer: `centricmem setup --install-hooks` | The only host with a first-class hook installer, and the only one here where both halves are wired up. Its MCP connection was already configured. The hooks it installs are real work, not reminders: `sessionStart` runs `centricmem ambient --write`, and `sessionEnd` runs `centricmem log-session --auto` followed by a reindex - so a Cursor session refreshes its own context and files its own card. Verified by reading the installed files: `.cursor/hooks/hooks.json` in the code repository and `~/.cursor/hooks/hooks.json`. **Not exercised**: no Cursor session was run - the wiring is verified, the behaviour at session end is not |
| **Hermes** v0.21.4 | `hermes/` - a shell hook pair (`pre_llm_call` + `on_session_end`), with the Skill installed from this repo | `hermes hooks test pre_llm_call --payload-file` fires the hook and prints `parsed (Hermes wire shape): {"context": …}`; `hermes hooks doctor` reports `✓ produced valid JSON on synthetic payload (exit=0, 0.109s)` for `pre_llm_call` and `✓ ran clean with empty stdout (exit=0, 0.094s) — hook is observer-only` for `on_session_end`. Both entries had to be allowlisted first - a non-TTY host cannot answer the consent prompt, so `hermes hooks doctor` reported `✗ not allowlisted — hook will NOT fire at runtime` until the allowlist carried the exact command string |

**Where the close half works, and where it does not.** The SessionEnd hook calls
`centricmem log-session --auto`, which is a **host-side** command: on a guest it stops with "this command cannot
write the leftover hub" and points at import or the MCP tools instead. So on a machine that talks to a hosted
librarian the hook is silent, and the card is filed by the **agent**, which is what the Skill already requires
anyway. The hook was left alone rather than making it post a card itself: a hook cannot read the session, and
this project's own rule is that a card's summary states the key points, not a placeholder. Cursor's installed
hooks have the same shape and the same boundary - they file on a librarian host and fall silent elsewhere.

All of it runs wherever Node runs - `.github/workflows/smoke.yml` proves that on Linux and macOS on every push, with no
credential present, asserting that each of them stays silent and exits 0. The PowerShell refresher this
replaced did not run outside Windows, which is why there is only one implementation now (`tools/ambient.mjs`)
and three thin wrappers (`hermes/` carries its own copy, because Hermes runs its hook from outside the package).

## One correction worth keeping

**One correction worth keeping.** Codex was listed here as having no hook mechanism, on the strength of
`codex plugin --help` not mentioning hooks. Its documentation does: hooks live in `hooks.json` or inline
`[hooks]`, plugins may bundle a `hooks/hooks.json`, and the shape is the same one Claude uses. Absence in a
CLI's help is not absence of the feature - the flags a client exposes on a command line and the files it reads
at session boundaries are different surfaces, and only one of them was checked.
