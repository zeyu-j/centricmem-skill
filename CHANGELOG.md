# Changelog









## 1.0.19

- A machine can end up with this Skill twice, and now it says so. `scanSkillCopies()` walks the roots we have actually seen a copy in - the hub (`~/.agents/skills`), Hermes (`%LOCALAPPDATA%\hermes\skills`) and a private desktop agent of ours - reads each copy's version, and reports duplicates and stragglers. `cm_doctor` carries it as `skill_copies`. On this machine it found three copies and two of them stale: the hub at 1.0.18, Hermes and that agent still at 1.0.14.
- `tools/prune-duplicate-skill.mjs` prints that plan and, with `--apply`, removes the copies it named - it only ever touches centricmem copies, never another Skill, and a symlink is never followed (a machine with junctions can loop).
- REFERENCE gains "One core, one source": keep the newest copy, refresh the plugin copy your host actually loads, and treat the hub as the fallback for hosts that cannot take a plugin. The open skills CLI writes a hub copy on every install, so two copies is a normal machine state - a stale pair is not.

## 1.0.18

- DeepSeek Harness moves from "waiting for a session" to documented. Its `dsh-skill-filesystem` reads `<agentsHome>/skills` - `~/.agents/skills`, the hub the open skills CLI installs into - so `centricmem-agent` is picked up with nothing dsh-specific. And `dsh-hooks-claude-code` is a bridge that runs a Claude Code `hooks.json` on dsh's interception seams (`SessionStart`, prompt and tool pre/post, `Stop`, subagent) while substituting `${CLAUDE_PLUGIN_ROOT}` for its `pluginRoot` setting: this package's `hooks/hooks.json` therefore runs there unchanged. `dsh/README.md` records both, plus the fact that `dsh plugin add` needs a TTY.

## 1.0.17

- ZCode (zai-org, 0.16.9) is verified the same way CodeBuddy was: it ships a CLI at `resources/glm/zcode.cjs`, and `zcode plugins marketplace add zeyu-j/centricmem-skill` followed by `zcode plugins install centricmem-skill@centricmem` installs this package. ZCode preloads the Claude Code marketplace, which is why the same repository works for it unchanged.
- Kimi Code: the MCP facts are now right. Servers live in `~/.kimi-code/mcp.json` (or `$KIMI_CODE_HOME/mcp.json`) plus a project `.kimi-code/mcp.json`, with stdio, HTTP and SSE transports, and a plugin may carry Agent Skills, an auto-loaded Skill and MCP servers. Its plugin manager is `/plugins` with a Custom tab that installs from a URL.
- Muse (`dev.meta.ai/install.sh`) refuses Windows outright (`muse: unsupported platform: MINGW64_NT`), recorded with omp.sh as a Linux/macOS-only client rather than left as an untested row.

## 1.0.16

