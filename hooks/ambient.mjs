#!/usr/bin/env node
// SessionStart hook, for Claude Code and for hosts that run a Claude Code hooks.json through a
// bridge (DeepSeek Harness does exactly that).
//
// The reply is the JSON envelope rather than a bare string: Claude Code adds plain stdout to the
// session, but a bridge codec may accept only hookSpecificOutput.additionalContext, and it drops
// the whole reply when hookEventName is not exactly "SessionStart". One shape works for both, so
// that is the shape we print. With no credential nothing is printed, and the exit code is 0 either
// way - a hook that cannot reach the librarian must not break the session.

import { fetchAmbient } from "../tools/ambient.mjs";

const r = await fetchAmbient().catch(() => null);
if (r && r.state === "ok" && r.text) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: r.text } }),
  );
}
process.exit(0);
