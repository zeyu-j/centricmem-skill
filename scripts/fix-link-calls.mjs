import fs from "node:fs";
const p = "tests/integration.test.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(/linkProject\(ws, "([^"]+)"\)/g, 'linkProject(ws, "$1", ws)');
// Add cwd-match + migrate-from-local tests before EOF
if (!s.includes("matchProjectByCwd selects project")) {
  s = s.trimEnd() + `

test("matchProjectByCwd selects project from sourceDir", async () => {
  const { matchProjectByCwd, getCurrentProjectSlug } = await import(toImport(path.join(distDir, "workspace.js")));
  const home = freshDir("t37-cwd-match-home");
  const code = freshDir("t37-cwd-match-code");
  initProject(home);
  fs.writeFileSync(path.join(code, "package.json"), "{}");
  const slug = linkProject(home, code, path.dirname(code));
  assert.ok(slug);
  assert.strictEqual(matchProjectByCwd(home, code), slug);
  assert.strictEqual(getCurrentProjectSlug(home, code), slug);
});

test("migrateFromLocalHub moves repo .centricmem into product home", async () => {
  const { migrateFromLocalHub } = await import(toImport(path.join(distDir, "setup.js")));
  const code = freshDir("t38-migrate-code");
  const home = freshDir("t38-migrate-home");
  // Simulate legacy nested hub inside code repo
  const legacy = path.join(code, ".centricmem");
  fs.mkdirSync(path.join(legacy, "projects", "unclassified", "decisions"), { recursive: true });
  fs.writeFileSync(
    path.join(legacy, "workspace.json"),
    JSON.stringify({
      version: 1,
      current: "demo",
      projects: {
        unclassified: { path: "unclassified", linked_at: "2026-01-01T00:00:00.000Z", system: true },
        demo: { path: "demo", linked_at: "2026-01-01T00:00:00.000Z", sourceDir: "." },
      },
    }) + "\\n",
  );
  fs.mkdirSync(path.join(legacy, "projects", "demo"), { recursive: true });
  fs.writeFileSync(path.join(legacy, "projects", "demo", "AGENTS.md"), "# demo\\n");
  const ok = migrateFromLocalHub(home, code);
  assert.ok(ok);
  assert.ok(fs.existsSync(path.join(home, "workspace.json")));
  assert.ok(fs.existsSync(path.join(home, "projects", "demo", "AGENTS.md")));
  assert.ok(!fs.existsSync(legacy));
});
`;
}
fs.writeFileSync(p, s);
console.log("done");