- Qwen Code joins the verified list. Its hooks are real - `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `Stop` and more, configured in `.qwen/settings.json` - and a `SessionStart` hook adds context by printing `{"hookSpecificOutput": {"additionalContext": …}}`. `qwen/ambient-hook.mjs` is the same shared ambient implementation the other wrappers use, in Qwen's shape, and the example settings block is in `qwen/settings-hooks.example.json`. It runs in the smoke job on Linux and macOS with the other three.
- Devin gets a folder that says what is true and stops there: its CLI has `skills`, `plugins`, `mcp` and `doctor`, but `docs.devin.ai/cli/extensibility/*` renders only navigation without JavaScript, so no manifest is shipped and the install stays `devin mcp` plus the open skills CLI.
- Cline's row notes the shortcut: `cline skill add …` forwards to the same open skills CLI, so its Skill install is one command.

## 1.0.15

- `cm_health` and `cm_doctor` now say how the caller authenticated: `auth=oauth|bearer|missing` plus `keyFp`, the first 12 hex of the presented key - the same fingerprint the new-network notices already print. A stale environment on the host looked exactly like an unrotated key; the fix is a comparison, not a guess. The contract table keeps the 12 honest.
- The Skill sends an agent to compare three fingerprints before calling a key unrotated: the card, the process environment, and whether this host is on OAuth at all. That was the wrong turn we took ourselves.
- The Grok row now names the path that works: `grok.com/connectors` → Custom → the hosted URL, or the CLI with an explicit `-t http`. Without it Grok declares the server as **stdio** - a server that exists in the config and cannot run - which is what "MCP server does not exist" described.
- REFERENCE gained a host-side checklist for the things only a host can fix (connected-but-not-callable, secrets that never reach the process, stale bridge tokens, per-session MCP resets), and the rule that a localhost OAuth callback cannot be moved to another machine.
- The `dsh/` pin moved from `#v0.21.72` to the current release: every `v0.21.x` tag points at the same pre-1.0 snapshot, so that funnel was installing a 1.0.6-era copy.

## 1.0.14

- The root bundle manifest and the Grok manifest never pointed at the MCP server. `plugin.json` listed the name, version and licence and stopped there, and the Grok manifest copied that shape, so a host reading it found a Skill and no server - which is what "MCP server does not exist" means. Both now carry `"mcpServers": "./mcp.json"`, the way the Cursor, Codebuddy and Kimi manifests already did.
- The README dropped its goose section: goose reads the root manifest, the recipe and refresher folder is documented in `VERIFIED-OPTIMISATIONS.md`, and a second telling said less than the first.
- Licence history moved into the README licence section and `LICENSE-NOTES.md` is gone. `LICENSE` stays the verbatim MIT text on purpose - that file is what licence detectors read, and our own gate refuses the word PolyForm inside it - but a whole file for three sentences was one file too many.

## 1.0.13

- Hermes is **verified**, not documented. `hermes skills install zeyu-j/centricmem-skill/skills/centricmem-agent --yes` lands the Skill in `%LOCALAPPDATA%\hermes\skills` and `hermes skills list` reports `1 hub-installed`; without `--yes` a non-TTY host cancels it silently. Its shell hooks are verified too, and `hermes/` now carries them with a README: the reply to `pre_llm_call` must be JSON (`{"context": …}` - a bare string is dropped as `parsed: <none>`), and an entry that is not allowlisted never fires, which `hermes hooks doctor` will say.
- Hermes keeps its config where `HERMES_HOME` points - on Windows `%LOCALAPPDATA%\hermes`, not `~/.hermes`. The docs said `~/.hermes/config.yaml`; that file is ignored on Windows, which cost an hour.
- A private client of ours had been serving 0.21.90 since the day it was installed, with nothing to say so. Refreshed in place to this release with its own plugin tool, and its plan output turned out to be a useful second opinion: it reports which capabilities it maps and warns that it is about to register shell hooks that run during its sessions. It runs the shared `hooks/hooks.json` - `SessionStart` and `SessionEnd` both active - so it needs no folder of its own. Its name stays out of this repository on purpose; the record lives with the private host-ops notes.
- Cursor and Grok share one row now, the way CodeBuddy Code and WorkBuddy do, because a wrapper that reads the same core does not need its own line.
- The evidence moved out of the README. `VERIFIED-INSTALLS.md` holds every client we installed into with the command and the answer it gave; `VERIFIED-OPTIMISATIONS.md` holds the hooks, recipes and refreshers built on top. The README keeps the install instructions and points at both.
- Marks are defined once, and one is new: ✅ verified, ◐ same core as the CLI (the CLI was verified, this wrapper was not exercised), 📄 documented. **One core, one test** - a GUI or IDE is not re-tested for the CLI's sake, except for browser and OAuth hops, session-end behaviour, and wrappers that ship their own snapshot of the core.
- The licence history moved to `LICENSE-NOTES.md`: what changed at 1.0.7, what the grant does not reach, and why `dsh/` carries its own. `LICENSE` stays the verbatim MIT text, which is also what tools read.
- `npm run sync:skill` now exists. The version gate has always said "run the Skill sync" when a bundled copy drifts, and there was no such command - it was done by hand, which is how the copies drifted. It copies the public `SKILL.md` into all four copies and reports the ones it changed.
- The Skill frontmatter floors now say which numbering they use: they are 0.21.x numbers from the pre-1.0 line, and every 1.0.x satisfies them. They read as if the floors were newer than the current release, which they are not.

## 1.0.12

- The SessionEnd hook is host-side. It calls the CLI to file the session, which on a guest stops with
  the message that it cannot write the leftover hub, and points at import or MCP instead. So on a machine
  talking to a hosted librarian the hook stays silent and the agent files the card, which is what the Skill
  already asks for. The hook was not rewritten to post a card itself: a hook has not read the session, and a
  card summary states the key points rather than a placeholder.
- Codex caches the marketplace snapshot, so its install instructions now include refreshing that snapshot
  after a release. An install left alone kept serving 1.0.9 after 1.0.11 was published, and nothing said so.
- OpenClaw has no session-end event (its session events are compact, auto-reset and patch), so its pack
  contributes context at the start of a session and nothing else, which its own HOOK.md now records.
- Hermes stays documented rather than verified, and now says why: the npm names are a travel-agency search
  tool and a third-party bridge, not the product. pi has no lifecycle hook surface, and Kiro CLI is not the
  Kiro IDE; both are recorded where their rows are.

## 1.0.11

- Every host-specific folder is now named from the general package. SKILL and REFERENCE carry a short table
  pointing at `hooks/` (Claude Code, Codex), `goose/`, `openclaw/` and `tools/ambient.mjs`, so an agent can find
  the optional extras for its own host instead of having to be told they exist. Codex's hooks were documented
  here as absent: they are not. A plugin may bundle `hooks/hooks.json`, the same file Claude reads, with
  `SessionStart` and `SessionEnd` among its events - so one file now serves both, and the pair is complete
  (ambient at the start, session filing at the end).

## 1.0.10

- The Claude Code plugin now carries a SessionStart hook: a small Node script that reads a credential
  if this machine has one and prints the shelf's context before the model answers, so a session starts
  oriented instead of asking. With no credential it prints nothing, which is the normal case on an
  OAuth-connected host, and it never exits non-zero, so a network problem can only mean a quieter session.
  Plugin hooks ship in hooks/hooks.json; the plugin version has to change for a client to re-cache them.

## 1.0.9

- The consent page now answers the question OAuth leaves open. OAuth covers the host and leaves no key
  to copy, so after approving, the page says what covers the CLI, a hook or another machine, and links to
  where an agent key is made.
- `centricmem oauth clients` (operator, read-only) lists the OAuth registrations and marks which callbacks
  are already allowed. "Which host still needs allowing" is now a command rather than a support email,
  and it says a guest machine is not the librarian host instead of printing an empty table.
- `npm run sync:origin` compares the API host's static pages by checksum and copies only what drifted. Its
  first run found three pages out of date; its second was a no-op. The nginx template in that folder is
  deliberately excluded, because the live snippet carries its own additions.

## 1.0.8

- The health score stops reading a review queue as sickness: same-topic decisions are still listed, but their penalty is capped, so a shelf with pairs to review reads healthy instead of zero (0220's point, now agreed by the score).
- Line endings are declared in `.gitattributes` and the file git had silently marked binary is now pure LF: a one-line edit produces a one-line diff again.
- `npm run bump -- x.y.z` performs the version map AND rebuilds before running the gates - forgetting that step is what broke the 1.0.7 test run.
- Housekeeping: the shelf's active_context was about 40 days stale and is refreshed; the origin's dist backups went from 23 to the 3 newest (32 MB to 4 MB); the two dead centricmem-pending directories and the leaked test-fixture api.json are gone.
## 1.0.7

- The public Skill is **MIT** from 1.0.7: commercial use allowed, copyright notice kept. It was PolyForm Noncommercial through 1.0.6 and that grant is not withdrawn retroactively. The CentricMem name and the hosted librarian are not part of the grant.
- Host-specific operational detail is served on request (`cm_ops`, 15.3 KB) rather than shipped in every copy; the canonical MCP object is written once instead of four times.
- New-IP notices name the calling agent (registered OAuth client first, then the writer header), and the operator log carries it too.
- A dead MCP session is named as such - probe, re-handshake, retry - instead of looking like a bad key; unreachable memory says so and never falls back to a local hub.
- The verb gate now compares the app routes, the origin snippet and the MCP gateway table, which is how `cm_ops` was caught answering "Unknown librarian path".

## 1.0.6

- A dead MCP session is now named as such (probe, re-handshake, retry) instead of being mistaken for a bad key, and unreachable memory has an explicit contract: say so, keep working, never fabricate.
- Host-specific install, refresh and failure detail is served on request (cm_ops) rather than shipped in the public copy. The canonical MCP object is written once instead of four times.
- The ambient refresh stops at the librarian instead of falling back to the local hub, where a stale reading could arrive labelled healthy.
- The Skill title no longer carries a version number (it had drifted three releases behind the metadata).

## 1.0.5

- guest HTTP: the shelf travels as `?library=` on reads (a guest `search -p` returned every shelf before), and a host with no key is told so instead of being told the librarian is unreachable.
- `GET /distill`: a guest can read distill suggestions over HTTP; rewriting AGENTS.md Global Rules still needs the host.
- OAuth: a callback mismatch is now actionable and logged, loopback paths get the slack hosts need (trailing slash, one extra segment), and the consent page offers the device flow when a request is rejected.
- Redaction: the auth-scheme rule requires a 20+ character value, so it stops eating the word after "Bearer" in prose.
- Gates: `npm run check:verbs` proves every verb in VERB_ROUTES has a public nginx location (or a declared host-only reason), checked against docs/origin/; both it and the guest POST shelf contract run in `npm test`.
- `centricmem status --json` prints the guest / workspace / project status as JSON.

## 1.0.4

- **Skill 1.0.4 / CLI 1.0.4** (one number). No Skill body change: the fixes are on the CLI and the librarian, not in how an agent files. Guest HTTP now resolves the key in the order the Skill already documents (env -> claimed `mcp.json` -> catalog/`api.json`), `-p` / `--library` actually scopes guest reads, and the credential redactor no longer eats the word after the auth scheme.
- The librarian ships the matching read path: `GET /distill`, so a guest can read the distill suggestions its ambient recommends (`centricmem promote --from-distill`) instead of being told to run a host-only command. Rewriting `AGENTS.md` still belongs to the host that owns the file.

## 1.0.3

- **Skill 1.0.3 / CLI 1.0.3** (one number). The Skill body now says what the API actually writes: `cm_import` `items=` adds cards under `imported/kept/`, while `cm_import` `bundle: {version: 1, ...}` is the full ImportBundle and also writes **library files** - `context` -> `active_context.md` (the shelf current focus), `rules` -> `AGENTS.md` Global Rules - plus `decisions` / `lessons` / `sessions` / `imported` / `research`. A key that can open a shelf can write those; it was never host-only.
- The CLI ships the matching hardening: an unknown top-level bundle slot is a `400 BAD_IMPORT_BUNDLE` naming the slot and the allowed list, instead of being dropped silently.

## 1.0.2

- **Skill 1.0.2 / CLI 1.0.2** (one number again). No Skill body change: the CLI shipped the guest-read crash fix, a shared `fetchWithDeadline`, a clean `npm audit` and the DSH pin bump; REFERENCE.md no longer names a side-copy path nothing writes.

## 1.0.1

- **One number again: Skill 1.0.1 / CLI 1.0.1.** No Skill body change; the CLI shipped two fixes (see the CLI CHANGELOG). The Skill is renumbered because the Skill and the CLI carry one number per release.

- **One number for the Skill and the CLI.** From here on the Skill and the CLI ship the same version, and this repo is the truth source for it (`install.json` `skill`/`cli`, `package.json`, the SKILL.md frontmatter, and the plugin manifests all say `1.0.0`). This is package bookkeeping only - it is not a statement about hosted-service availability.
- Credential handling (folded in from 0.21.93): never echo a key value. Confirm a key with a fingerprint (`9352... len=64 fp=5E4ED29C`), never by dumping `mcp.json` / `config.toml` / `*.env` whole, and never redact by length threshold (short keys slip through). If a key reaches the transcript, say so in that turn and rotate it.
- New-network notice (CLI 1.0.0): a key used from a network we have not recorded for it emails its owner once - source IP, coarse edge location from our edge provider, and the client name the caller reported, never the key. IPv4 groups by `/24`, IPv6 by `/64`, at most 5 notices per key per hour, and `CENTRICMEM_IP_ALERT=off` disables them. A shared shelf key notifies the shelf owner.

## 1.0.0

## 0.21.93

- Credential handling hardened (agent side): **never echo a key value.** Confirm a key with a fingerprint (`9352... len=64 fp=5E4ED29C`), never by dumping `mcp.json` / `config.toml` / `*.env`, and never by redacting on a length threshold - short keys slip through it. Adds fingerprint idioms and blast-radius + rotation steps. Librarian CLI unchanged (**0.21.80**).

## 0.21.92

- Install copy clarifies names: `centricmem` = product/CLI; `centricmem-skill` = this GitHub package; `centricmem-agent` = Agent Skill folder (`--skill` / path). Not a rename. Librarian CLI unchanged (**0.21.80**).

## 0.21.91

- Skill refresh: install morphologies (hub body / junction reuse / parallel body). Hosts outside that list must discover and remember this client’s load path and refresh only that tree — do not invent a shared hub or unify sibling copies. Librarian CLI unchanged (**0.21.80**).

## 0.21.90

- Findability: SKILL.md opens with a five-line Do not summary. After a disk refresh, re-read SKILL + Do not before the next write. §2 and Skill refresh stress load path ≠ refresh path; optional inventory for sibling copies; the host's install tool often fails a rename while the host is running — file-level overwrite still works, then sync plugin-packages.json. cm_search takes q (not query). Librarian CLI unchanged (**0.21.80**).

## 0.21.89

- Skill refresh: description asks agents to compare the loaded copy vs skill_latest on session start. Plugin-tree hosts prefer the host's install_source tool with the full URL https://github.com/zeyu-j/centricmem-skill (kind plugin; dry-run then apply); read version from the plugin package.json, not ~/.agents. Limits: detect, install, ask human to restart — this chat keeps the already-loaded Skill. Librarian CLI unchanged (**0.21.80**).

## 0.21.88

- Optional host hooks are documented as weakly coupled to the Skill: baseline remains Skill section 4 + cm_*. Agents without hooks still file normally. REFERENCE covers L1-L3 roles; guest leftover-hub log-session hooks stay unsupported. On a host whose Stop event is observation-only, session auto-file needs an optional script, not a Stop continue. Librarian CLI unchanged (**0.21.80**).

## 0.21.87

- MCP JSON responses include `charset=utf-8`. `cm_import` stamps `logged_by` from the request writer when `imported[].agent` is omitted; identical re-imports report `unchanged` (not `updated`). `workSiblings` is always a number (collapsed matches in this result set; not total cards for the work). Doctor shows CLI token source. Direct `/mcp` scripts **must** send a non-empty `User-Agent` (else Cloudflare 403). Librarian **>=0.21.80**.

## 0.21.86

- Import dry-run/apply share created/updated counts; same `rel_path` without `external_id` is updated; `files[]` lists actions. `imported[].agent` stamps `logged_by` (default migration). `cm_show` remaps bare `rel_path` to `imported/...`. Guest CLI `import`/`index` use librarian HTTP when a Bearer is set. Librarian **>=0.21.79**.

## 0.21.85

- MCP opts for ACP agents: prefer `cm_ambient` with `shelf=` first (`cm_health` only when tools missing / connect / ambient unhealthy). Browse lists default to 50. Librarian **>=0.21.78** (ambient Conflicts capped; short MCP `content` + full `structuredContent`; lean search rows; shorter write-tool descriptions).

## 0.21.84

- Import shapes hard-warn: top-level `items=` creates daily `imported/kept/`; upsert corpus paths need `bundle.version:1` + `imported[].rel_path`. Hosted shelf is not a local junction; import then `cm_index`. Librarian CLI unchanged (**0.21.77**).

## 0.21.83

- Bearer table: `%LOCALAPPDATA%\centricmem\centricmem.mcp.json` + redact rule; Search and show: `cm_show` + `heading=` (first match); omit `q` + `shelf=` lists cards; a plugin refresh replaces the whole package metadata. Librarian CLI unchanged (**0.21.76**).

## 0.21.82

- Skill refresh: update the copy **this host loads**. `npx skills add -g` writes `~/.agents` and does **not** update a host's own plugin tree. `cm_ambient` with `shelf=` shapes Recent/Session. Missing `charter` on a library row means unset (fall back to displayName). Librarian CLI unchanged (**0.21.76**).

## 0.21.81

- Clarify Bearer layers: docs/plans/git use `${CENTRICMEM_API_KEY}` or URL-only; `connect --claim` may write plaintext Bearer to private local MCP files; host `sends auth headers` high-risk is about apply/probe, not a ban on claim. Librarian CLI unchanged (**0.21.76**).

## 0.21.80

- Reach clarifies **remote/cloud is not paste-key-only**: OAuth when this agent receives the browser login; Bearer only when it cannot; sandbox claim EPERM ??? human claim outside / OAuth / paste in settings. Librarian CLI unchanged (**0.21.76**).

## 0.21.79

- Extra agent keys may be **View only** (`mode: read`): search/show/list only; writes return 403. Mint or change on Keys / `account key --mode`. `cm_health` / `cm_ambient` surface `mode`. Default `*` and `share:` unchanged. Librarian **>=0.21.76**.

## 0.21.78

- Plugin `mcp.json` client `type` is **`http`** (Agent Plugins; wire remains streamable HTTP). Add another Agent Plugins client manifest that points at `./mcp.json`. REFERENCE: Writes table documents `supersedes` and **Edit a card** (delete + rewrite; no in-place edit). Skill refresh has a **no Node** path; connect mint failure prefers POST `/connect/device` before `doctor connect` when CLI is missing. `cm_health` `skill_install` mentions the no-Node alternative. Librarian CLI unchanged (**0.21.75**).

## 0.21.77

- Card **writing style** is the human + this agent ???????? CentricMem only requires summary + key points (structure). Different agents on the same shelf write differently on purpose. Librarian CLI unchanged (**0.21.75**).

## 0.21.76

- Per-shelf **charter** is live on the librarian: `cm_library` list/mint, `cm_ambient` `libraries` rows, Keys + Library desk. Routing #0180 matches charter (fallback displayName). Max 280 characters; empty clears. Librarian **>=0.21.75**.

## 0.21.75

- Define **chunk** (accepted unit this reply) and **yield** (any reply end). Resume after context compress / checkpoint / new chat = new session: `cm_health` ???????? `cm_ambient` first. Single-source ???4 sweep + gate (Non-Micro + zero `cm_*` + no Don't log ???????? sweep before yield). Adaptive vs wrap-up table. Slim SKILL; connect recipes stay in REFERENCE. CLI unchanged (**0.21.74**).

## 0.21.74

- Audit follow-up: browse-by-card / per-section writers, MCP 25MB keep binary, supersedes validation, drop legacy `centricmem-mcp`, MCP sessions re-check revoked keys. Librarian **>=0.21.74**.
Skill-facing notes for [centricmem-skill](https://github.com/zeyu-j/centricmem-skill). This repo is how to use the hosted librarian.

## 0.21.73

- Shelf routing (#0180): user explicit ???????? charter/displayName match ???????? path tiebreak only ???????? mint with human-supplied name. Cite the matched line before write. Per-shelf charter shipped in Skill **0.21.76** / librarian **>=0.21.75**.

- Unknown Agent Skills hosts: copy `skills/centricmem-agent/` to `<skills-root>/centricmem-agent/SKILL.md`. After `centricmem connect --device --url-only`, finish with `connect --claim --target <that-host-config.json>` (or `CENTRICMEM_MCP_TARGETS`). Confirm with `connect --verify`. `doctor connect` prints a paste-ready block for zeyu@poppyg.com (never a key). Repo-root `install.json` is the machine-readable recipe. Do not scrape another client's `mcp.json` for a Bearer.
- Skill frontmatter `description` is trigger-only. Wording is "this agent (and each client you install into)".

## 0.21.72

- DSH: `dsh/cordis.patch.yml` sets `failOnStartupError: true` so a missing Bearer aborts boot instead of registering 0 tools. `dsh/copy-skill.mjs` copies this Skill into `$DSH_HOME/skills/` (DSH never scans `node_modules`). Pin `github:zeyu-j/centricmem-skill#v0.21.72`. Needs `pnpm` on PATH (`npm i -g pnpm` if missing). Overlay Bearer on the same MCP `id` and restate the whole config, then a **new chat**. Tools appear as `mcp__centricmem__cm_*`. Skip `cm_keep` ???????? DSH has no plaintext transcript. Never `npx skills add -g` in DSH.

## 0.21.71

- After Approve, ChatGPT / Codex still waiting ???????? they click **Open the agent callback**. Sign-in is not the grant; they pick which existing agent key (or mint a new extra) then Approve. Librarian **>=0.21.56**.
- ChatGPT Apps directory Skill is a Scan Tools snapshot of this folder from host MCP (`skills/list`), not a live GitHub pull. After a Skill bump: origin librarian **>=0.21.59**, then Scan Tools, then a new plugin version. Do not `npx skills add` inside ChatGPT to refresh the listed plugin.
- ChatGPT directory starter prompts (at most three, no `@mention`) are served from host MCP `prompts/list` on librarian **>=0.21.61**. If the portal Prompts tab stays empty after Scan Tools, paste those three lines; ChatGPT adds the plugin mention when it displays them.

## 0.21.70

- HTTPS OAuth callback not on the static allowlist: they request it at https://centricmem.com/oauth/callbacks (proof file or operator review). Librarian **>=0.21.55**.

## 0.21.69

- Codex / ChatGPT Mixed is not ???????OAuth plus paste a key??????. Mixed tries unauthenticated `initialize` / `tools/list`; we 401 that. Pick OAuth for the browser, or Bearer in `http_headers` instead of OAuth.

## 0.21.68

- Every agent tries `/connect?device=` first. If minting that URL fails, they email zeyu@poppyg.com with the error (never a key); then MCP OAuth only if this agent will receive the browser login (Grok Bot / Manus may). A Loopback `127.0.0.1` callback does not count when this agent is not listening there.
- Librarian **>=0.21.51**. CLI **>=0.21.50**.

## 0.21.67

- First connect is signup + `/connect?device=` this turn. Already added is only a Bearer or a finished OAuth login in this agent ???????? URL-only plugin / `mcp add` is first connect. Do not skip the device URL because `mcp login` exists. Loopback `127.0.0.1` does not authenticate a cloud or remote agent.
- Librarian **>=0.21.51**. CLI **>=0.21.50**.

## 0.21.66

- Codex MCP login: librarian accepts `/callback/<id>` (Codex CallbackSpecific). Approve hops through same-origin `/oauth/continue` then 302s to `127.0.0.1`. If Codex is still waiting, click **Open the agent callback**. Do not re-add the MCP URL with no Bearer.
- Librarian **>=0.21.51**. CLI **>=0.21.50**.

## 0.21.65

- Daily cards: `cm_import` `{items}` (a `bundle` that is `{items:[...]}` with no `version` is the same path). ImportBundle is `{version:1, lessons?, imported?, ???????}` ???????? junk shapes name that contract. `skipExisting` skips a dest slug instead of `slug-2.md`.
- `cm_log_decision` `refs`: `1`, `0001`, `#0001`, or a comma list. Junk is 400.
- Copy asides `imported/kept/from-*` stay out of FTS (`cm_show` by path still works). Keep stubs ?????????? on collision. `limit` caps browse and tags-only. Omit `cm_library` `id` to list shelves. `cm_index` reports `skipped`. `cm_move` `files=` is whole Markdown paths only; companion keep stubs and `- **Shelf**:` follow the card.
- Librarian **>=0.21.50**. CLI **>=0.21.50**.

## 0.21.64

- Codex still waiting after **Approve**: click **Open the agent callback** on the authorize page (the browser may block the jump to `127.0.0.1`). Do not re-add the MCP URL with no Bearer. Librarian **>=0.21.49**.
- CLI **>=0.21.48**.

## 0.21.63

- `cm_delete` `{file, shelf, heading}` removes one `##` section in `lessons.md` (notes stay sections, not one file per card). Do not pass `file#heading`. Same-title `cm_note` is an error ???????? pick a new title, or delete that heading then rewrite. Import `dryRun` `files[].file` is the disk path apply will write.
- CLI **>=0.21.48**.

## 0.21.62

- If they already added a key or MCP URL in this agent, `cm_*` missing means a **new chat** ???????? do not mint `/connect?device=` and do not tell them to add the URL with no Bearer (that drops the key). Ignore leftover `centricmem` on PATH when `connect --device` is missing (npm 0.14.x). First connect is unchanged.
- CLI **>=0.21.36**.

## 0.21.61

- If connect still fails after signup + `/connect?device=` / OAuth, or they have a usage problem the Skill cannot fix: tell them to email zeyu@poppyg.com (which agent + what they saw; never a key or token). Do not send that mail for them. Website legal/privacy mail stays poppy@poppyg.com.
- CLI **>=0.21.36**.

## 0.21.60

- Hermes: `hermes skills install zeyu-j/centricmem-skill/skills/centricmem-agent`, then prefer `hermes mcp add --url https://mem.centricmem.com/mcp --auth oauth centricmem` (`auth: oauth` in `~/.hermes/config.yaml`). Bearer headers only when OAuth is unavailable. Still send `/connect?device=` unless `cm_*` work.
- Pi: `pi install https://github.com/zeyu-j/centricmem-skill` (package.json `pi.skills`). MCP is URL-only in `~/.pi/agent/mcp.json` ???????? not auto-wired.
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

- After plugin install, if `cm_*` are missing the same reply must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL. Plugin `mcp.json` is URL-only ???????? it is not a completed connect.
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
- After Skill install, the same reply must still send https://centricmem.com/login?signup=1 and tell them to save a backup of the key ???????? Keys shows it only once; never paste it in chat.
- CLI **>=0.21.36**.

## 0.21.51

- After Skill install, the same reply must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL, **and** tell them to save a backup of the key ???????? Keys shows it only once; never paste it in chat.
- CLI **>=0.21.36**.

## 0.21.50

- After Skill install, the same reply must send https://centricmem.com/login?signup=1 **and** a `/connect?device=` URL. Agents with a shell (Hermes) POST `https://mem.centricmem.com/connect/device` to mint that session; keep the secret off chat; claim and write Bearer to this agent????????s MCP (`~/.hermes/config.yaml`). Signup-only stays for blocked shells (Grok). `connect --device` stays when `centricmem` is on PATH.
- CLI **>=0.21.36**.

## 0.21.49

- After Skill install, the same reply must send https://centricmem.com/login?signup=1 unless `cm_health` already works. A working terminal is not the CentricMem CLI ???????? `connect --device` only when `centricmem` is on PATH. Hermes: `~/.hermes/skills/` and Bearer in `~/.hermes/config.yaml`.
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
- Ignore host `cm_doctor` saying the Skill is outdated ???????? that is the librarian disk. Compare this file to `skill_latest` / GitHub.
- CLI **>=0.21.36**.

## 0.21.42

- Bulk ingest: stage cards and originals locally, then **one librarian commit**. Caps: 50 cards, 50 attachments, 32MB zip, 80MB uncompressed, 25MB per file (`cm_health` `package`). Agent: `cm_keep` `{card:false}` then one `cm_import` `{items}` with `attach` pointers. Do not send a zip through MCP. Humans upload the zip on Archive; each card names its shelf (`Shelf:` or a Tags token that is the shelf id).
- CLI **>=0.21.36**.

## 0.21.41

- `libraries=` may list `share:<accountId>:<slug>` when someone shared a named shelf with this email. Pass that id as `shelf=` exactly. Do not mint `share:`. Login and the default key (`*`) see invited shelves; extra keys do not. Copy onto a shelf you own; do not delete or move a shared shelf.
- Attachments and named shelves: Lifetime 1 is 2GB / 20 shelves; Lifetime 2 is 50GB / 1000. Monthly extra-shelf caps are unchanged. Extra keys stay uncapped.

## 0.21.40

- `cm_move` `{from,to,files}` relocates selected Markdown cards onto another named shelf. Source files are deleted. Decision numbers stay if free on dest, otherwise a new seq. Attachments re-attach on dest. Default key or owner login; extra keys cannot. Pick cards with `cm_search` / `cm_show`. Do not download originals to ???????move?????? them. `cm_copy` still copies a whole leftover shelf; card delete stays login-only.

## 0.21.39

- Hosted ambient/doctor: unmatched cwd or omitted `shelf=` is `library=(none)` plus `libraries=` ???????? not the hub `use` pin. Pick a named shelf this turn (or mint). Extra keys with exactly one grant still open that shelf. Guests do not `--link`.
- After first `cm_health` this chat, say **once** which key (`*` = default / every shelf, else list extra grants). Suggest Keys grant ticks or minting an extra for another agent; authenticate default if this extra is too narrow. Never paste keys; never change grants via MCP.
- Unmatched cwd is not a shelf. If ambient is `library=(none)`, pick from `libraries=` or mint. Do not use the hub `use` pin.

## 0.21.38

- CodeBuddy / WorkBuddy: `.codebuddy-plugin/marketplace.json` (and `.workbuddy-plugin/` alias). Add with `codebuddy plugin marketplace add zeyu-j/centricmem-skill`.
- Kimi Code: `.kimi-plugin/plugin.json` plus a Custom catalog. Install with `/plugins install https://github.com/zeyu-j/centricmem-skill`. Host MCP Bearer is `CENTRICMEM_API_KEY` (never in chat). Official/Curated listing is a Moonshot PR ???????? not a self-serve form.

## 0.21.37

- If the shell is blocked or `centricmem` is missing, do not retry CLI. Send https://centricmem.com/login?signup=1; the human adds `https://mem.centricmem.com/mcp` in this agent????????s MCP settings (key from Keys, never in chat). `connect --device` stays the path when CLI works.
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

- Public names: **Library** (one per person) ???????? **Shelf** (pairing-key vault) ???????? **Card**. Agents pass `shelf=<id>` or `library=<id>`. Default account key = every shelf in this library. Pairing key = that shelf. Inbox is a system shelf, never a sweep target.
- Sign up is open. Install copy no longer says invite-only.

## 0.21.22

- `SKILL.md` follows the Agent Skills specification: `name`, `description` (what + when), `license`, `compatibility`, and `metadata` (version / CLI floor / changelog).
- This repo is also an Agent Plugins 1.0 package (`plugin.json` + `skills/` + `mcp.json`) for Codex, Copilot, and Kiro. MCP is `https://mem.centricmem.com/mcp` with no token in git. Codex-native pack: `.codex-plugin/plugin.json`.
- Still one public skill: `centricmem-agent`. Install remains `npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g`.

## 0.21.21

- Authenticate is always a `/connect?device=` link. The agent runs `centricmem connect --device` and sends only that URL. You have **ten minutes** to enter the key. Sign in at the website for the dashboard ???????? there is no ???????connect this computer?????? button. Never paste a key into chat.

## 0.21.20

- Remote agents (VPS / Cloud Agent): the agent runs `centricmem connect --device` and sends only the printed `/connect?device=` URL. You have **ten minutes** to enter the key on that page. The secret never appears in chat. Then start a new chat there.
- On the computer in front of you, the agent still sends `https://centricmem.com/connect` (loopback helper). Never paste a key into chat.

## 0.21.19

- Login uniquely owns delete and billing. The **default** account key (all libraries) may mint, rename, grant, and revoke other keys ???????? including every pairing key on a library. Pairing keys cannot. New tokens stay off chat (dashboard / CLI, not MCP).
- Attachments are metered per plan (Lite 100MB, Education 200MB, Pro 1GB, Ultra 10GB). Markdown is unlimited. Over quota, keep fails ???????? the agent says so.

## 0.21.18

- The authenticate link accepts **any** agent key: default (every library) or a pairing key (that library). Default is one choice, not the only one.
- Not a one-click install. You enter the key on `https://centricmem.com/connect` ???????? never in chat.

## 0.21.17

- When a key is needed, the agent sends the authenticate link `https://centricmem.com/connect`. You enter the key on that page ???????? never in chat. Not a one-click install. The helper on this computer (`centricmem connect`) writes MCP for every agent.
- The owner's agents use the **default account key** (all libraries). Friend pairing keys stay one vault.

## 0.21.16

- `/connect` is for **every** agent: copy the same host MCP snippet (never paste a token in chat). CLI `centricmem connect` writes MCP configs it finds on this computer. Optional Cursor one-click is not the product.
- The owner's agents use the **default account key** (all libraries). Friend pairing keys stay one vault.

## 0.21.15

- Paste an agent key on **this computer** at `https://centricmem.com/connect` (Cursor opens an install prompt). Never paste a token in chat. CLI: `centricmem connect` writes `~/.cursor/mcp.json` from a local page.
- Owner Cursor still uses the default account key (all libraries). Friend pairing keys stay one vault.

## 0.21.14

- Sweep never writes Inbox (`unclassified`). Pick a named library, or mint one (`cm_library`) when none fits. Drain leftovers with classify ???????? do not leave them for the human. Pairing keys still cannot mint a library.
- The owner's agent uses the **default account key** (all libraries). Friend pairing keys stay one vault.
- Still no curl. Originals and key minting stay on the dashboard.

## 0.21.13

- One MCP Bearer can be an **account key**: the owner grants which libraries it may open (`library=` / `cwd=`). Friend-style pairing keys stay one library. Isolation is one key = its grants.
- Still no curl. Originals and key minting stay on the dashboard. Login session is not for agents.

## 0.21.12

- Agents use the hosted MCP URL `https://mem.centricmem.com/mcp` with the appropriate agent credential.
- Same `cm_*` tools. Still no curl. Originals stay on the dashboard.

## 0.21.11

- The agent talks to the librarian only through host MCP (`cm_health`, `cm_search`, `cm_keep`, ???????). It does not curl. Originals stay on the dashboard.
- After `centricmem setup --install-skill`, Cursor MCP is merged on this machine. A new chat picks up the tools.

## 0.21.10

- The hosted MCP exposes the same librarian verbs as this Skill, including import, classify, and index. Originals, delete, and account stay on the dashboard.

## 0.21.9

- The agent files when the work is real ???????? you do not have to say wrap up. Closing the tab does not file; it files before it stops.
- If this Skill is behind GitHub, the agent runs `npx skills add` once. This chat still uses the loaded copy; the next chat uses the new one.

## 0.21.8

- Hosted `/ambient` is not your Skill version. If this file is old, re-run `npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -g`.
- This GitHub repo ships the Skill only (install + how to use).

## 0.21.7

- At close, the agent keeps this chat????????s transcript in object storage, then files units. You download originals from the dashboard.

## 0.21.4

- Capture stays in the agent you already use. CentricMem organises and retrieves on the hosted librarian.
