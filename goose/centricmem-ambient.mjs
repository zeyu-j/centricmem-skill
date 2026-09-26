// goose MOIM refresher: write the file goose injects into every turn.
//
// The composing lives in ../tools/ambient.mjs, shared with the plugin's SessionStart hook, so the two
// cannot disagree about what an honest file says - a stale file that claims success is worse than a file
// that says plainly why it is empty.
//
// Run it however suits the host: by hand, from the scheduler extension, or from a SessionStart-style hook
// (the plugin's hooks/ambient.mjs does exactly this on goose already).
//   GOOSE_MOIM_MESSAGE_FILE  where to write (default ~/.goose/centricmem-ambient.md)
//   CENTRICMEM_SHELF         which shelf (default: the library the CLI last used)
//   CENTRICMEM_URL           which librarian (default https://mem.centricmem.com)

import { fetchAmbient, moimPath, writeMoim } from "../tools/ambient.mjs";

const OUT = moimPath();

const main = async () => {
  const r = await fetchAmbient();
  try {
    const { body } = writeMoim(r, OUT);
    process.stdout.write(
      r.state === "ok"
        ? "refreshed " + OUT + " (" + body.length + " bytes)\n"
        : "wrote " + OUT + " with status=" + r.state + "\n",
    );
  } catch {
    // leave the old file alone rather than half-write a new one
    process.stdout.write("wrote " + OUT + " with status=" + r.state + "\n");
  }
};

main().catch(() => process.exit(0));
