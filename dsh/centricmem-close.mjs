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
// environment (dsh-subprocess, via dsh-pwsh-sandbox for hook runs), so on this host the environment cannot
// be a channel at all. The shared `credential()` is used by both halves; in practice it therefore resolves
// through the claimed host config and the api.json files here, even though it also reads the environment
// for the hosts where that does work.
//
// The opt-out switches every other host honours (CENTRICMEM_HOOK_DISABLE, CENTRICMEM_DONT_LOG,
// CENTRICMEM_HOOK_DRY_RUN) are honoured here too, for the same reason hooks/close.mjs honours them.
//
// Disposal happens on the live server event loop, so this must never block it: the child is spawned
// detached and unref'd, and every failure is swallowed. Losing a session unit is survivable; stalling
// the harness or breaking shutdown is not.

import { spawn } from "node:child_process";
import { credential, dontLog, hooksDisabled, hooksDryRun } from "../tools/ambient.mjs";

const name = "centricmem-close";

function apply(ctx) {
  ctx.on("agent/disposed", ({ agent }) => {
    try {
      const header = agent?.session?.header;
      const depth = header?.delegationDepth ?? 0;
      if (depth > 0 || header?.origin === "subagent") return;
      if (hooksDisabled() || dontLog() || hooksDryRun()) return;
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
