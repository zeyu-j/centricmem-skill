# goose

Everything goose-specific lives here. goose reads `.goose-plugin/plugin.json` - a host-named directory, like
the vendors that each require one. It does *not* read the root `plugin.json`: the root manifest carries an
`mcpServers` entry, and goose's plugin MCP parser is stdio-only, so reading it would abort the install. The
two manifests are kept deliberately different, and CI asserts that the goose one stays free of `mcpServers`.

**Install the plugin**

```sh
goose plugin install https://github.com/zeyu-j/centricmem-skill
```

That imports the skill (`centricmem-skill:centricmem-agent`) and drops the repository under
`~/.agents/plugins/centricmem-skill/`.

goose reads **`.goose-plugin/plugin.json`**, and that file is load-bearing rather than cosmetic: the root
`plugin.json` declares `mcpServers`, goose's plugin MCP parser is stdio-only, and a remote (`http`) entry
aborts the whole install with `missing field \`command\``. Keep `mcpServers` out of the `.goose-plugin`
manifest. CI checks both halves of that (`ci.yml`: the manifest has no `mcpServers`; `smoke.yml`: a real
goose installs the plugin).

**The MCP server is not installed by the plugin**

A goose plugin carries skills and hooks only. Installing one does not register an MCP server, and goose's
plugin MCP support is stdio-only, so the hosted streamable-HTTP endpoint is added separately:

```sh
goose session --with-streamable-http-extension "https://mem.centricmem.com/mcp"
```

Or keep it in `~/.config/goose/config.yaml`:

```yaml
extensions:
  centricmem:
    name: CentricMem
    type: streamable_http
    uri: https://mem.centricmem.com/mcp
    enabled: true
```

Until it is added, `cm_*` are absent even though the install succeeded and the Skill loaded.

**Two recipes (MCP only)**

Recipes make a goose session a well-behaved CentricMem client without shelling out to the CLI, so they work
on OAuth-connected hosts where there is no key to give a script.

```sh
goose run --recipe centricmem-preflight                      # health, doctor, ambient (read only)
goose run --recipe centricmem-preflight --params shelf=host
goose run --recipe centricmem-close --params shelf=centricmem --params tags=cli,release
```

**They install themselves.** `goose plugin install` still imports skills and hooks and never recipes -
goose's plugin format has no recipes field, and its discovery never descends into `~/.agents/plugins/`, so
the YAML here is inert until something puts it where goose looks. The plugin's `SessionStart` entry does
that: `goose/wire-recipes.mjs` runs on goose and only on goose, and copies these two files into
`~/.config/goose/recipes/`. Measured on 1.52.0: that library is searched, and so is `~/.agents/recipes/`,
which goose does not document. What does *not* work is `GOOSE_RECIPE_PATH`: the key is ignored in
`~/.config/goose/config.yaml`, a hook cannot change goose's own environment because it runs as goose's
child, and Goose.app launched from the dock inherits no shell profile - so an exported variable fails
silently. The global library needs no variable at all. The wiring never replaces a file it did not write:
a recipe without `# managed by centricmem-skill` on line one is left alone, and it says so.

Running from a checkout rather than an installed plugin, point goose at this directory once:

```sh
export GOOSE_RECIPE_PATH=/path/to/centricmem-skill/goose
```

goose discovers recipes in the current directory, then `GOOSE_RECIPE_PATH`, then `~/.config/goose/recipes/`,
then `./.goose/recipes/`. Any of those works - the plugin uses the third.

**The ambient refresher**

`centricmem-ambient.mjs` writes the file named by `GOOSE_MOIM_MESSAGE_FILE`, which goose injects into
every turn. It is part of the shared implementation in `../tools/ambient.mjs`, so it is the same code that
the Claude Code hook and the OpenClaw handler use, and it runs wherever Node runs - the PowerShell version it
replaced worked only on Windows, which is the machine it was written on.

```sh
export GOOSE_MOIM_MESSAGE_FILE="$HOME/.goose/centricmem-ambient.md"
node centricmem-ambient.mjs
```

It is optional and additive: the baseline is the Skill plus host MCP. Three rules, the same ones the other
host hooks follow - it never fails (a network problem means a quieter session, not a broken one), it never
guesses a credential, and it never writes a file that claims more than it knows. When there is nothing
trustworthy to say it says so, in the file, rather than leaving something stale in place:

| It writes | When |
|---|---|
| `status=OK` plus the ambient text | a credential was found and the librarian answered |
| `status=NO-KEY` | no credential anywhere - normal on an OAuth-connected host, where the MCP tools need none |
| `status=REFUSED` | the key was rejected (HTTP 401/403), with the last four characters of the key and where it came from |
| `status=NO-ANSWER` | the librarian did not answer - the transport case, and the one where cycling the goose extension is the fix |

**Scheduling it.** The plugin's `hooks/ambient.mjs` already does this at session start on goose, so the
normal case needs nothing wired. If you would rather refresh on a timer, goose ships a scheduler extension,
so a recipe or a timer that runs this script is enough.

**Enable Top Of Mind.** The file is only read while goose's built-in **Top Of Mind** extension is on - that is
the extension that injects `GOOSE_MOIM_MESSAGE_FILE` into every turn. With it off, the file is written and
quietly ignored. This is the only route for shelf context into a turn: a hook's stdout on goose is the
decision channel and carries no context, which is why the ambient half writes a file instead of printing.
