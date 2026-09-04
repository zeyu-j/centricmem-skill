# CentricMem

**One library. Every agent. Every desk.**

A hosted librarian for AI agents. Capture stays in the agent you already use. CentricMem organises and retrieves — Cursor, Claude Code, Codex, Pi, and the next one share the same shelf.

## Install

```bash
npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g
```

Then keep talking. After install, the agent tells you how you use it. You do not paste chats, tokens, or CLI.

Hosted librarian: [centricmem.com](https://centricmem.com). Seats are invite-based today — not a public sign-up.

## How you use it

1. Keep talking where you already work. Cursor memories stay on.
2. When work is real, the agent files a Markdown card in your library and keeps this chat’s transcript in object storage.
3. Later, ask the agent — or log in to search and download originals.

You do not run a librarian on this machine. You do not `setup --bootstrap`.

## What this repo is

This repository is the **Skill**: how agents talk to the hosted librarian.

- [`skills/centricmem-agent/SKILL.md`](./skills/centricmem-agent/SKILL.md) — session loop
- [`skills/centricmem-agent/REFERENCE.md`](./skills/centricmem-agent/REFERENCE.md) — search, show, close

It is not the librarian, not the CLI source, and not a self-hosted kit.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — attribution required; no commercial use.
