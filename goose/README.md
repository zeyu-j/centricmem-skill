# goose

Everything goose-specific lives here. goose reads the plugin manifest at the repository root - it reports
"open-plugins plugin" and imports the skill itself - so there is no host-named manifest directory for it,
unlike the vendors that each require one.

**Install the plugin**

```sh
goose plugin install https://github.com/zeyu-j/centricmem-skill
```

That imports the skill (`centricmem-skill:centricmem-agent`) and drops the repository under
`~/.agents/plugins/centricmem-skill/`. Verified against goose 1.51.0.

**Two recipes (MCP only)**

Recipes make a goose session a well-behaved CentricMem client without shelling out to the CLI, so they work
on OAuth-connected hosts where there is no key to give a script.

```sh
# put this directory on goose's recipe path once
export GOOSE_RECIPE_PATH=/path/to/centricmem-skill/goose

goose run --recipe centricmem-preflight                      # health, doctor, ambient (read only)
goose run --recipe centricmem-preflight --params shelf=host
goose run --recipe centricmem-close --params shelf=centricmem --params tags=cli,release
```

goose discovers recipes in the current directory, then `GOOSE_RECIPE_PATH`, then `~/.config/goose/recipes/`,
then `./.goose/recipes/`. Copying the two YAML files into the global library works just as well if you
prefer not to set a variable.

**The ambient refresher**

`centricmem-ambient.ps1` writes the file named by `GOOSE_MOIM_MESSAGE_FILE`, which goose injects into every
turn. It is optional and additive: the baseline is the Skill plus host MCP.

```powershell
[Environment]::SetEnvironmentVariable("GOOSE_MOIM_MESSAGE_FILE", "$env:USERPROFILE\.goose\centricmem-ambient.md", "User")
powershell -NoProfile -File centricmem-ambient.ps1
```

**Why a script and not a hook.** A goose hook is a shell command, so it can only reach the librarian over
HTTP with a Bearer. The MCP tools need no token at all. This script is therefore the optional layer that
puts the ambient text in front of the model before it asks, and it degrades honestly: no key is normal on
an OAuth-connected host, a refusal is a credential problem, and no answer at all is the transport case that
also leaves goose unable to initialise MCP.

**It will not fall back to a local hub.** On a guest machine the CLI resolves the leftover copy of the hub,
so an HTTP failure used to be reported as `status=OK` while carrying months-old context. If the librarian
cannot be reached, the file says so.

**Scheduling it.** goose ships a scheduler extension ("Create and manage scheduled recipe execution"), so a
recipe that runs this script on a timer is enough; there is no need to wire a hook.
