# Qwen Code

Qwen Code (the `qwen` CLI) has a real hook system, so this host gets both halves: context at
the start of a session, and the close half where the machine is allowed to write.

## What the docs say (checked, not assumed)

- Hooks live in `.qwen/settings.json` (project) or the user settings file, under a `hooks` key,
  and can be disabled wholesale with `disableAllHooks` at the top level.
- Shape: `Event -> [{ matcher?, sequential?, hooks: [{ type, command, name, timeout }] }]`.
  Events include `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`,
  `PostToolUse`, `Stop`, `SubagentStop`, `PreCompact`, `SessionDelete`.
- A `SessionStart` hook contributes context by printing
  `{"hookSpecificOutput": {"additionalContext": "…"}}`.
- `/hooks` in the TUI opens a read-only browser of what will run.

## Install

1. Copy the `hooks` block out of `qwen/settings-hooks.example.json` into your
   `.qwen/settings.json`, replacing `__SKILL_ROOT__` with the absolute path of this checkout
   (a plugin/extension install puts the whole repository somewhere under your home, and a
   relative path is resolved against the project, not against the Skill).
2. `/hooks` should list `centricmem-ambient` under `SessionStart`.
3. On a host with a credential the next session starts oriented. On a guest nothing prints —
   that is the same boundary the other hosts have for the close half.

## Verified

- `node qwen/ambient-hook.mjs` with no credential prints nothing and exits 0 (local, and in
  `smoke.yml` on Linux and macOS with the other wrappers).
- The reply shape is Qwen's, taken from its hooks page; the ambient text itself is the shared
  `tools/ambient.mjs` implementation every other host uses.

## Notes

- Qwen also loads **extensions** (`qwen-extension.json`) that can carry `mcpServers`, `skills`,
  `commands`, `agents` and `workflows`, and it can install Claude Code marketplace plugins.
  A CentricMem extension is the natural next step; the manifest field for pointing at the
  extension's own directory (`__SKILL_ROOT__` above) still needs checking before we ship one,
  and we do not ship manifests we have not read.
