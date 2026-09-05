# Changelog

Skill-facing notes for [centricmem-skill](https://github.com/zeyu-j/centricmem-skill). This repo is how to use the hosted librarian.

## 0.21.13

- One MCP Bearer can be an **account key**: the owner grants which libraries it may open (`library=` / `cwd=`). Friend-style pairing keys stay one library. Isolation is one key = its grants.
- Still no curl. Originals and key minting stay on the dashboard. Login session is not for agents.

## 0.21.12

- Agents use the cloud MCP URL `https://mem.centricmem.com/mcp` (pairing key as Bearer). stdio `centricmem-host` is only the fallback while that URL is down.
- Same `cm_*` tools. Still no curl. Originals stay on the dashboard.

## 0.21.11

- The agent talks to the librarian only through host MCP (`cm_health`, `cm_search`, `cm_keep`, …). It does not curl. Originals stay on the dashboard.
- After `centricmem setup --install-skill`, Cursor MCP is merged on this machine. A new chat picks up the tools.

## 0.21.10

- Sandbox MCP (`centricmem-host`) is the same librarian verbs as this Skill, including import / classify / index. Originals, delete, and account stay on the dashboard.

## 0.21.9

- The agent files when the work is real — you do not have to say wrap up. Closing the tab does not file; it files before it stops.
- If this Skill is behind GitHub, the agent runs `npx skills add` once. This chat still uses the loaded copy; the next chat uses the new one.

## 0.21.8

- Hosted `/ambient` is not your Skill version. If this file is old, re-run `npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g`.
- This GitHub repo ships the Skill only (install + how to use).

## 0.21.7

- At close, the agent keeps this chat’s transcript in object storage, then files units. You download originals from the dashboard.

## 0.21.4

- Capture stays in the agent you already use. CentricMem organises and retrieves on the hosted librarian.
