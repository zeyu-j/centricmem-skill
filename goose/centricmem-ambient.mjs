// goose MOIM refresher: write the file goose injects into every turn.
//
// This replaces the PowerShell version, which did the same job but only on Windows. goose reports the ambient
// text and the state of the fetch, because the file is read by the model as-is: a stale file that claims
// success is worse than a file that says plainly why it is empty.
//
// Run it however suits the host: by hand, from the scheduler extension, or from a SessionStart-style hook.
//   GOOSE_MOIM_MESSAGE_FILE  where to write (default ~/.goose/centricmem-ambient.md)
//   CENTRICMEM_SHELF         which shelf (default: the library the CLI last used)
//   CENTRICMEM_URL           which librarian (default https://mem.centricmem.com)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchAmbient, tokenTail, librarian } from "../tools/ambient.mjs";

const OUT = process.env.GOOSE_MOIM_MESSAGE_FILE || path.join(os.homedir(), ".goose", "centricmem-ambient.md");

const header = (status, extra = "") =>
  `<!-- CentricMem ambient refresh: ${status} | ${new Date().toISOString()} | librarian=${librarian()}${extra} -->`;

// Each failure says which failure it is. Conflating them is how a stale leftover hub once read as healthy.
const EXPLAIN = {
  "no-key": [
    "CentricMem: no key on this machine, so the shelf could not be read.",
    "",
    "If this agent is connected by OAuth, that is normal: OAuth covers the MCP tools, and no copyable key",
    "exists. Use the cm_* tools and ignore this file. If you expected a key here, mint one with",
    "`centricmem connect --device` (or /connect?device=) rather than creating a hub.",
  ],
  refused: (r) => [
    `CentricMem: the librarian refused this machine's key (HTTP ${r.status}).`,
    `  key: ${tokenTail(r.token)} from ${r.source || "(unknown source)"}`,
    "",
    "That is a credential problem, not a connection problem: rotate the key in Manager, then refresh this file.",
    "Nothing below is trustworthy.",
  ],
  "no-answer": [
    "CentricMem: the librarian did not answer, so there is no fresh context.",
    "",
    "This is the transport case. Check the service first with `centricmem doctor` or a plain GET /status - the",
    "CLI makes its own request, so it still works when this agent's MCP session is dead. If the service is",
    "fine, the MCP session is the problem: cycling the extension (disable, then enable) re-handshakes it.",
    "Nothing below is trustworthy.",
  ],
  empty: [
    "CentricMem: the librarian answered with no context for this shelf.",
    "",
    "Usually that means no shelf was named and the CLI has not been pointed at one. Name it with shelf= on a",
    "tool call, or pass CENTRICMEM_SHELF when refreshing this file.",
  ],
};

const main = async () => {
  const r = await fetchAmbient();
  const dir = path.dirname(OUT);
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }

  if (r.state === "ok") {
    const body = [header("status=OK", ` | source=http | token=${tokenTail(r.token)}`), "", r.text, ""].join("\n");
    fs.writeFileSync(OUT, body, "utf8");
    process.stdout.write("refreshed " + OUT + " (" + body.length + " bytes)\n");
    return;
  }

  const explained = typeof EXPLAIN[r.state] === "function" ? EXPLAIN[r.state](r) : EXPLAIN[r.state] || EXPLAIN["no-answer"];
  const body = [header("status=" + r.state.toUpperCase(), ` | token=${tokenTail(r.token)}`), "", ...explained, "", "Nothing below is trustworthy.", ""].join("\n");
  try { fs.writeFileSync(OUT, body, "utf8"); } catch { /* leave the old file alone */ }
  process.stdout.write("wrote " + OUT + " with status=" + r.state + "\n");
};

main().catch(() => process.exit(0));
