# DSH Cordis funnel

This folder is **MIT**. It only mounts the in-box `@deepseek-ai/dsh-mcp-client` at `https://mem.centricmem.com/mcp`.

The Skill (`skills/centricmem-agent/SKILL.md`) is **MIT** from 1.0.7. It was PolyForm Noncommercial up to and including 1.0.6, and that grant is not withdrawn retroactively. Do not list this Skill on ClawHub.

Needs `pnpm` on PATH (`npm i -g pnpm` if missing). `corepack enable pnpm` fails on Windows when Node lives under Program Files.

Pin the tag so the profile does not track `main`:

```bash
dsh plugin --profile web add github:zeyu-j/centricmem-skill#v0.21.72
```

Then copy the Skill into a path DSH actually scans (the funnel does **not** load `node_modules/…/skills/`):

```bash
node node_modules/centricmem-skill/dsh/copy-skill.mjs
```

Run that from the profile directory (`$DSH_HOME/profiles/<profile>/`). It writes `$DSH_HOME/skills/centricmem-agent/`. Never `npx skills add -g` in DSH — that writes `~/.agents/skills`, not `$DSH_HOME`.

The patch is URL-only and sets `failOnStartupError: true`, so a missing Bearer aborts boot instead of registering zero tools. After the agent sends a `/connect?device=` link, overlay Bearer on the **same** `id` — restating the whole `config` block. A typo in `serverName` creates a second server, not an error. Never commit headers.

```yaml
# $DSH_HOME/profiles/<profile>/cordis.patch.yml
- insert:
    - id: mcp-centricmem
      name: '@deepseek-ai/dsh-mcp-client'
      failOnStartupError: true
      config:
        serverName: centricmem
        transport: streamable-http
        url: https://mem.centricmem.com/mcp
        headers:
          Authorization: Bearer <key-from-the-connect-page>
```

Start a **new chat**. This session’s tool catalog is frozen at boot. Tools appear as `mcp__centricmem__cm_*` (same 16 tools). DSH has no plaintext per-chat transcript — skip `cm_keep`; still file note / decision / done.

GitHub topic `dsh-plugin` is discovery. A live CentricMem plan is still required.
