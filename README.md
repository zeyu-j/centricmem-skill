# CentricMem

**One library. Every agent. Every desk.**

A hosted librarian for AI agents. Capture stays in the agent you already use. CentricMem organises and retrieves — Cursor, Claude Code, Codex, Hermes, Pi, OpenClaw, DSH, Copilot, Kiro, Kilo, CodeBuddy, Kimi Code, and the next one share the same shelf.

This repository is **one package**: [Agent Skills](https://agentskills.io) `SKILL.md` plus an [Agent Plugins 1.0](https://agent-plugins.org) bundle (`plugin.json` + `skills/` + `mcp.json`). Install it once from GitHub; each client uses its own command. Do not paste keys or marketplace JSON into chat.

## Install

Paste this to the agent (one line):

```
Install CentricMem from zeyu-j/centricmem-skill. After install, send https://centricmem.com/login?signup=1 and a /connect?device= URL — plugin mcp.json or mcp add with no Bearer is not a completed connect. OAuth is additive after that URL and does not replace it. If they already have a Bearer or a finished OAuth login in this agent, ask for a new chat — do not strip Bearer, do not mint a new connect URL. Cursor can use Add to Cursor on centricmem.com. Codex: mint the connect URL this turn; local mcp add then mcp login may follow. Loopback OAuth does not authenticate a cloud Codex. Tell them the key appears only once — save a backup; never paste keys. If connect or usage still fails, they email zeyu@poppyg.com (never a key).
```

If the shell works, a terminal in the project can run:

```bash
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
| Codex | Mint `/connect?device=` if `cm_*` are missing. Local `codex mcp add centricmem --url https://mem.centricmem.com/mcp` then `codex mcp login centricmem` is additive. Plugin: `codex plugin marketplace add https://github.com/zeyu-j/centricmem-skill.git` then install **centricmem-skill** in Plugins |
| Hermes | `hermes skills install zeyu-j/centricmem-skill/skills/centricmem-agent`. Mint `/connect?device=` if `cm_*` are missing. Local MCP: `hermes mcp add --url https://mem.centricmem.com/mcp --auth oauth centricmem` (or `auth: oauth` in `~/.hermes/config.yaml`) is additive. Bearer in `headers` only as paste fallback. |
| Pi | `pi install https://github.com/zeyu-j/centricmem-skill`. Then URL-only `~/.pi/agent/mcp.json` (`url` + `type: streamable-http`). MCP is not auto-wired by the package. |
| OpenClaw | Compatible **bundle** (Agent Plugins / Claude / Codex / Cursor). Not ClawHub. `openclaw plugins install git:github.com/zeyu-j/centricmem-skill` or `openclaw plugins install centricmem-skill --marketplace zeyu-j/centricmem-skill`. Do not add `openclaw.plugin.json`. |
| DSH | Cordis **funnel** only. `dsh plugin --profile web add github:zeyu-j/centricmem-skill` mounts URL-only `@deepseek-ai/dsh-mcp-client`. Overlay Bearer in `$DSH_HOME/profiles/<profile>/cordis.patch.yml` after `/connect?device=`. Skill stays PolyForm; [`dsh/`](./dsh/) is MIT glue. GitHub topic `dsh-plugin`. |
| Copilot CLI | `copilot plugin marketplace add zeyu-j/centricmem-skill` then `copilot plugin install centricmem-skill` |
| Kiro | Powers → Add Custom Power → GitHub `https://github.com/zeyu-j/centricmem-skill` |
| Grok Bot | Paste the one-liner. Shell is blocked, so send signup only; add `https://mem.centricmem.com/mcp` in that bot’s MCP settings (key from Keys, never in chat). |
| SkillKit | `skillkit add https://centricmem.com` or `skillkit add zeyu-j/centricmem-skill` |
| skills.sh / SkillMD | `npx skills add` above, or `skillmd add zeyu-j/centricmem-skill` |

Then keep talking. After install, if `cm_*` tools are missing the agent sends signup **and** a `/connect?device=` link. Plugin `mcp.json` is not a completed connect. OAuth is additive after that URL (Cursor can use Add to Cursor on [centricmem.com](https://centricmem.com); local Codex may use `codex mcp add` then `codex mcp login`; Hermes may use `hermes mcp add --auth oauth`). Do not skip the connect URL because OAuth exists. WorkBuddy/CodeBuddy get the connect URL. Do not download a settings file that contains a key. The agent tells you to save a backup of the key (it appears only once). You do not paste chats, tokens, or CLI.

Hosted librarian: [centricmem.com](https://centricmem.com). Sign up is open. Host MCP: `https://mem.centricmem.com/mcp`. Never paste keys in chat.

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
- [`dsh/cordis.patch.yml`](./dsh/cordis.patch.yml) — DSH Cordis funnel (MIT glue, URL-only MCP). Skill stays PolyForm. Not ClawHub.

It is not the librarian, not the CLI source, and not a self-hosted kit. One public skill: `centricmem-agent`.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — attribution required; no commercial use. The Cordis patch in [`dsh/`](./dsh/) is separately [MIT](./dsh/LICENSE) so DSH can mount the hosted MCP client. That does **not** relicense `SKILL.md`.
