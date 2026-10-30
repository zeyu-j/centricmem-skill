# AGENTS.md

For an agent that has just been handed this repository - to review it, to install it, or to change it.

## What this is

One skill plus the per-host manifests that deliver it. The skill is
`skills/centricmem-agent/SKILL.md`. **There is no `SKILL.md` at the repository root**, and that is not a
packaging mistake: `install.json` names the folder, and `npx skills add` copies that folder to
`<skills-root>/centricmem-agent/`. If you `ls` the root and conclude the skill is missing, look one level down.

## Read these three before forming a view

| File | What it settles |
| --- | --- |
| `skills/centricmem-agent/SKILL.md` | what the agent is asked to do: which tool to call, which shelf to file under, when to say nothing |
| `hooks/README.md` | the only code that runs without being asked - each hook's event, reads, writes, network, and the three switches that turn it off |
| `MANIFESTS.md` | why there are twelve `.*-plugin` directories instead of one, with the measured evidence for each |

If your concern is "this thing runs commands", `hooks/README.md` is the answer and it is under a hundred
lines. If it is "why is it shaped like a botnet", `MANIFESTS.md` is the answer.

## What it does not do

- **It does not send mail.** Every email address in this repository is support contact for the human. The
  Skill says so explicitly: *do not email on their behalf*.
- **It does not install a service or a scheduled task.** Nothing in this repository registers itself with the
  operating system. A timer is an operator's decision, taken outside the repository.
- **It talks to one host.** `mem.centricmem.com`, over HTTPS, with the user's own key or OAuth grant.
- **It writes outside its own paths nowhere.** The complete list is in `hooks/README.md`.
- **It contains no keys.** `SECURITY.md` lists what must never appear in a published version.

## Installing, without running anything you have not read

```sh
# the skill only - no hooks, no manifest, no code path in hooks/README.md
npx skills add zeyu-j/centricmem-skill --skill centricmem-agent -y

# the plugin - skill, hooks and MCP registration, for one host
goose plugin install https://github.com/zeyu-j/centricmem-skill
```

The two are different on purpose. Copying `skills/` into a skills directory activates the Skill and nothing
else; hooks fire only after a plugin install.

## Changing it

`tools/check-versions.mjs` must pass - eleven manifests carry the same version number, and one that disagrees
makes a host report a wrong "up to date". `.github/hooks/pre-push` runs both leak gates if you enable it:
`git config core.hooksPath .github/hooks`.

Claims in these documents should be things that were run. Where something was not exercised,
`VERIFIED-INSTALLS.md` marks the gap rather than rounding it up.
