# DSH Cordis funnel

This folder is **MIT**. It only mounts the in-box `@deepseek-ai/dsh-mcp-client` at `https://mem.centricmem.com/mcp`.

The Skill (`skills/centricmem-agent/SKILL.md`) stays **PolyForm Noncommercial**. Do not relicense it. Do not list this Skill on ClawHub.

```bash
dsh plugin --profile web add github:zeyu-j/centricmem-skill
```

The patch is URL-only. After the agent sends a `/connect?device=` link, overlay Bearer headers in `$DSH_HOME/profiles/<profile>/cordis.patch.yml` — never commit them.

GitHub topic `dsh-plugin` is discovery. A live CentricMem plan is still required.
