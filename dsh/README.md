# DeepSeek Harness (dsh)

`dsh` is Cordis-based and lives in `~/.dsh` (`profiles/<name>/` with `cordis.yml` and
`cordis.patch.yml`). Its web UI is `dsh web` on `127.0.0.1:3080`, gated by a token in the URL the
command prints.

## Skills: already visible, nothing to do

`dsh-skill-filesystem` reads skills from `<agentsHome>/skills` - that is **`~/.agents/skills`** -
and from `.dsh`. That is the hub this package installs into with the open skills CLI, so
`centricmem-agent` is picked up with no dsh-specific work. (ZCode's `skills list` shows the same
copy from the same path.)

```sh
npx skills add zeyu-j/centricmem-skill   # puts centricmem-agent in ~/.agents/skills
```

## Hooks: dsh ships a Claude Code bridge

`dsh-hooks-claude-code` - and `dsh-hooks-codex` - are bridge plugins whose own description reads:
*"run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams"*.
The bridge supports `SessionStart`, prompt and tool pre/post, `Stop` and subagent interception,
and it substitutes `${CLAUDE_PLUGIN_ROOT}` with its `pluginRoot` setting (and
`${CLAUDE_PROJECT_DIR}` with the workspace).

That means **this package's `hooks/hooks.json` runs on dsh as it stands**: point `pluginRoot` at a
checkout of this repository, and the ambient half (`hooks/ambient.mjs` on `SessionStart`) and the
close half (`hooks/close.mjs`, which only files a unit where the machine may write) are both wired.

```yaml
# in the profile's Cordis config, alongside the other bridge plugins
dsh-hooks-claude-code:
  pluginRoot: /absolute/path/to/centricmem-skill
```

## Installing the package itself

```sh
npx -y @deepseek-ai/dsh plugin --profile web add github:zeyu-j/centricmem-skill#v1.0.19
```

This command needs a TTY: run without one it prints nothing at all, which is why it is not marked
verified here. The pin matters - every `v0.21.x` tag points at a pre-1.0 snapshot, so pin a release.

## Status

| Capability | State |
| --- | --- |
| Skills from `~/.agents/skills` | verified - the read path is in `dsh-skill-filesystem` and this package's copy is already installed there |
| Ambient + close through the Claude Code bridge | documented from the bridge's own package (seams, `pluginRoot`, `${CLAUDE_PLUGIN_ROOT}`); the wiring needs one interactive session |
| `dsh plugin add` | needs a TTY; no output is not a failure |
