# DeepSeek Harness (dsh)

dsh is Cordis-based and lives in `~/.dsh`: each profile is a directory (`profiles/<name>/`) whose
`cordis.patch.yml` is the layer you edit, with `patchReload: live`. The web UI runs on `127.0.0.1:3080`
behind a token in the URL its command prints.

Run every command below as `npx -y @deepseek-ai/dsh ...` when there is no global `dsh` - that is how the
web profile described here was started, and why a bare `dsh ...` fails with *not recognized*.

## Status

| Capability | State |
| --- | --- |
| Skills from `~/.agents/skills` | **verified** - `dsh-skill-filesystem` reads `<agentsHome>/skills` plus `.dsh`, and this package's copy is installed there. The web profile disables that plugin, so see the last section |
| Ambient through the Claude Code bridge | **the hook is verified** - with every credential variable stripped it still prints the JSON envelope with live shelf context. Delivery inside the web profile was **not observed**, so treat ambient there as best effort |
| Close half | a native plugin on `agent/disposed` (`dsh/centricmem-close.mjs`), written against the API the bridge and `dsh-subagent` use, **not exercised in a live session** |
| MCP (`cm_*` tools) | a separate channel that needs an `Authorization: Bearer ...` header, because the dsh MCP client has no OAuth. Without it there are no `cm_*` tools, and the hooks do not provide them - hooks inject text |

## Wiring

Add the bridge as a line in the profile's own patch layer - **not** in `dsh.profile.bundles`, and no
`pnpm add` (the installed CLI already depends on the bridge, and its closure is mirrored into
`~/.dsh/profiles/node_modules`; a bundle must declare `dsh.bundle.patch`, and the bridge is a plugin, not a
bundle - putting it in `bundles` makes dsh refuse to start):

```yaml
# ~/.dsh/profiles/<name>/cordis.patch.yml
- insert:
    - id: claude-code-hooks
      name: '@deepseek-ai/dsh-hooks-claude-code'
      config:
        configPath: /absolute/path/to/centricmem-skill/hooks/hooks.json
        pluginRoot: /absolute/path/to/centricmem-skill
```

Confirm it landed with `npx -y @deepseek-ai/dsh web --dump-config`: the line should appear in the
synthesised tree under a header naming the patch file. **Restart dsh afterwards**, because the bridge reads
`configPath` once per process.

## The close half is a native plugin

The bridge cannot carry it: its own event list is `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop` - there is no `SessionEnd`, and what it does not know
it ignores silently.

`dsh/centricmem-close.mjs` therefore listens on **`agent/disposed`**, the seam `dsh-agent` emits. That event
is **not** filtered: it fires for every registered agent, subagents included, and a subagent is disposed when
its turn ends rather than at shutdown. The plugin filters on the **session header** (`delegationDepth`,
`origin`), which is in the payload and independent of listener order, spawns the CLI detached and unref'd so
a hung writer cannot stall the harness, and swallows every error because it runs during disposal.

Mount it in the **profile's own overlay**, where a mistake stays local, rather than in the patch this package
ships: the loader resolves names against the profile directory, and a row that resolves wrongly in a shipped
bundle can stop dsh from booting. That row needs the package installed in the profile first (see the next
section), and it is one `insert`:

```yaml
- insert:
    - id: centricmem-close
      name: './node_modules/centricmem-skill/dsh/centricmem-close.mjs'
```

## Credentials: the host config, not `api.json`

The environment cannot carry a credential here: `dsh-subprocess` strips every variable matching
`/KEY|PASSWORD|SECRET|TOKEN/i` before spawning a child, and the hooks bridge adds only `CLAUDE_PROJECT_DIR`.
`api.json` is not the channel either - it is written by a **local hub**, so on a guest machine it never
appears, and the CLI consults it last on purpose because it is often a stale key that makes `doctor` say the
token is fine while data commands answer 401.

What the hooks do is what the CLI does: **environment, then the claimed Bearer in the host config**
(`~/.cursor/mcp.json`, `~/.claude.json`, `~/.codex/config.toml`), then `api.json`. On a guest machine the
host config is where the key actually lives, which is the difference between a silent hook and a working one.

The credential step is `centricmem connect` ("write MCP on this computer"), not `centricmem setup` (choose a
library, link code, install the Skill). We deliberately do **not** ship an environment name crafted to slip
past the scrub pattern: a host filters those names on purpose, and the host config is the honest channel.

## Restarting safely: the bundle trap

`dsh plugin --profile <profile> add <spec>` does more than install a dependency: any package that declares
`dsh.bundle` is reconciled into `dsh.profile.bundles` for you (the CLI prints a warning only for packages
that declare nothing). **This package declares `dsh.bundle.patch`**, so adding it puts
`dsh/cordis.patch.yml` into the profile layer stack.

That patch carries the MCP funnel with `failOnStartupError: true` - deliberately, so a missing Bearer fails
loudly with a named error instead of registering zero tools. Put together, on a machine with no credential
yet, **adding this package and restarting makes dsh fail to start.** Two safe orders:

1. Connect first: run `centricmem connect` until the machine has a key, then add the package, then write the
   `mcp-centricmem` overlay (same `id`, restating `serverName`, `transport`, `url` and `headers`), then
   restart.
2. Or add the package and take it back out of `dsh.profile.bundles` - keeping the *dependency* is enough for
   the close row to resolve - until a credential exists.

One more operational note: the profile uses pnpm hoisted linking, so what gets installed is a **snapshot
copy**, not a link to your checkout. After this package changes, re-run
`dsh plugin --profile <profile> install` for the profile to see the new version.

## How to verify - order matters

The hooks are silent by design when there is no credential, so **test the hook itself first**, with the
environment stripped the way dsh strips it:

```
cmd /c "set CENTRICMEM_TOKEN=& set CENTRICMEM_API_KEY=& set CENTRICMEM_AGENT_KEY=& node <repo>\hooks\ambient.mjs"
```

If that prints the JSON envelope, the hook is fine and any remaining problem is delivery. If it prints
nothing, the credential channel is the problem, not the harness.

Then look for the right signal, because the usual one does not exist here:

- **Ambient half**: a new turn contains a `user/message` whose source is
  `{kind:'plugin', plugin:'hooks-claude-code'}` and whose text is the shelf context; it is visible in the UI
  too. The bridge writes no `hook/invoked` pair for `SessionStart` - detached lifecycle points are
  deliberately not logged - so the absence of that line proves nothing.
- **Close half**: dsh logs **nothing**, because this is a native plugin rather than a hook and there is no
  hook event to find. The only evidence is on the CentricMem side: a session unit filed for it.
- `SessionStart` is detached, so the context can miss the very first request of a session.

## What the web profile turns off

`skill-filesystem`, `tool-skill`, `skill-badge` and `agent-instructions` are all `disabled: true` in the web
profile, patched by `dsh-web-app`. So on that profile the `~/.agents/skills` route and `AGENTS.md` injection
do not apply even though the package reads them: the live channels there are MCP and the hooks.
