// Native close-half plugin for DeepSeek Harness.
//
// The hooks bridge cannot carry this half: its own event list is SessionStart, UserPromptSubmit,
// PreToolUse, PostToolUse, Stop, SubagentStart, SubagentStop - there is no SessionEnd, and what it
// does not know it ignores silently.
//
// It listens on "agent/disposed", the seam dsh-agent emits in emitDisposed(). That event is *not*
// filtered: it fires for every registered agent, subagents included (only the roots() query filters
// on owner === undefined). A subagent is disposed as soon as its turn finishes, not at shutdown, so
// running the close half on every disposal would file one unit per subagent per turn - the same trap
// the Claude Code hook avoids by only running at session end. The filter therefore comes from the
// session header, which is in the payload and does not depend on the event or on listener order.
//
// Credentials: dsh strips every variable matching /KEY|PASSWORD|SECRET|TOKEN/i from a child's
// environment (dsh-subprocess, via dsh-pwsh-sandbox for hook runs), so nothing can arrive that way.
// The api.json files are the channel, exactly as the ambient half uses them - hence one shared check.
//
// Disposal happens on the live server event loop, so this must never block it: the child is spawned
// detached and unref'd, and every failure is swallowed. Losing a session unit is survivable; stalling
// the harness or breaking shutdown is not.

import { spawn } from "node:child_process";
import { credential } from "../tools/ambient.mjs";

const name = "centricmem-close";

function apply(ctx) {
  ctx.on("agent/disposed", ({ agent }) => {
    try {
      const header = agent?.session?.header;
      const depth = header?.delegationDepth ?? 0;
      if (depth > 0 || header?.origin === "subagent") return;
      if (!credential().token) return;
      const child = spawn(process.platform === "win32" ? "centricmem.cmd" : "centricmem", ["log-session", "--auto"], {
        detached: true,
        stdio: "ignore",
        shell: process.platform === "win32",
        windowsHide: true,
      });
      child.on("error", () => {});
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      }, 20000);
      timer.unref?.();
      child.on("exit", () => clearTimeout(timer));
      child.unref();
    } catch {
      /* never break disposal over a card */
    }
  });
}

export { apply, name };
