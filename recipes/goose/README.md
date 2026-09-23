# goose extras

Optional, additive layers for goose. The baseline is the Skill plus host MCP (`cm_*`) - nothing here is
required to use CentricMem, and a host without it is not misconfigured.

## `centricmem-ambient.ps1` - the turn-by-turn ambient block

goose injects the file named by `GOOSE_MOIM_MESSAGE_FILE` into every turn. This script refreshes that
file from the librarian so the block stays current:

```powershell
# point goose at the file once
[Environment]::SetEnvironmentVariable("GOOSE_MOIM_MESSAGE_FILE", "$env:USERPROFILE\.goose\centricmem-ambient.md", "User")

# write a first copy, then refresh it whenever you want a newer one
powershell -NoProfile -File centricmem-ambient.ps1
powershell -NoProfile -File centricmem-ambient.ps1 -Shelf host
```

**Why a script and not a hook.** A goose hook is a shell command, so it can only reach the librarian over
HTTP with a Bearer. The MCP tools need no token at all. This script is therefore the optional layer that
puts the ambient text in front of the model before it asks, and it degrades honestly: no key is normal on
an OAuth-connected host, a refusal is a credential problem, and no answer at all is the transport case
that also leaves goose unable to initialise MCP.

**It will not fall back to a local hub.** On a guest machine the CLI resolves the leftover copy of the
hub, so an HTTP failure used to be reported as `status=OK` while carrying months-old context. If the
librarian cannot be reached, the file says so.

## Scheduling it

goose ships a scheduler extension (`scheduler`: "Create and manage scheduled recipe execution"). A recipe
that runs this script on a timer is enough; there is no need to wire a hook. The recipes beside this file
(`centricmem-preflight`, `centricmem-close`) cover the read and close sides over MCP.
