# CentricMem

**One library. Every agent. Every desk.**

A hosted librarian for AI agents. Capture stays in the agent you already use. CentricMem organises and retrieves — Cursor, Claude Code, Codex, Hermes, Pi, OpenClaw, DSH, Copilot, Kiro, Kilo, CodeBuddy, Kimi Code, and the next one share the same shelf.

This repository is **one package**: [Agent Skills](https://agentskills.io) `SKILL.md` plus an [Agent Plugins 1.0](https://agent-plugins.org) bundle (`plugin.json` + `skills/` + `mcp.json`). Install it once from GitHub; each client uses its own command. Do not paste keys or marketplace JSON into chat.


### Verified optimisations

Same idea as the installs above: these were run against real clients on this machine, and the marks say what
was run and what was only read.

| Host | What was added | Evidence |
|---|---|---|
| **Claude Code** 2.1.280 | `hooks/hooks.json` - a SessionStart hook, bundled in the plugin | `claude plugin details` reports `Hooks (1) SessionStart (harness-only - no model context cost)`; the hook script prints 496 characters with a credential and 0 without |
| **OpenClaw** 2026.6.35 | `openclaw/` - a hook pack (`HOOK.md` + `handler.js`, events: `session`) | `openclaw plugins install ./openclaw` installs it and `openclaw hooks info` reports it ready with node present; the handler returns 496 characters with a credential, 0 without  **No close half is possible**: its session events are `session:compact`, `session:auto-reset` and `session:patch`, and there is no session-end event at all - nor a `Stop`, which is why the pack contributes context and nothing else. `command:stop` and `gateway:shutdown` exist but neither means "this session finished" |
| **goose** 1.51.0 | `goose/*.yaml` recipes and `goose/centricmem-ambient.mjs` | the refresher writes `status=OK` with a credential and `status=NO-KEY` without one, disclaiming both |
| **Codex** 0.156.1 | the same `hooks/hooks.json` in the plugin, so `SessionStart` and `SessionEnd` both apply | Codex discovers hooks as `hooks.json` or inline `[hooks]` in `config.toml`, and "installed plugins can also bundle lifecycle config through their plugin manifest or a default `hooks/hooks.json` file" - the file Claude reads. Its events include `SessionStart`, `SubagentStart`, `SessionEnd` (documented as running when the main thread ends, not for subagents), `Stop`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact` and `SubagentStop`. **Not exercised**: no Codex session was run, so the wiring follows its documentation rather than a run here |
| **Cursor** | both halves, by the client's own installer: `centricmem setup --install-hooks` | The only host with a first-class hook installer, and the only one here where both halves are wired up. Its MCP connection was already configured. The hooks it installs are real work, not reminders: `sessionStart` runs `centricmem ambient --write`, and `sessionEnd` runs `centricmem log-session --auto` followed by a reindex - so a Cursor session refreshes its own context and files its own card. Verified by reading the installed files: `.cursor/hooks/hooks.json` in the code repository and `~/.cursor/hooks/hooks.json`. **Not exercised**: no Cursor session was run - the wiring is verified, the behaviour at session end is not |

**Where the close half works, and where it does not.** The SessionEnd hook calls
`centricmem log-session --auto`, which is a **host-side** command: on a guest it stops with "this command cannot
write the leftover hub" and points at import or the MCP tools instead. So on a machine that talks to a hosted
librarian the hook is silent, and the card is filed by the **agent**, which is what the Skill already requires
anyway. The hook was left alone rather than making it post a card itself: a hook cannot read the session, and
this project's own rule is that a card's summary states the key points, not a placeholder. Cursor's installed
hooks have the same shape and the same boundary - they file on a librarian host and fall silent elsewhere.

All of it runs wherever Node runs - `.github/workflows/smoke.yml` proves that on Linux and macOS on every push, with no
credential present, asserting that each of them stays silent and exits 0. The PowerShell refresher this
replaced did not run outside Windows, which is why there is only one implementation now (`tools/ambient.mjs`)
and three thin wrappers.

## Verified installs

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
| Cursor, Grok, Hermes, and the private hosts whose manifests are not published here | per-host manifests in this repository | **install not verified here** - these are GUI or closed clients, so their manifests follow the published convention and nothing more is claimed. Cursor is worth noting: its MCP connection is already configured on this machine |
| dsh, Pi | - | their own distribution, not on npm; install through their own tooling |

If one of the unverified rows is wrong, the fix is a manifest change, not a code change: open an issue with the
client's version and what its installer said.

## Install

**Names (read once):** `centricmem` = product / CLI. `centricmem-skill` = this GitHub package (plugins + marketplace). `centricmem-agent` = the Agent Skill folder inside the package (`skills/centricmem-agent/`). Humans can say “CentricMem skill”; keep `--skill centricmem-agent` and that folder name.

Paste this to the agent (one line):

```
Install CentricMem from zeyu-j/centricmem-skill (GitHub package). The Agent Skill folder name is centricmem-agent — not a second product. After install, this agent (and each client you install into) sends https://centricmem.com/login?signup=1 and tries a /connect?device= URL — plugin mcp.json or mcp add with no Bearer is not a completed connect. If minting that URL fails, run centricmem doctor connect and they email zeyu@poppyg.com with that output (never a key); then MCP OAuth only if this agent will receive the browser login (Grok Bot and Manus may; a 127.0.0.1 callback does not when this agent is not listening there). If they already have a key or a finished OAuth login in this agent, ask for a new chat — do not strip Bearer, do not mint a new connect URL. Tell them the key appears only once — save a backup; never paste keys. If connect or usage still fails, they email zeyu@poppyg.com (never a key).
```

If the shell works, a terminal in the project can run:

```bash
# package = centricmem-skill; skill folder = centricmem-agent
npx --yes skills add zeyu-j/centricmem-skill --skill centricmem-agent -y
```

(omit `-g` — some agents, including PromptScript, have no user-wide skills dir.)

Same GitHub repo as a plugin marketplace:

| Client | Add this repo, then install |
| --- | --- |
| Cursor | Plugins → Team Marketplaces → Import from Repo `zeyu-j/centricmem-skill`, or `npx skills add` above |
| Claude Code | `/plugin marketplace add zeyu-j/centricmem-skill` then `/plugin install centricmem-skill@centricmem` |
| CodeBuddy / WorkBuddy | `codebuddy plugin marketplace add zeyu-j/centricmem-skill` then `/plugin install centricmem-skill@centricmem` |
| Kimi Code | `/plugins install https://github.com/zeyu-j/centricmem-skill` (Custom). Catalog: `/plugins marketplace https://raw.githubusercontent.com/zeyu-j/centricmem-skill/main/.kimi-plugin/marketplace.json`. Set `CENTRICMEM_API_KEY` for host MCP. |
| Dify | Marketplace listing pending review. Source: `zeyu-j/centricmem-dify`. Or attach MCP `https://mem.centricmem.com/mcp` with the same agent key. |
| Codex | Every agent tries `/connect?device=` first. Plugin: `codex plugin marketplace add https://github.com/zeyu-j/centricmem-skill.git` then install **centricmem-skill**. `codex mcp login` only after that mint fails, and only if this Codex will receive the Loopback callback |
| Hermes | `hermes skills install zeyu-j/centricmem-skill/skills/centricmem-agent`. Mint `/connect?device=` first. Local `hermes mcp add --url https://mem.centricmem.com/mcp --auth oauth centricmem` only after that mint fails if this Hermes will receive the browser login.  **Not verified here, and the npm names are not it**: `hermes-cli` on npm is a travel-agency search tool and `hermes-agent` is a third-party bridge package, so neither is the product. The line above follows the published convention |
| Pi | `pi install https://github.com/zeyu-j/centricmem-skill`. Then URL-only `~/.pi/agent/mcp.json` (`url` + `type: streamable-http`). MCP is not auto-wired by the package. |
| OpenClaw | `openclaw plugins install centricmem-skill --marketplace zeyu-j/centricmem-skill` (verified: installed as a **bundle** 1.0.9). The `--marketplace` form is the one that works - a bare `openclaw plugins install git:...` is rejected with *missing `openclaw.extensions`*, because that route installs a code plugin and this repository ships no code. `openclaw skills install` also works from a clone: `openclaw skills install ./skills/centricmem-agent --global`. Not ClawHub. |
| DSH | Cordis **funnel** only. Needs `pnpm` (`npm i -g pnpm` if missing). Pin: `dsh plugin --profile web add github:zeyu-j/centricmem-skill#v0.21.72`. Then from the profile dir run `node node_modules/centricmem-skill/dsh/copy-skill.mjs` so `$DSH_HOME/skills/centricmem-agent` exists (funnel MCP does not load Skill from `node_modules`). Overlay Bearer on the same `id` in `$DSH_HOME/profiles/<profile>/cordis.patch.yml` (restate the whole config). New chat. Tools are `mcp__centricmem__cm_*`. Skill is MIT; [`dsh/`](./dsh/) is MIT glue. GitHub topic `dsh-plugin`. |
| Copilot CLI | `copilot plugin marketplace add zeyu-j/centricmem-skill` then `copilot plugin install centricmem-skill` |
| Kiro | Powers → Add Custom Power → GitHub `https://github.com/zeyu-j/centricmem-skill` |
| Grok Bot | Paste the one-liner. Shell is blocked, so send signup only; add `https://mem.centricmem.com/mcp` in that bot’s MCP settings (key from Keys, never in chat). |
| SkillKit | `skillkit add https://centricmem.com` or `skillkit add zeyu-j/centricmem-skill` |
| Any other Agent Skills host | Copy `skills/centricmem-agent/` so the file is `<skills-root>/centricmem-agent/SKILL.md`. Host MCP is streamable-HTTP at `https://mem.centricmem.com/mcp`. After device claim: `centricmem connect --claim --target <this-host-config.json>` (or `CENTRICMEM_MCP_TARGETS`). Confirm with `centricmem connect --verify`. Do not copy a key from another client's `mcp.json`. |
| skills.sh / SkillMD | `npx skills add` above, or `skillmd add zeyu-j/centricmem-skill` |

Then keep talking. After install, if `cm_*` tools are missing this agent (and each client you install into) sends signup **and** tries a `/connect?device=` link. Plugin `mcp.json` is not a completed connect. If minting that URL fails, run centricmem doctor connect and they email zeyu@poppyg.com with that output; then OAuth only if this agent will receive the browser login (Grok Bot / Manus may). Do not skip the connect URL because OAuth exists. WorkBuddy/CodeBuddy try the connect URL too. Do not download a settings file that contains a key. The agent tells you to save a backup of the key (it appears only once). You do not paste chats, tokens, or CLI.

Hosted librarian: [centricmem.com](https://centricmem.com). Sign up is open. Host MCP: `https://mem.centricmem.com/mcp`. Never paste keys in chat.

**Baseline = Skill + host MCP.** Plugin-tree hosts: refresh the loaded plugin with the host's own install tool (`install_source`-style, full URL `https://github.com/zeyu-j/centricmem-skill`, `kind: plugin`; see Skill REFERENCE). Lifecycle hooks (`AGENTS.md`, Stop remind, session-sweep scripts) are **optional** — agents without hooks (e.g. DSH) still file via Skill §4. Opening optional hooks is not part of public install; see Skill `REFERENCE.md` → Optional host hooks.

**Direct HTTP scripts** (not an MCP client): every request to `/mcp` **must** include a non-empty `User-Agent` header, or Cloudflare returns 403 error-1010. Example: `-H "User-Agent: centricmem-script/1.0"`. See Skill `REFERENCE.md` → Direct HTTP `/mcp`.

## How you use it

1. Keep talking where you already work. The agent’s own memories stay on. It says **once** which key this chat is using. Extra grants: tick shelves on **Keys**. Default opens every shelf.
2. If the library looks empty, the agent offers **once** to file notes you already have as cards. Capture stays. You may skip. It is not a dump of every chat.
3. When work is real, the agent files a Markdown card and keeps this chat’s transcript in object storage — you do not have to say wrap up. Closing the tab does not file; it files before it stops. Ask it to keep a file and write a card; a folder of originals is one import. Archive zip on the website is optional if you already packed one. If your Skill is behind this repo, the agent refreshes it with `npx skills add` (the current chat still uses the old copy). Plugin installs update via that client’s plugin UI.
4. Later, ask the agent — or log in to search and download originals. There is no Inbox: file into a named shelf. Leftover shelves (including leftover `unclassified`): the agent copies onto another shelf (`cm_copy`) then **deletes** the old one (`cm_delete`) — it does not download originals to this computer, and there is no restore warehouse. To move a **subset** of cards, the agent uses `cm_move` (default key). To delete or rename one card, `cm_delete` / `cm_rename` `{file, shelf}`. Extra keys cannot.

You do not run a librarian on this machine. You do not `setup --bootstrap`.

## What this repo is

This repository is the **Skill**: how agents talk to the hosted librarian.

- [`skills/centricmem-agent/SKILL.md`](./skills/centricmem-agent/SKILL.md) — session loop ([Agent Skills](https://agentskills.io/specification) frontmatter)
- [`skills/centricmem-agent/REFERENCE.md`](./skills/centricmem-agent/REFERENCE.md) — search, show, sweep, copy, move selected cards, rename a card title, delete leftover shelves or a card
- [`plugin.json`](./plugin.json) + [`mcp.json`](./mcp.json) — portable Agent Plugins 1.0 package
- [`.cursor-plugin/marketplace.json`](./.cursor-plugin/marketplace.json) — Cursor team marketplace
- [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json) — Claude Code marketplace
- [`.codebuddy-plugin/marketplace.json`](./.codebuddy-plugin/marketplace.json) — CodeBuddy / WorkBuddy marketplace (`codebuddy plugin marketplace add zeyu-j/centricmem-skill`)
- [`.kimi-plugin/plugin.json`](./.kimi-plugin/plugin.json) — Kimi Code Custom install from this GitHub URL
- Dify is a separate tool plugin: [zeyu-j/centricmem-dify](https://github.com/zeyu-j/centricmem-dify) (not this Skill repo)
- [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) — Codex marketplace
- [`.github/plugin/marketplace.json`](./.github/plugin/marketplace.json) — Copilot CLI marketplace
- [`.kiro/plugins/marketplace.json`](./.kiro/plugins/marketplace.json) — Kiro pin-sync catalog
- [`dsh/cordis.patch.yml`](./dsh/cordis.patch.yml) — DSH Cordis funnel (MIT glue, URL-only MCP, `failOnStartupError: true`). [`dsh/copy-skill.mjs`](./dsh/copy-skill.mjs) copies the Skill into `$DSH_HOME/skills/`. Skill is MIT. Not ClawHub.

It is not the librarian, not the CLI source, and not a self-hosted kit. One public Agent Skill: `centricmem-agent` (folder name) inside package `centricmem-skill`.


## goose

goose reads the plugin manifest at the root of this repository, so there is no host-specific folder to
look for:

```sh
goose plugin install https://github.com/zeyu-j/centricmem-skill
```

That imports the skill (`centricmem-skill:centricmem-agent`) and drops the repository under
`~/.agents/plugins/centricmem-skill/`. Verified against goose 1.51.0: it reports "Installed open-plugins
plugin", so the generic manifest is what goose consumes - unlike the hosts above, which each require a
folder named after them.

`goose/` adds two optional, MCP-only extras: a preflight recipe, a close recipe, and the ambient
refresher that keeps goose's per-turn context block current.

## License

[MIT](./LICENSE) — attribution required, commercial use allowed. The Skill was PolyForm Noncommercial through 1.0.6 and is MIT from 1.0.7; that earlier grant is not withdrawn retroactively. The Cordis patch in [`dsh/`](./dsh/) is separately [MIT](./dsh/LICENSE) so DSH can mount the hosted MCP client. That does **not** relicense `SKILL.md`.
**One correction worth keeping.** Codex was listed here as having no hook mechanism, on the strength of
`codex plugin --help` not mentioning hooks. Its documentation does: hooks live in `hooks.json` or inline
`[hooks]`, plugins may bundle a `hooks/hooks.json`, and the shape is the same one Claude uses. Absence in a
CLI's help is not absence of the feature - the flags a client exposes on a command line and the files it reads
at session boundaries are different surfaces, and only one of them was checked.

## What the plugin does beyond the Skill

Claude Code and OpenClaw install this repository as a plugin, and a plugin can carry more than skills. This
one carries a **SessionStart hook** (`hooks/hooks.json`) that runs a small Node script: it looks for a and a **SessionEnd hook**
credential in `CENTRICMEM_TOKEN`, `CENTRICMEM_API_KEY`, then a `centricmem/api.json` beside your config, and
if it finds one it prints the shelf's context so the model starts the session already oriented. With no
credential it prints nothing at all, which is the normal case on an OAuth-connected host. It never exits
non-zero, so a network problem can only mean a quieter session, never a broken one.

OpenClaw takes the same idea as a **hook pack**: `openclaw plugins install ./openclaw` from a clone. It
subscribes to the session event category, so it does not depend on an event name staying put, and
`openclaw hooks info centricmem-ambient` reports it ready.

goose does not use this hook - it has recipes and the MOIM file instead, in `goose/`.