/**
 * Scenario 2: Migrate from Cursor Rules, then search.
 */
import fs from "node:fs";
import path from "node:path";
import { tmpdir, runCli, projectMem } from "./_lib.mjs";

const ws = tmpdir("s2");
fs.mkdirSync(path.join(ws, ".cursor", "rules"), { recursive: true });

fs.writeFileSync(path.join(ws, ".cursor/rules/typescript.mdc"), `---
description: TypeScript conventions
globs: "**/*.ts"
---
# TypeScript Rules

- Always use strict mode in tsconfig
- Never use any; use unknown with narrowing
`);

fs.writeFileSync(path.join(ws, ".cursor/rules/react.mdc"), `---
description: React conventions
---
# React Rules

- Custom hooks must start with use prefix
`);

fs.writeFileSync(path.join(ws, ".cursor/rules/testing.mdc"), `---
description: Testing conventions
---
# Testing Rules

- Use vitest not jest for unit tests
`);

runCli(["init", "--no-git-hook"], ws);
console.log(runCli(["migrate", "--from", "cursor-rules", "--path", ".cursor/rules"], ws));
console.log(runCli(["search", "vitest"], ws));
console.log(runCli(["search", "react", "hooks"], ws));

const agents = fs.readFileSync(path.join(projectMem(ws), "AGENTS.md"), "utf8");
if (!agents.includes("vitest")) throw new Error("migration failed: vitest rule missing");
console.log("OK s2-cursor-migrate");
