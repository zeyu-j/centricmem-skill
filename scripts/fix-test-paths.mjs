import fs from "node:fs";
const p = "tests/integration.test.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replaceAll('path.join(ws, ".centricmem", "projects", slug)', 'path.join(ws, "projects", slug)');
s = s.replaceAll('path.join(ws, ".centricmem", "workspace.json")', 'path.join(ws, "workspace.json")');
s = s.replaceAll('path.join(ws, ".centricmem", "skills"', 'path.join(ws, "skills"');
s = s.replaceAll("legacy .cursor/skills", "legacy path");
fs.writeFileSync(p, s);
console.log("remaining", (s.match(/\.centricmem/g) || []).length);
