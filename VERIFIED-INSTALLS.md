# Verified installs

**Marks.** ✅ verified - we ran it and read the answer. ◐ same core as the CLI - the CLI was verified, this
wrapper was not exercised. 📄 documented - a convention, nothing claimed.

**One core, one test.** Where a product ships a CLI and a GUI or IDE, the core is tested once and the
wrapper is marked ◐: they read the same config, the same plugin registry, the same hooks (CodeBuddy Code
and WorkBuddy share one CLI; a desktop app and its bundled CLI share one plugin registry; the Hermes
app and its CLI share `config.yaml`). CLI evidence does not transfer for **browser and OAuth hops**, for
**session-end behaviour** (only a real session ends), or where a GUI ships **its own snapshot** of the
core.

These were run against real clients, not copied from documentation.
The marks say which is which.

These were run against real clients, not copied from documentation. The marks say which is which.

| Client | Command | What happened |
|---|---|---|
| **pi** 0.87.1 | `pi install https://github.com/zeyu-j/centricmem-skill` | clone lands in `~/.pi/agent/git/github.com/zeyu-j/centricmem-skill` and `pi list` reports it under user packages. Installed from `@earendil-works/pi-coding-agent` - the unscoped `pi` on npm is nothing to do with this  It has **no lifecycle hook surface** - its extension model is package resources, toggled with `pi config`, and the Skill arrives through exactly that path, so there is nothing further to add |
| **Kiro CLI** | `kiro-cli mcp add --name centricmem --url https://mem.centricmem.com/mcp --scope default` | answers `✔ Added MCP server 'centricmem' to default config in ~/.kiro/settings/mcp.json`, and `kiro-cli mcp list` shows it under the default agent. Note the shape: this client takes flags only, so the name and url cannot be positional. Its `plugin`/marketplace manifests are for the Kiro IDE, not this CLI  The CLI and the Kiro IDE are **separate programs sharing a config directory**: the IDE is not installed here, its `.kiro/plugins/marketplace.json` is for it and not for this CLI, and the CLI's help contains no hook, plugin, marketplace or extension surface at all. So there is nothing host-specific left to test on this machine |
| **CodeBuddy Code / WorkBuddy** 5.6.2 | `codebuddy plugin marketplace add zeyu-j/centricmem-skill` then `codebuddy plugin install centricmem-skill@centricmem` | both succeed and `codebuddy plugin list` reports it enabled. The vendor's own validator agrees: `codebuddy plugin validate .` answers `✔ Validation passed` for `.codebuddy-plugin/marketplace.json`, and its error text lists the manifest paths it accepts - `.codebuddy-plugin/`, `.workbuddy-plugin/`, `.claude-plugin/`. `codebuddy mcp list` also shows the server, awaiting a user approval rather than failing |
| **goose** 1.51.0 | `goose plugin install https://github.com/zeyu-j/centricmem-skill` | reports "Installed open-plugins plugin"; imports `centricmem-skill:centricmem-agent`. No host-specific manifest folder is involved - goose reads the manifest at the repository root |
| **Claude Code** 2.1.280 | `claude plugin marketplace add zeyu-j/centricmem-skill` then `claude plugin install centricmem-skill@centricmem` | both succeed; `claude plugin list` shows version 1.0.9, enabled |
| **Codex** 0.156.1 | `codex plugin marketplace add https://github.com/zeyu-j/centricmem-skill` then `codex plugin add centricmem-skill@centricmem` | marketplace accepted; plugin cached at `~/.codex/plugins/cache/centricmem/centricmem-skill/1.0.9`  **Run `codex plugin marketplace upgrade` after a release**: Codex caches the marketplace snapshot, so re-adding is not needed but refreshing is - an install left alone kept serving 1.0.9 after 1.0.11 was published. Once refreshed, its own installer puts `hooks/hooks.json` with SessionStart and SessionEnd into the plugin cache, which is where Codex reads hooks from |
| **OpenClaw** 2026.6.35 | `openclaw plugins install centricmem-skill --marketplace zeyu-j/centricmem-skill` | installed as a **bundle** (it consumes the Claude marketplace format); `openclaw plugins list` shows 1.0.9, enabled |
| Cursor, Grok, Hermes, and the private clients whose manifests are not published here | per-host manifests in this repository | **install not verified here for the GUI-only ones** - these are GUI or closed clients, so their manifests follow the published convention and nothing more is claimed. A private desktop coding agent of ours was exercised through its own package tool instead, and it is left unnamed here on purpose: its tree was still carrying a 0.21.90 copy of this plugin, and `plugin install <repo> --replace --yes` refreshed it to 1.0.12 and reported `mappedCapabilities: [skills, hooks], hookCount: 2`, so it runs the shared `hooks/hooks.json` |
| dsh, Pi | - | their own distribution, not on npm; install through their own tooling |

If one of the unverified rows is wrong, the fix is a manifest change, not a code change: open an issue with the
client's version and what its installer said.
