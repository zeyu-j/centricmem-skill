/**
 * scenarios/_lib.mjs — cross-platform helpers for scenario scripts.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = path.join(ROOT, "dist", "cli.js");
export const DIST = path.join(ROOT, "dist");

export function tmpdir(name) {
  const d = path.join(os.tmpdir(), `cm-scenario-${name}-${Date.now()}`);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export function runCli(args, cwd) {
  return execFileSync("node", [CLI, ...args], { cwd, encoding: "utf8" });
}

export async function importDist(moduleName) {
  return import(pathToFileURL(path.join(DIST, moduleName)).href);
}

export function projectMem(ws, slug = "unclassified") {
  return path.join(ws, ".centricmem", "projects", slug);
}
