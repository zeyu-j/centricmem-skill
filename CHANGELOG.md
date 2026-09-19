# Changelog

## 0.21.79

- Extra agent keys may be **View only** (`mode: read`): search/show/list only; writes return 403. Mint or change on Keys / `account key --mode`. `cm_health` / `cm_ambient` surface `mode`. Default `*` and `share:` unchanged. Librarian **>=0.21.76**.

## 0.21.78

- Plugin `mcp.json` client `type` is **`http`** (Agent Plugins; wire remains streamable HTTP). Add another Agent Plugins client manifest that points at `./mcp.json`. REFERENCE: Writes table documents `supersedes` and **Edit a card** (delete + rewrite; no in-place edit). Skill refresh has a **no Node** path; connect mint failure prefers POST `/connect/device` before `doctor connect` when CLI is missing. `cm_health` `skill_install` mentions the no-Node alternative. Librarian CLI unchanged (**0.21.75**).

## 0.21.77

- Card **writing style** is the human + this agent — CentricMem only requires summary + key points (structure). Different agents on the same shelf write differently on purpose. Librarian CLI unchanged (**0.21.75**).

## 0.21.76

- Per-shelf **charter** is live on the librarian: `cm_library` list/mint, `cm_ambient` `libraries` rows, Keys + Library desk. Routing #0180 matches charter (fallback displayName). Max 280 characters; empty clears. Librarian **>=0.21.75**.

## 0.21.75

