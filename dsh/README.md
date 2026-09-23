# DeepSeek Harness (dsh)

`dsh` is Cordis-based and lives in `~/.dsh` (`profiles/<name>/`, where `cordis.patch.yml` is the
layer you edit). The web UI is `dsh web` on `127.0.0.1:3080`, gated by the token in the URL it
prints.

## Skills: already visible, nothing to do

`dsh-skill-filesystem` reads skills from `<agentsHome>/skills` - that is **`~/.agents/skills`** -
and from `.dsh`. That is the hub this package installs into with the open skills CLI, so
`centricmem-agent` is picked up with nothing dsh-specific.

## Hooks: what the bridge does and does not do

`dsh-hooks-claude-code` runs an existing Claude Code `hooks.json` on dsh's interception seams. Two
limits matter, and both were measured rather than assumed:

- **`SessionEnd` is not among the supported events** (the bridge handles a subset of Claude Code's
  events and ignores the rest silently), so a close-half hook will **not** run through the bridge.
  File the session unit with a native dsh plugin that listens on `agent/disposed` instead - the
  bridge exists for the context half.
- **The reply must be the JSON envelope.** The codec folds in `hookSpecificOutput.additionalContext`
  and drops the whole reply unless `hookEventName` is exactly `SessionStart`. `hooks/ambient.mjs`
  prints that envelope (Claude Code accepts it too), so one file serves both hosts.

### Wiring

Add the bridge as a line in the profile's own patch layer - **not** in `dsh.profile.bundles`, and no
`pnpm add` (the installed CLI already depends on the bridge, and its closure is mirrored into
`~/.dsh/profiles/node_modules`; a bundle must declare `dsh.bundle.patch`, and the bridge is a plugin,
not a bundle - putting it in `bundles` makes dsh refuse to start):

```yaml
# ~/.dsh/profiles/<name>/cordis.patch.yml
- insert:
    - id: claude-code-hooks
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: /absolute/path/to/centricmem-skill/hooks/hooks.json
        pluginRoot: /absolute/path/to/centricmem-skill
```

Verify it landed with `dsh web --dump-config` (the line should appear in the synthesised tree, with
the patch file named in the header). **Restart dsh afterwards**: the bridge reads `configPath` once
per process. `SessionStart` is detached, so the first request of a session can miss the context, and
the bridge does not log `hook/invoked` pairs for it - a silent failure leaves no trace.

## Status

| Capability | State |
| --- | --- |
| Skills from `~/.agents/skills` | verified - the read path is in `dsh-skill-filesystem` and this package's copy is already installed there |
| Ambient through the Claude Code bridge | verified wiring (`cordis.patch.yml` + `--dump-config`); depends on a credential being present in the environment dsh was started from |
| Close half via the bridge | not possible - `SessionEnd` is unsupported; needs a native plugin on `agent/disposed` |
