# goose recipes for CentricMem

Two recipes that make a goose session a well-behaved CentricMem client. They are **MCP only**: no
CLI, no curl, no local hub. That matters beyond taste — see *OAuth vs a key* below.

| Recipe | What it does | Writes? |
| --- | --- | --- |
| `centricmem-preflight.yaml` | `cm_health` + `cm_doctor` + `cm_ambient`, and reports the block | No |
| `centricmem-close.yaml` | Files the session's Non-Micro work as `cm_done` / `cm_note` / `cm_log_decision` | Yes, over MCP |

## Install

goose discovers recipes in this order: the current directory, directories in `GOOSE_RECIPE_PATH`,
the global library `~/.config/goose/recipes/` (or the equivalent on your OS), and `./.goose/recipes/`.

```bash
# global library (available in every project)
mkdir -p ~/.config/goose/recipes
cp recipes/*.yaml ~/.config/goose/recipes/

# or keep them in a repo and point goose at them
export GOOSE_RECIPE_PATH=/path/to/centricmem-skill/recipes
```

## Run

```bash
goose run --recipe centricmem-preflight
goose run --recipe centricmem-preflight --params shelf=host
goose run --recipe centricmem-close --params shelf=centricmem --params tags=cli,release

# check a recipe before you trust it
goose recipe validate /path/to/centricmem-preflight.yaml
goose recipe list
```

## OAuth vs a key

A goose session that connects to CentricMem **by OAuth** has working MCP tools and **no Bearer** on
disk. Anything that shells out — the `centricmem` CLI, a Stop hook script, a session sweep — cannot
authenticate in that case, and it never should: the CLI resolves a key from `CENTRICMEM_TOKEN`, a
claimed `mcp.json`, or the catalog, so with OAuth there is nothing to find.

These two recipes are written for exactly that situation: they use the MCP tools, so an
OAuth-connected goose works the same as one holding a key.

If you do run the CLI anyway, the failure is now explicit rather than misleading: a host with no key
is told *"no CentricMem key on this machine … if this agent is connected by OAuth there is no key to
find and that is expected: use the MCP tools (cm_*)"* — not "librarian unreachable". A `401` when a
key *was* sent carries the same hint, because the server's usual text ("Rotate it in Manager
settings") is useless advice on a host that has no key to rotate.

## Optional: a goose hook

goose runs hooks from plugins (`plugin.json` + `hooks/hooks.json`, Open Plugins specification);
`goose plugin install <git-url>` installs one. A `SessionStart` hook is the natural place to refresh
the ambient file that goose injects into every turn. Two caveats:

- a hook is a **shell command**, so it needs a Bearer to reach the librarian — it cannot use MCP.
  On an OAuth-only host it should skip and say so, rather than write a stale file;
- the CentricMem rule stays: a hook must never write memory, and never write a leftover
  `CENTRICMEM_HOME`. Session cards belong to the agent (`cm_done`), which is what
  `centricmem-close.yaml` above does.

## Skills, and the shared hub

Installing the Agent Skill is not the same as installing these recipes. `skills add` writes a
canonical copy of the skill into `~/.agents/skills` **unconditionally** — even when installing for a
single agent with `-a <agent>` — and an agent that reads that hub injects **every** skill's
description into its prompt on every turn. Recipes never enter the hub, so a host that only needs
goose behaviour can skip the skill entirely.

If the skill is installed and the hub grows, prune it afterwards with the `hub-guard` skill
(`hub-guard.ps1` previews; `-Apply` moves non-allow-listed directories to
`~/.agents/_codex-local/quarantine/<timestamp>/`).
