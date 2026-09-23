# Devin CLI

Devin's CLI has the surfaces we want (`devin skills`, `devin plugins`, `devin mcp`, `devin doctor`),
but **its documentation does not render without JavaScript** - `docs.devin.ai/cli/extensibility/plugins/overview`
returns navigation only. So this folder records what the local CLI proved and marks the rest unknown,
rather than shipping a manifest we have not read.

## Verified with the CLI (3000.11.1, local)

```sh
devin mcp        # connect and log in to Model Context Protocol servers
devin doctor     # diagnose the local configuration
devin skills     # manage agent skills (slash commands and agent-triggered context blobs)
devin plugins    # install, list, info, update, remove
```

Config lives at `~/.config/devin/config.json`. Devin's own wording for a skill - expert knowledge the
agent can invoke itself or with `/skill-name` - is the same idea as this Skill, and its MCP command
means the hosted endpoint can be added without anything from us.

## Still open

- The plugin manifest and the skill folder layout (pages under `docs.devin.ai/cli/extensibility/`
  return no body to a plain fetch).
- Whether a plugin can declare an MCP server, which would make the install one step instead of two.

Until those are read, the honest install for Devin is `devin mcp` for the hosted endpoint plus the
Skill through the open skills CLI. No folder, no manifest, no claim.
