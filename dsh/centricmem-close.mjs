// Native close-half plugin for DeepSeek Harness.
//
// The hooks bridge cannot carry this half: its own event list is SessionStart, UserPromptSubmit,
// PreToolUse, PostToolUse, Stop, SubagentStart, SubagentStop - there is no SessionEnd, and what it
// does not know it ignores silently. So this listens where dsh itself does: "agent/disposed", which
// dsh-agent emits once per top-level agent (subagents are excluded).
//
// Credentials: dsh strips every variable whose name matches /KEY|PASSWORD|SECRET|TOKEN/i from a
// child's environment, so nothing can arrive that way. The api.json files are the channel, exactly
// as the ambient half uses them - hence one shared credential check rather than a second copy.
//
// Every failure is swallowed on purpose: a plugin runs during disposal, and losing a session unit is
// survivable while breaking shutdown is not.

import { spawnSync } from "node:child_process";
import { credential } from "../tools/ambient.mjs";

const name = "centricmem-close";

function apply(ctx) {
  ctx.on("agent/disposed", () => {
    try {
      if (!credential().token) return;
      spawnSync(process.platform === "win32" ? "centricmem.cmd" : "centricmem", ["log-session", "--auto"], {
        stdio: "ignore",
        shell: process.platform === "win32",
        windowsHide: true,
        timeout: 25000,
      });
    } catch {
      /* never break disposal over a card */
    }
  });
}

export { apply, name };
