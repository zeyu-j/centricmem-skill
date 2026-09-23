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

## The close half: a native plugin

`dsh/centricmem-close.mjs` is a Cordis plugin (same shape as the bridge: `name`, `apply(ctx)`, and
`ctx.on(...)`) listening on **`agent/disposed`** - the seam `dsh-agent` emits for **every** registered agent, subagents included (only the `roots()` query filters on `owner === undefined`, and a subagent is disposed when its turn ends, not at shutdown). The filter therefore comes from the session header, and the plugin says why in its own comment.
agent. It calls the CLI's `log-session --auto` only when a credential file exists, and swallows every
error, because it runs during disposal.

Mount it in the **profile's own overlay** (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`), where a
mistake is local, rather than in the patch this package ships: the loader resolves names against the
profile directory, and a wrong row in a shipped bundle can stop dsh from booting.

The row resolves against the profile directory, so the package has to be installed there first - and this package is
`"private": true`, so it cannot come from npm by name. The CLI forwards to pnpm:

```sh
dsh plugin --profile web add file:/absolute/path/to/centricmem-skill
dsh plugin --profile web add github:zeyu-j/centricmem-skill   # or from the repo
```

Then, in the profile overlay:

```yaml
- insert:
    - id: centricmem-close
      name: './node_modules/centricmem-skill/dsh/centricmem-close.mjs'
```

Status: written against the API the bridge and `dsh-subagent` use (`ctx.on("agent/disposed", ({ agent }) => …)`),
**not yet exercised in a live session** - so it is documented, not verified, and deliberately not part
of the bundle's patch file.


## How to verify - order matters


The hooks are silent by design when there is no credential, and on this host a credential can only
arrive as a file, so **connect first**: run `centricmem setup` (or the device-connect flow) until
`~/.centricmem/api.json` or `%APPDATA%\\centricmem\\api.json` exists with a token. Then install the
package into the profile, add the overlay rows, and restart dsh. The other order produces "nothing
happened", which says nothing about whether the wiring is right.


Then look for the right signal, because the usual one does not exist here:


- **Ambient half**: a new turn in the session log contains a `user/message` whose source is
  `{kind:'plugin', plugin:'hooks-claude-code'}` and whose text is the shelf context; it is visible in
  the UI too. The bridge writes no `hook/invoked` pair for `SessionStart` - detached lifecycle points
  are deliberately not logged - so the absence of that line proves nothing.
- **Close half**: dsh logs **nothing**, because this is a native plugin rather than a hook and there is
  no hook event to find. The only evidence is on the CentricMem side: a session unit filed for it.
- `SessionStart` is detached, so the context can miss the very first request of a session.


## Status


| Capability | State |
| --- | --- |
| Skills from `~/.agents/skills` | verified - the read path is in `dsh-skill-filesystem` and this package's copy is already installed there |
| Ambient through the Claude Code bridge | verified wiring (`cordis.patch.yml` + `--dump-config`); on dsh a credential can only arrive through `api.json`, because the environment is scrubbed |
| Close half via a native plugin | written against `agent/disposed` with a session-header filter (subagents are in the same registry and are disposed mid-session); not exercised in a live session |

## Credentials on dsh: the file is the only channel

This one is a hard fact about dsh rather than a preference. `dsh-subprocess` defines
`SENSITIVE_ENV_PATTERN = /KEY|PASSWORD|SECRET|TOKEN/i` and its `scrubbedParentEnv()` removes every
matching variable from the environment a hook is spawned with; the hooks bridge adds only
`CLAUDE_PROJECT_DIR`. So on dsh, `CENTRICMEM_TOKEN`, `CENTRICMEM_API_KEY` **and**
`CENTRICMEM_AGENT_KEY` are all gone before a hook starts - the environment simply cannot carry a
credential there.

What works is the file: `~/.centricmem/api.json`, `%APPDATA%\\centricmem\\api.json`, or
`$XDG_CONFIG_HOME/centricmem/api.json`, which both halves read. Practical consequence: on a machine
where the CLI has never been connected, this Skill's hooks stay silent on dsh no matter what is
exported, and `centricmem setup`/`cm_health` is the prerequisite rather than the follow-up.

We deliberately do **not** ship an environment name crafted to avoid that pattern (one without
`KEY`/`TOKEN`) - a host scrubs those names on purpose, and naming a variable to slip past another
product's control is not a fix we want to depend on. The file is the honest channel.

## Bundle, and where the close half goes

This package declares `dsh.bundle.patch` in its `package.json`, so the MCP funnel ships in
`dsh/cordis.patch.yml` as an `insert` row. That is also why the guidance above stays valid: the
**bridge** is a plugin, not a bundle, so it goes in the profile's own patch layer, while the bundle
carries the funnel. A close plugin could ride in the same bundle as a second `insert` row, resolved
relative to the profile directory - it is not shipped yet, because `SessionEnd` cannot carry the
close half here and a native `agent/disposed` plugin has to be written and verified first.
