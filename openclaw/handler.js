// OpenClaw hook handler for centricmem-ambient.
//
// Named handler.js because that is what the loader asked for:
//   "[openclaw] Reason: handler.ts/handler.js/index.ts/index.js missing in ..."
// CommonJS because a pack directory without a package.json has no type field, and CommonJS can still reach
// the shared ESM implementation with a dynamic import.
//
// Rules: never fail, never guess a credential, never print the wrong thing. See HOOK.md beside this file.

async function centricmemAmbient() {
  try {
    const { fetchAmbient } = await import("../tools/ambient.mjs");
    const r = await fetchAmbient();
    return { additionalContext: r.state === "ok" ? r.text : "" };
  } catch {
    return { additionalContext: "" };
  }
}

module.exports = centricmemAmbient;
module.exports.default = centricmemAmbient;
module.exports.centricmemAmbient = centricmemAmbient;
