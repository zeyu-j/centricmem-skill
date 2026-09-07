# CentricMem

**One library. Every agent. Every desk.**

A hosted librarian for AI agents. Capture stays in the agent you already use. CentricMem organises and retrieves — Cursor, Claude Code, Codex, Pi, and the next one share the same shelf.

## Install

```bash
npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g
```

Same layout for [skills.sh](https://skills.sh), the Skills CLI, and SkillMD (`skillmd add zeyu-j/centricmem-skill`): one folder per skill, `skills/centricmem-agent/SKILL.md`.

Then keep talking. After install, the agent tells you how you use it. You do not paste chats, tokens, or CLI.

Hosted librarian: [centricmem.com](https://centricmem.com). Sign up is open.

## How you use it

1. Keep talking where you already work. agent memories stay on.
2. When work is real, the agent files a Markdown card and keeps this chat’s transcript in object storage — you do not have to say wrap up. Closing the tab does not file; it files before it stops. If your Skill is behind this repo, the agent refreshes it with `npx skills add` (the current chat still uses the old copy).
3. Later, ask the agent — or log in to search and download originals. The agent uses host MCP (`https://mem.centricmem.com/mcp`). When a key is needed, the agent sends a `/connect?device=` link (`centricmem connect --device`, ten minutes). Enter that key on that page (default = every shelf, or an extra key for the shelves you granted), never in chat. Sign in for the dashboard — there is no “connect this computer” button. Originals and card delete stay on the dashboard. There is no Inbox: file into a named shelf. Leftover shelves (including leftover `unclassified`): the agent copies onto another shelf (`cm_copy`) then **deletes** the old one (`cm_delete`) — it does not download originals to this computer, and there is no restore warehouse.

You do not run a librarian on this machine. You do not `setup --bootstrap`.

## What this repo is

This repository is the **Skill**: how agents talk to the hosted librarian.

- [`skills/centricmem-agent/SKILL.md`](./skills/centricmem-agent/SKILL.md) — session loop ([Agent Skills](https://agentskills.io/specification) frontmatter)
- [`skills/centricmem-agent/REFERENCE.md`](./skills/centricmem-agent/REFERENCE.md) — search, show, sweep, copy, delete leftover shelves

It is not the librarian, not the CLI source, and not a self-hosted kit. One public skill: `centricmem-agent`.

## Agent Plugins

The same repo is an [Agent Plugins 1.0](https://agent-plugins.org) package for Codex, GitHub Copilot, Kiro, and other plugin clients:

- [`plugin.json`](./plugin.json) — portable manifest
- [`skills/`](./skills/) — Agent Skills
- [`mcp.json`](./mcp.json) — Streamable HTTP MCP at `https://mem.centricmem.com/mcp` (no token in git; the Skill sends `/connect?device=`)
- [`.codex-plugin/plugin.json`](./.codex-plugin/plugin.json) — Codex-native pointer at `./skills/` and `./mcp.json`

Codex can also add this repo as a marketplace source (`.agents/plugins/marketplace.json`).

GitHub Copilot CLI can add this repo as a marketplace:

```bash
copilot plugin marketplace add zeyu-j/centricmem-skill
copilot plugin install centricmem-skill
```

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — attribution required; no commercial use.
