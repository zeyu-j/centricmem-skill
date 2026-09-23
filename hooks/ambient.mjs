// Claude Code SessionStart hook: print this shelf's context, or nothing at all.
//
// Claude reaches the model with plain stdout for this event, so no JSON envelope is needed, and each string
// is capped at 10,000 characters. A hook that exits non-zero can break somebody else's session, so every
// path here exits 0. The shared implementation lives in ../tools/ambient.mjs.

import { fetchAmbient } from "../tools/ambient.mjs";

try {
  const r = await fetchAmbient();
  if (r.state === "ok") process.stdout.write(r.text + "\n");
} catch {
  // never fail a session over context
}
process.exit(0);
