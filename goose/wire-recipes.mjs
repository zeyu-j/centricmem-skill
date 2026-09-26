#!/usr/bin/env node
// SessionStart wiring for goose: put the recipes beside this file where goose actually looks for them.
//
// Why this exists. A goose plugin carries skills and hooks, and nothing else - the Agent Plugins
// manifest has no recipes field, and goose's recipe discovery never descends into ~/.agents/plugins/.
// So the YAML in this directory is inert the moment the plugin is installed: the Skill loads, cm_* work,
// and the recipes are silently absent. Nobody can observe that, because a missing recipe blocks nothing:
// the agent has no reason to mention it, and the README only mentions it to someone already reading the
// goose row.
//
// Why not GOOSE_RECIPE_PATH. It is an environment variable and nothing else. Writing it into
// ~/.config/goose/config.yaml does not work - measured on goose 1.52.0, `goose recipe list` never saw the
// directory - and a hook cannot change goose's own environment, because a hook runs as goose's child. On
// macOS the app is launched from the dock, which inherits no shell profile either, so an exported
// variable is the same silent failure this file removes. The global library needs no variable at all.
//
// What goose 1.52.0 was measured to search: ~/.config/goose/recipes/ (the documented library) and
// ~/.agents/recipes/ (undocumented, and found while testing this). The documented one is the one
// written.
//
// The rules every hook in this repository follows: never fail, keep stdout empty - on goose it is the
// decision channel, so diagnostics go to stderr - say nothing when there is nothing to say, and never
// replace a file this package did not write. A recipe marks itself as ours on line one; anything without
// that mark is left alone.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hooksDisabled, hooksDryRun } from "../tools/ambient.mjs";

const MARK = "# managed by centricmem-skill";

/** goose's own state directory, the one its documentation names on every platform. */
const gooseHome = () => process.env.GOOSE_CONFIG_DIR || path.join(os.homedir(), ".config", "goose");

/**
 * Is this goose? The ambient hook tells hosts apart by PLUGIN_ROOT without CLAUDE_PLUGIN_ROOT, and that
 * is enough to decide what shape to print. This script writes files, so it asks for a second, independent
 * signal rather than trusting one variable: a host that sets PLUGIN_ROOT for its own reasons must not have
 * directories created in goose's name. A machine with goose on it has goose's directory.
 */
function onGoose() {
  if (process.env.CLAUDE_PLUGIN_ROOT || !process.env.PLUGIN_ROOT) return false;
  try {
    return fs.existsSync(gooseHome());
  } catch {
    return false;
  }
}

/** stderr, never stdout: a stray line on goose's stdout reads as a hook decision. */
const note = (m) => {
  try {
    process.stderr.write("centricmem: " + m + "\n");
  } catch {
    /* nothing to say it to */
  }
};

function wire() {
  if (hooksDisabled()) return;
  if (!onGoose()) return;

  const src = path.join(process.env.PLUGIN_ROOT, "goose");
  const dest = path.join(gooseHome(), "recipes");

  let names;
  try {
    names = fs.readdirSync(src).filter((f) => f.endsWith(".yaml")).sort();
  } catch {
    return; // no goose directory beside this script: there is nothing to install
  }

  const dry = hooksDryRun();
  const installed = [];
  const kept = [];

  for (const name of names) {
    let body;
    try {
      body = fs.readFileSync(path.join(src, name), "utf8");
    } catch {
      continue;
    }
    // Only what this package wrote is ours to replace. A file copied by hand, or one the user edited and
    // left without the marker, is theirs.
    if (!body.startsWith(MARK)) continue;

    let existing = null;
    try {
      existing = fs.readFileSync(path.join(dest, name), "utf8");
    } catch {
      /* not installed yet */
    }
    if (existing === body) continue; // current already, which is the common case
    if (existing !== null && !existing.startsWith(MARK)) {
      kept.push(name);
      continue;
    }
    if (dry) {
      installed.push(name);
      continue;
    }
    try {
      fs.mkdirSync(dest, { recursive: true });
      const tmp = path.join(dest, name + ".tmp");
      fs.writeFileSync(tmp, body, "utf8");
      fs.renameSync(tmp, path.join(dest, name));
      installed.push(name);
    } catch (e) {
      note("could not install " + name + ": " + (e && e.message ? e.message : e));
    }
  }

  if (installed.length) {
    note(
      (dry ? "would install " : "installed ") +
        installed.length +
        " recipe(s) into " +
        dest +
        ": " +
        installed.join(", "),
    );
  }
  // The one line worth repeating: it says the plugin moved on and a local edit did not follow, which is
  // the only state here the user can act on.
  if (kept.length) note("left " + kept.join(", ") + " alone: no centricmem marker, so it is not ours");
}

try {
  wire();
} catch (e) {
  note("recipe wiring failed: " + (e && e.message ? e.message : e)); // never fail somebody else's session
}
process.exit(0);
