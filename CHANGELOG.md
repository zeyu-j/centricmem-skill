# Changelog

Skill-facing notes for [centricmem-skill](https://github.com/zeyu-j/centricmem-skill). This repo is how to use the hosted librarian.

## 0.21.30

- Leftover shelf removal is **delete**, not archive: `cm_copy` `{from,to}` then `cm_delete` `{id}`. There is no restore warehouse. The website Archive desk is the live card catalog. Extra keys may copy if both grants; only default/login may delete a leftover shelf. Card delete stays login-only.

## 0.21.29

- Organize leftover named shelves **on the librarian**: dest must exist (`cm_library` if needed). `cm_copy` `{from,to}` copies cards and attach originals (identical skip; collisions `imported/kept/from-<id>/`). Then `cm_archive` `{id}`. Never download originals to this computer. Extra keys may copy if both grants; only default/login may archive. Card delete stays login-only.

## 0.21.28

- If a key was pasted into a chat, the owner signs in and rotates it on Keys. The old secret dies. Agents never ask for the new one in chat.

## 0.21.27

- Refresh compares `metadata.version` (not a top-level `version` key). The installed Skill path is agent-neutral.

## 0.21.26

- Extra keys: authenticate so the owner enters the **default** key to mint a shelf. Connect does not create shelves. Inbox drain extras can `apply`.
- Packaging: Copilot CLI marketplace at `.github/plugin/marketplace.json`; Grok Build manifest at `.grok-plugin/plugin.json`; Codex `composerIcon` at `assets/icon.svg`. Swap that SVG (and the website favicon) when the logo changes.

## 0.21.25

- One agent-key type. Default (`*` = every shelf) is unique and renameable; it cannot be revoked. Extra keys grant one or more shelves and are uncapped. Login uniquely owns delete and billing. Website **Billing** shows the plan; after the first Stripe customer it opens the Customer Portal.

## 0.21.24

- MCP/HTTP accept `shelf=<id>` as an alias of `library=<id>`. Account JSON still has `libraries` and also `shelves`.

## 0.21.23

- Public names: **Library** (one per person) → **Shelf** (pairing-key vault) → **Card**. Agents pass `shelf=<id>` or `library=<id>`. Default account key = every shelf in this library. Pairing key = that shelf. Inbox is a system shelf, never a sweep target.
- Sign up is open. Install copy no longer says invite-only.

## 0.21.22

- `SKILL.md` follows the Agent Skills specification: `name`, `description` (what + when), `license`, `compatibility`, and `metadata` (version / CLI floor / changelog).
- This repo is also an Agent Plugins 1.0 package (`plugin.json` + `skills/` + `mcp.json`) for Codex, Copilot, and Kiro. MCP is `https://mem.centricmem.com/mcp` with no token in git. Codex-native pack: `.codex-plugin/plugin.json`.
- Still one public skill: `centricmem-agent`. Install remains `npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g`.

## 0.21.21

- Authenticate is always a `/connect?device=` link. The agent runs `centricmem connect --device` and sends only that URL. You have **ten minutes** to enter the key. Sign in at the website for the dashboard — there is no “connect this computer” button. Never paste a key into chat.

## 0.21.20

- Remote agents (VPS / Cloud Agent): the agent runs `centricmem connect --device` and sends only the printed `/connect?device=` URL. You have **ten minutes** to enter the key on that page. The secret never appears in chat. Then start a new chat there.
- On the computer in front of you, the agent still sends `https://centricmem.com/connect` (loopback helper). Never paste a key into chat.

## 0.21.19

- Login uniquely owns delete and billing. The **default** account key (all libraries) may mint, rename, grant, and revoke other keys — including every pairing key on a library. Pairing keys cannot. New tokens stay off chat (dashboard / CLI, not MCP).
- Attachments are metered per plan (Lite 100MB, Education 200MB, Pro 1GB, Ultra 10GB). Markdown is unlimited. Over quota, keep fails — the agent says so.

## 0.21.18

- The authenticate link accepts **any** agent key: default (every library) or a pairing key (that library). Default is one choice, not the only one.
- Not a one-click install. You enter the key on `https://centricmem.com/connect` — never in chat.

## 0.21.17

- When a key is needed, the agent sends the authenticate link `https://centricmem.com/connect`. You enter the key on that page — never in chat. Not a one-click install. The helper on this computer (`centricmem connect`) writes MCP for every agent.
- The owner's agents use the **default account key** (all libraries). Friend pairing keys stay one vault.

## 0.21.16

- `/connect` is for **every** agent: copy the same host MCP snippet (never paste a token in chat). CLI `centricmem connect` writes MCP configs it finds on this computer. Optional Cursor one-click is not the product.
- The owner's agents use the **default account key** (all libraries). Friend pairing keys stay one vault.

## 0.21.15

- Paste an agent key on **this computer** at `https://centricmem.com/connect` (Cursor opens an install prompt). Never paste a token in chat. CLI: `centricmem connect` writes `~/.cursor/mcp.json` from a local page.
- Owner Cursor still uses the default account key (all libraries). Friend pairing keys stay one vault.

## 0.21.14

- Sweep never writes Inbox (`unclassified`). Pick a named library, or mint one (`cm_library`) when none fits. Drain leftovers with classify — do not leave them for the human. Pairing keys still cannot mint a library.
- The owner's agent uses the **default account key** (all libraries). Friend pairing keys stay one vault.
- Still no curl. Originals and key minting stay on the dashboard.

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
