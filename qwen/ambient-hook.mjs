#!/usr/bin/env node
// Qwen Code SessionStart hook.
//
// Qwen reads hooks from .qwen/settings.json (project) or the user settings file, and a
// SessionStart hook can add context by printing:
//   {"hookSpecificOutput": {"additionalContext": "..."}}
// This is the same shared ambient implementation every other host uses (tools/ambient.mjs);
// only the shape of the reply differs. With no credential it prints nothing, which is the
// normal case on an OAuth-connected host, and it always exits 0.

import { fetchAmbient } from "../tools/ambient.mjs";

const r = await fetchAmbient().catch(() => null);
if (r && r.state === "ok" && r.text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { additionalContext: r.text } }));
}
process.exit(0);
