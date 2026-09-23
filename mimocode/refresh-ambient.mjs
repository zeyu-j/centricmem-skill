#!/usr/bin/env node
/**
 * Write the ambient cache the MiMoCode plugin reads.
 *
 * The plugin cannot fetch this itself: MiMoCode runs file hooks under a hard
 * 5000ms timeout with a 3-strike circuit breaker, so a network call inside a
 * hook can permanently disable that hook. Run this out of band instead - a
 * scheduled task, a shell profile, or by hand.
 *
 *   node refresh-ambient.mjs
 *
 * Writes CENTRICMEM_AMBIENT_FILE (default ~/.config/mimocode/centricmem-ambient.md)
 * as "status=OK" followed by the ambient text, or a bare status line when there
 * is nothing trustworthy to say - the same convention the goose refresher uses,
 * so a failed run never leaves stale text behind for the plugin to inject.
 *
 * The fetch itself is the shared tools/ambient.mjs every other host uses.
 * Never throws; always exits 0.
 */
import { fetchAmbient } from "../tools/ambient.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const file =
  process.env.CENTRICMEM_AMBIENT_FILE ||
  path.join(os.homedir(), ".config", "mimocode", "centricmem-ambient.md");

const r = await fetchAmbient().catch(() => null);

let body;
if (r && r.state === "ok" && r.text) {
  body = "status=OK\n" + r.text;
} else {
  body = "status=" + String((r && r.state) || "NO-ANSWER").toUpperCase() + "\n";
}

try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, "utf8");
  process.stdout.write("[centricmem] " + file + " written (" + body.split("\n")[0] + ")\n");
} catch (e) {
  process.stderr.write("[centricmem] could not write " + file + ": " + String(e) + "\n");
}

process.exit(0);