- Define **chunk** (accepted unit this reply) and **yield** (any reply end). Resume after context compress / checkpoint / new chat = new session: `cm_health` → `cm_ambient` first. Single-source §4 sweep + gate (Non-Micro + zero `cm_*` + no Don't log → sweep before yield). Adaptive vs wrap-up table. Slim SKILL; connect recipes stay in REFERENCE. CLI unchanged (**0.21.74**).

## 0.21.74

- Audit follow-up: browse-by-card / per-section writers, MCP 25MB keep binary, supersedes validation, drop legacy `centricmem-mcp`, MCP sessions re-check revoked keys. Librarian **>=0.21.74**.
Skill-facing notes for [centricmem-skill](https://github.com/zeyu-j/centricmem-skill). This repo is how to use the hosted librarian.

## 0.21.73

- Shelf routing (#0180): user explicit → charter/displayName match → path tiebreak only → mint with human-supplied name. Cite the matched line before write. Per-shelf charter shipped in Skill **0.21.76** / librarian **>=0.21.75**.

- Unknown Agent Skills hosts: copy `skills/centricmem-agent/` to `<skills-root>/centricmem-agent/SKILL.md`. After `centricmem connect --device --url-only`, finish with `connect --claim --target <that-host-config.json>` (or `CENTRICMEM_MCP_TARGETS`). Confirm with `connect --verify`. `doctor connect` prints a paste-ready block for zeyu@poppyg.com (never a key). Repo-root `install.json` is the machine-readable recipe. Do not scrape another client's `mcp.json` for a Bearer.
- Skill frontmatter `description` is trigger-only. Wording is "this agent (and each client you install into)".

## 0.21.72

- DSH: `dsh/cordis.patch.yml` sets `failOnStartupError: true` so a missing Bearer aborts boot instead of registering 0 tools. `dsh/copy-skill.mjs` copies this Skill into `$DSH_HOME/skills/` (DSH never scans `node_modules`). Pin `github:zeyu-j/centricmem-skill#v0.21.72`. Needs `pnpm` on PATH (`npm i -g pnpm` if missing). Overlay Bearer on the same MCP `id` and restate the whole config, then a **new chat**. Tools appear as `mcp__centricmem__cm_*`. Skip `cm_keep` — DSH has no plaintext transcript. Never `npx skills add -g` in DSH.

## 0.21.71

- After Approve, ChatGPT / Codex still waiting — they click **Open the agent callback**. Sign-in is not the grant; they pick which existing agent key (or mint a new extra) then Approve. Librarian **>=0.21.56**.
- ChatGPT Apps directory Skill is a Scan Tools snapshot of this folder from host MCP (`skills/list`), not a live GitHub pull. After a Skill bump: origin librarian **>=0.21.59**, then Scan Tools, then a new plugin version. Do not `npx skills add` inside ChatGPT to refresh the listed plugin.
- ChatGPT directory starter prompts (at most three, no `@mention`) are served from host MCP `prompts/list` on librarian **>=0.21.61**. If the portal Prompts tab stays empty after Scan Tools, paste those three lines; ChatGPT adds the plugin mention when it displays them.

## 0.21.70

- HTTPS OAuth callback not on the static allowlist: they request it at https://centricmem.com/oauth/callbacks (proof file or operator review). Librarian **>=0.21.55**.

## 0.21.69

- Codex / ChatGPT Mixed is not “OAuth plus paste a key”. Mixed tries unauthenticated `initialize` / `tools/list`; we 401 that. Pick OAuth for the browser, or Bearer in `http_headers` instead of OAuth.

## 0.21.68

- Every agent tries `/connect?device=` first. If minting that URL fails, they email zeyu@poppyg.com with the error (never a key); then MCP OAuth only if this agent will receive the browser login (Grok Bot / Manus may). A Loopback `127.0.0.1` callback does not count when this agent is not listening there.
- Librarian **>=0.21.51**. CLI **>=0.21.50**.

## 0.21.67

- First connect is signup + `/connect?device=` this turn. Already added is only a Bearer or a finished OAuth login in this agent — URL-only plugin / `mcp add` is first connect. Do not skip the device URL because `mcp login` exists. Loopback `127.0.0.1` does not authenticate a cloud or remote agent.
- Librarian **>=0.21.51**. CLI **>=0.21.50**.

## 0.21.66

- Codex MCP login: librarian accepts `/callback/<id>` (Codex CallbackSpecific). Approve hops through same-origin `/oauth/continue` then 302s to `127.0.0.1`. If Codex is still waiting, click **Open the agent callback**. Do not re-add the MCP URL with no Bearer.
- Librarian **>=0.21.51**. CLI **>=0.21.50**.

## 0.21.65

- Daily cards: `cm_import` `{items}` (a `bundle` that is `{items:[...]}` with no `version` is the same path). ImportBundle is `{version:1, lessons?, imported?, …}` — junk shapes name that contract. `skipExisting` skips a dest slug instead of `slug-2.md`.
- `cm_log_decision` `refs`: `1`, `0001`, `#0001`, or a comma list. Junk is 400.
- Copy asides `imported/kept/from-*` stay out of FTS (`cm_show` by path still works). Keep stubs 另存 on collision. `limit` caps browse and tags-only. Omit `cm_library` `id` to list shelves. `cm_index` reports `skipped`. `cm_move` `files=` is whole Markdown paths only; companion keep stubs and `- **Shelf**:` follow the card.
- Librarian **>=0.21.50**. CLI **>=0.21.50**.

## 0.21.64

- Codex still waiting after **Approve**: click **Open the agent callback** on the authorize page (the browser may block the jump to `127.0.0.1`). Do not re-add the MCP URL with no Bearer. Librarian **>=0.21.49**.
- CLI **>=0.21.48**.

## 0.21.63

- `cm_delete` `{file, shelf, heading}` removes one `##` section in `lessons.md` (notes stay sections, not one file per card). Do not pass `file#heading`. Same-title `cm_note` is an error — pick a new title, or delete that heading then rewrite. Import `dryRun` `files[].file` is the disk path apply will write.
- CLI **>=0.21.48**.

## 0.21.62

- If they already added a key or MCP URL in this agent, `cm_*` missing means a **new chat** — do not mint `/connect?device=` and do not tell them to add the URL with no Bearer (that drops the key). Ignore leftover `centricmem` on PATH when `connect --device` is missing (npm 0.14.x). First connect is unchanged.
- CLI **>=0.21.36**.

## 0.21.61

- If connect still fails after signup + `/connect?device=` / OAuth, or they have a usage problem the Skill cannot fix: tell them to email zeyu@poppyg.com (which agent + what they saw; never a key or token). Do not send that mail for them. Website legal/privacy mail stays poppy@poppyg.com.
- CLI **>=0.21.36**.

## 0.21.60

- Hermes: `hermes skills install zeyu-j/centricmem-skill/skills/centricmem-agent`, then prefer `hermes mcp add --url https://mem.centricmem.com/mcp --auth oauth centricmem` (`auth: oauth` in `~/.hermes/config.yaml`). Bearer headers only when OAuth is unavailable. Still send `/connect?device=` unless `cm_*` work.
- Pi: `pi install https://github.com/zeyu-j/centricmem-skill` (package.json `pi.skills`). MCP is URL-only in `~/.pi/agent/mcp.json` — not auto-wired.
- OpenClaw: install this repo as an Agent Plugins / Claude / Codex / Cursor **bundle**. Not ClawHub. Do not add `openclaw.plugin.json`.
- DSH: root `dsh.bundle` mounts [`dsh/cordis.patch.yml`](./dsh/cordis.patch.yml) (`@deepseek-ai/dsh-mcp-client`, URL only, MIT glue). Skill stays PolyForm. Overlay Bearer in the profile patch after `/connect?device=`. GitHub topic `dsh-plugin`.
- CLI **>=0.21.36** (guest `setup --install-skill` on CLI **>=0.21.46** also copies Claude and Pi skill homes).

## 0.21.59

- SKILL.md is the handover: When to Use plus three Typical Workflows (first connect, daily cite-and-file, empty shelf). REFERENCE holds client connect branches.
- Official 1Password Environments MCP never returns secret values. It cannot replace `/connect?device=` or OAuth, and must not reveal the agent key into chat. The human may store the Keys backup in a vault; the agent never reads it back.
- MCP aggregators, HashiCorp Vault, and AWS Secrets Manager are the same class: a customer who already has them may inject an extra key in their worker. They do not replace OAuth or `/connect?device=`.
- CLI **>=0.21.36**.

## 0.21.58

- Agents rename a card title with `cm_rename` `{file, shelf, title}` (optional `heading=` when the file has several `##` sections). File path stays. Decision numbers stay. Default key or login. Extra keys cannot. Shared shelves cannot. Humans can also rename on the Library desk.
- CLI **>=0.21.36**.

## 0.21.57

- Agents delete a single card with `cm_delete` `{file, shelf}` (library= also works). Always pass the shelf. Default key or login. Extra keys cannot. Shared shelves cannot. Leftover shelf delete stays `{id}`.
- After plugin install, if `cm_*` are missing the same reply must still send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL. Plugin `mcp.json` is not a completed connect. OAuth is additive.
- CLI **>=0.21.36**.

## 0.21.56

- After plugin install, if `cm_*` are missing the same reply must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL. Plugin `mcp.json` is URL-only — it is not a completed connect.
- WorkBuddy/CodeBuddy mint that connect URL this turn. Codex: `codex mcp add` then `codex mcp login` is additive; still send the connect URL unless tools already work.
- Never call librarian HTTP from the shell. Do not put `curl ` before an `https://` URL on the same SKILL.md line.
- CLI **>=0.21.36**.

## 0.21.55

- Host MCP is `https://mem.centricmem.com/mcp` only. Do not install or document a local connector.
- CLI **>=0.21.36**.

## 0.21.54

- Codex first path is `codex mcp add centricmem --url https://mem.centricmem.com/mcp` then `codex mcp login centricmem` (or the plugin `mcp.json`, same URL). Do not put a Bearer in `~/.codex/config.toml` when OAuth works.
- Do not download or hand an agent a settings file that contains a key. A URL-only `mcp.json` or Codex toml may be copied or opened.
- Cursor may still use Add to Cursor on https://centricmem.com (URL only). Paste-key and `/connect?device=` stay for hosts that cannot complete OAuth.
- CLI **>=0.21.36**.

## 0.21.53

- Cursor may use **Add to Cursor** on https://centricmem.com (URL only, no Bearer in the deeplink) then finish the browser prompt. Prefer `mcp.json` with `https://mem.centricmem.com/mcp` and no `Authorization`. Paste-key and `/connect?device=` stay for hosts that cannot complete OAuth.
- Do not curl OAuth endpoints.
- CLI **>=0.21.36**.

## 0.21.52

- If this client can complete MCP OAuth, add `https://mem.centricmem.com/mcp` **with no Bearer** and finish the browser prompt. Do not curl OAuth or librarian HTTP. Hermes, Grok, and the CLI still use `/connect?device=` or paste-Bearer.
- After Skill install, the same reply must still send https://centricmem.com/login?signup=1 and tell them to save a backup of the key — Keys shows it only once; never paste it in chat.
- CLI **>=0.21.36**.

## 0.21.51

- After Skill install, the same reply must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL, **and** tell them to save a backup of the key — Keys shows it only once; never paste it in chat.
- CLI **>=0.21.36**.

## 0.21.50

- After Skill install, the same reply must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL. Agents with a shell (Hermes) POST `https://mem.centricmem.com/connect/device` to mint that session; keep the secret off chat; claim and write Bearer to this agent’s MCP (`~/.hermes/config.yaml`). Signup-only stays for blocked shells (Grok). `connect --device` stays when `centricmem` is on PATH.
- CLI **>=0.21.36**.

## 0.21.49

- After Skill install, the same reply must send https://centricmem.com/login?signup=1 unless `cm_health` already works. A working terminal is not the CentricMem CLI — `connect --device` only when `centricmem` is on PATH. Hermes: `~/.hermes/skills/` and Bearer in `~/.hermes/config.yaml`.
- CLI **>=0.21.36**.

## 0.21.48

- Login uniquely owns card delete, billing, rotating the default key, and deleting the account (Billing). Never call account delete from MCP.
- Named shelves: Lite/Education 1, Pro 10, Ultra 50, Lifetime 1 20, Lifetime 2 100. Extra keys are uncapped.
- CLI **>=0.21.36**.

## 0.21.47

- Lifetime 1 sits between Pro and Ultra (2GB / 20 named shelves). Lifetime 2 is above Ultra (20GB / 100). Not Pro/Ultra pay-once. List is about five years of yearly.
- CLI **>=0.21.36**.

## 0.21.46

- Lifetime 1 is Pro, pay once (2GB / 20 named shelves). Lifetime 2 is Ultra, pay once (20GB / 100 named shelves). List is about five years of yearly.
- CLI **>=0.21.36**.

## 0.21.45

- Every card needs a **summary** (`title`, and `cm_done` `summary=`) and **key points** in the body. Title-only / keep stub / empty headings is not a card.
- CLI **>=0.21.36**.

## 0.21.44

- A titled keep stub is not filing. Keep the original, then `cm_note` whose **body is the key points** later agents `cm_show` (writing style, SOP, literature). Attachments are not searchable; do not load them.
- CLI **>=0.21.36**.

## 0.21.43

- The agent files. One or a few originals: `cm_keep` then `cm_note`. A folder: `cm_keep` `{card:false}` then one `cm_import` `{items}`. Do not send a zip through MCP. Archive **Upload zip** only if you already packed a zip or the agent cannot read the files.
- Ignore host `cm_doctor` saying the Skill is outdated — that is the librarian disk. Compare this file to `skill_latest` / GitHub.
- CLI **>=0.21.36**.

## 0.21.42

- Bulk ingest: stage cards and originals locally, then **one librarian commit**. Caps: 50 cards, 50 attachments, 32MB zip, 80MB uncompressed, 25MB per file (`cm_health` `package`). Agent: `cm_keep` `{card:false}` then one `cm_import` `{items}` with `attach` pointers. Do not send a zip through MCP. Humans upload the zip on Archive; each card names its shelf (`Shelf:` or a Tags token that is the shelf id).
- CLI **>=0.21.36**.

## 0.21.41

- `libraries=` may list `share:<accountId>:<slug>` when someone shared a named shelf with this email. Pass that id as `shelf=` exactly. Do not mint `share:`. Login and the default key (`*`) see invited shelves; extra keys do not. Copy onto a shelf you own; do not delete or move a shared shelf.
- Attachments and named shelves: Lifetime 1 is 2GB / 20 shelves; Lifetime 2 is 50GB / 1000. Monthly extra-shelf caps are unchanged. Extra keys stay uncapped.

## 0.21.40

- `cm_move` `{from,to,files}` relocates selected Markdown cards onto another named shelf. Source files are deleted. Decision numbers stay if free on dest, otherwise a new seq. Attachments re-attach on dest. Default key or owner login; extra keys cannot. Pick cards with `cm_search` / `cm_show`. Do not download originals to “move” them. `cm_copy` still copies a whole leftover shelf; card delete stays login-only.

## 0.21.39

- Hosted ambient/doctor: unmatched cwd or omitted `shelf=` is `library=(none)` plus `libraries=` — not the hub `use` pin. Pick a named shelf this turn (or mint). Extra keys with exactly one grant still open that shelf. Guests do not `--link`.
- After first `cm_health` this chat, say **once** which key (`*` = default / every shelf, else list extra grants). Suggest Keys grant ticks or minting an extra for another agent; authenticate default if this extra is too narrow. Never paste keys; never change grants via MCP.
- Unmatched cwd is not a shelf. If ambient is `library=(none)`, pick from `libraries=` or mint. Do not use the hub `use` pin.

## 0.21.38

- CodeBuddy / WorkBuddy: `.codebuddy-plugin/marketplace.json` (and `.workbuddy-plugin/` alias). Add with `codebuddy plugin marketplace add zeyu-j/centricmem-skill`.
- Kimi Code: `.kimi-plugin/plugin.json` plus a Custom catalog. Install with `/plugins install https://github.com/zeyu-j/centricmem-skill`. Host MCP Bearer is `CENTRICMEM_API_KEY` (never in chat). Official/Curated listing is a Moonshot PR — not a self-serve form.

## 0.21.37

- If the shell is blocked or `centricmem` is missing, do not retry CLI. Send https://centricmem.com/login?signup=1; the human adds `https://mem.centricmem.com/mcp` in this agent’s MCP settings (key from Keys, never in chat). `connect --device` stays the path when CLI works.
- Empty shelf: offer once to file existing durable memories as cards (capture stays; they may skip).
- Website copy prompt is one line.

## 0.21.35

- After `/connect?device=` writes cloud MCP, retry librarian tools **in this chat**. A new chat only if they still 401.

## 0.21.34

- A better shelf **label** (rebrand, leftover folder slug) is renamed this turn: default key `cm_library` `{id, displayName}`. The id stays. Extra keys cannot. Do not invent a prettier name. Humans can still rename on the Library desk.

## 0.21.33

- Guest `setup --install-skill` copies Skill files only (CLI >=0.21.25). It must not rewrite Host MCP from leftover catalog. If tools 401 after an older CLI did that, authenticate with a new `/connect?device=` link, then a new chat.
- One GitHub repo is the install surface for every Agent Skills / Agent Plugins client: Cursor (`.cursor-plugin/marketplace.json`), Claude Code (`.claude-plugin/marketplace.json`), Codex (`.agents/plugins/marketplace.json`), Copilot CLI, Kiro Powers (`.kiro/plugins/marketplace.json`), plus `npx skills add` for SKILL.md. Sweep, refresh, and deferred hold are agent-neutral.

## 0.21.32

- Humans rename a shelf **label** and browse every card on the Library desk. The shelf id stays (`shelf=` / folder / grants). Default key: `cm_library` `{id, displayName}` on an existing shelf updates that label. `cm_search` without `q` and with `shelf=` lists cards (one per file).
- Marketplace packaging: SkillKit well-known at `https://centricmem.com/.well-known/skills/`; HOL Plugin Scanner CI on this repo; Agent Plugins keywords include `agent-plugins` / `agent-skills`. The Agent Plugins directory already lists `centricmem-skill`.

## 0.21.31

- Librarian down or token failed: still compose the sweep and hold it (`CentricMem deferred sweep` + transcript path). File the hold when `cm_health` succeeds. Only skip if the human said don't log or they stopped using this Skill.

## 0.21.30

- There is no Inbox. Named shelves only. Writes without `shelf=` / `library=` / a cwd-link are 400 `LIBRARY_REQUIRED`. Leftover `unclassified` on an old hub: `cm_copy` `{from:unclassified,to:<named>}` then `cm_delete`. Never copy **to** Inbox. Dropped `cm_inbox` / `cm_classify`.
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

- Agents use the hosted MCP URL `https://mem.centricmem.com/mcp` with the appropriate agent credential.
- Same `cm_*` tools. Still no curl. Originals stay on the dashboard.

## 0.21.11

- The agent talks to the librarian only through host MCP (`cm_health`, `cm_search`, `cm_keep`, …). It does not curl. Originals stay on the dashboard.
- After `centricmem setup --install-skill`, Cursor MCP is merged on this machine. A new chat picks up the tools.

## 0.21.10

- The hosted MCP exposes the same librarian verbs as this Skill, including import, classify, and index. Originals, delete, and account stay on the dashboard.

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
