# nanobot

nanobot (v0.3.5, the `nanobot_ai` package) is a personal assistant with a workspace of its own: the
CLI shim is `~/.nanobot/bin/nanobot.cmd`, and everything it knows lives under
`~/.nanobot/workspace` - `AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md`, `skills/`, `plugins/`,
`memory/`, `notes/`, `prompts/`, `triggers/`, `cron/` and a `skills-lock.json`.

## Skills: one folder per Skill

`nanobot/agent/skills.py` reads skills from `<workspace>/skills`, one folder per skill with a
`SKILL.md` inside, alongside a builtin directory; `disabledSkills` in the config turns one off, the
WebUI has a skills API that deliberately hides local paths, and there is a marketplace. The install
is a copy:

```sh
cp -r skills/centricmem-agent ~/.nanobot/workspace/skills/
```

## Plugins: our bundle, scanned in place

`nanobot/agent/plugins.py` looks for installed Agent Plugin packages under
**`<workspace>/plugins/*`**, reads each one's `mcp.json` and validates it against
`https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`, and takes the `skills/` directory inside
the package. That is exactly this repository - `plugin.json`, `mcp.json`, `skills/` - so the bundle
is the way to give nanobot the Skill and the MCP server together:

```sh
cp -r . ~/.nanobot/workspace/plugins/centricmem-skill   # from a clone of this repository
```

## MCP

nanobot speaks MCP (`agent/tools/mcp.py`, with an OAuth helper that keeps its state in the data
directory's `auth/mcp.json`) and the WebUI has an MCP-presets screen. The hosted endpoint is
`https://mem.centricmem.com/mcp`; on a host that can finish the OAuth prompt that is the whole setup.

## Status

Both paths above were installed on this machine and the read paths come from nanobot source. Neither
has been exercised in a live agent run, so they are documented rather than verified: the difference
matters, and this file says which one it is.
