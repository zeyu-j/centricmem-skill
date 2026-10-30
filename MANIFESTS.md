# Why there are twelve host manifests

There is one skill in this repository. The `.*-plugin` directories are not twelve products - they are the
manifest filename each host insists on, and a host reads only its own. Claude Code never opens
`.goose-plugin/`, goose never opens `.claude-plugin/`, and neither of them knows the other's directory exists.

The alternative - one directory that all of them read - is not available. Agent Plugins 1.0 defines a single
bundle, and the hosts disagree about how much of it they can parse:

- **goose reads `.goose-plugin/plugin.json` and not the root `plugin.json`.** Measured: 1.51.0 installed this
  repository without that folder, and 1.52.0 refused the same repository until it was added. The root manifest
  carries an `mcpServers` entry, goose's plugin MCP parser is stdio-only, and a remote (`http`) entry aborts
  the install with `missing field command`. CI asserts both halves: that `.goose-plugin/plugin.json` exists,
  and that it contains no `mcpServers`.
- **CodeBuddy Code names the directory in its own validator output.** `codebuddy plugin validate .` accepts
  `.codebuddy-plugin/`, `.workbuddy-plugin/` and `.claude-plugin/`, which is the vendor saying out loud that a
  host picks its own filename rather than reading a shared one.
- **ZCode preloads the Claude Code marketplace**, so it needs no manifest of its own. The count of directories
  is not the count of clients.

## The directories

| Directory | Host that reads it | Status |
| --- | --- | --- |
| `plugin.json` (root) | Agent Plugins 1.0 bundle: `skills/` + `mcp.json` | the generic shape; every host below is a narrower view of it |
| `.claude-plugin/` | Claude Code (marketplace + plugin) | verified, 2.1.280 - and ZCode 0.16.9 reads this one too |
| `.codex-plugin/` | Codex | verified, 0.156.1 |
| `.codebuddy-plugin/` | CodeBuddy Code | verified, 5.6.2 |
| `.workbuddy-plugin/` | WorkBuddy | verified with CodeBuddy - they share one CLI and one plugin registry |
| `.goose-plugin/` | goose | verified, 1.52.0 - see the version story above |
| `.kiro/plugins/` | Kiro CLI | verified |
| `.cursor-plugin/` | Cursor | covered by the collective row in `VERIFIED-INSTALLS.md` |
| `.grok-plugin/` | Grok | covered by the collective row in `VERIFIED-INSTALLS.md` |
| `.agents/plugins/` | Agent Plugins marketplaces | convention; nothing claimed |
| `.github/plugin/` | Copilot CLI | manifest present; not individually exercised |
| `.kimi-plugin/` | Kimi | manifest present; not individually exercised |

One further directory belongs to a client this repository does not name publicly. It carries a manifest of the
same shape and nothing executable - the complete list of what runs is `hooks/README.md`, and a manifest adds
no code path to it.

`VERIFIED-INSTALLS.md` is the evidence for every row marked verified - each entry there names the client
version, the command that was run, and what it answered. Rows marked "not individually exercised" are honest
gaps, not claims: the manifest exists because the host documents the filename, and nobody has run the install.

## What holds this together

`tools/check-versions.mjs` finds host directories by shape (`.*-plugin`), not by a hardcoded list, so a host
added later cannot silently escape the version check. `.github/workflows/ci.yml` asserts that each manifest
listed above exists, that goose's is free of `mcpServers`, and that `hooks/hooks.json` spells its plugin root
as `${CLAUDE_PLUGIN_ROOT:-$PLUGIN_ROOT}` - the bare form expands to nothing on goose, and the hook would then
run against a path that does not exist.

If a directory here has no entry in `VERIFIED-INSTALLS.md`, that is the honest state: proposed by the host's
documentation, not yet run.
