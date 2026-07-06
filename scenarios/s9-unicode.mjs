/**
 * S9 — Unicode & injection: CJK, emoji, SQL injection strings must not crash.
 */
import Database from "better-sqlite3";
import { tmpdir, importDist } from "./_lib.mjs";

const ws = tmpdir("s9");
const { initProject, logDecision } = await importDist("memory.js");
const { buildIndex, search } = await importDist("indexer.js");
const { resolvePaths } = await importDist("core.js");

initProject(ws);
const cases = [
  { title: "使用 Redis 做会话缓存", context: "跨进程共享会话状态。", decision: "Redis 哨兵 + 60 秒滑动窗口。", tags: ["缓存"] },
  { title: "セッション管理に JWT を採用", context: "ステートレス認証。", decision: "JWT + リフレッシュ。", tags: ["auth"] },
  { title: "Adopt emoji commits 🚀", context: "fun 🎉", decision: "gitmoji 🧠", tags: ["dx"] },
  { title: "'; DROP TABLE chunks;--", context: "injection '; DELETE FROM chunks_fts;--", decision: "sanitise", tags: ["security"] },
];
for (const c of cases) logDecision(ws, { ...c, agent: "test" });

const paths = resolvePaths(ws);
buildIndex(paths);

for (const q of ["会话缓存", "セッション", "JWT", "gitmoji", "DROP TABLE", "'; DROP TABLE chunks;--"]) {
  search(paths, q, 3); // must not throw
}
if (!search(paths, "会话缓存", 3).length) throw new Error("CJK compound query missed");

const db = new Database(paths.dbFile, { readonly: true });
const n = db.prepare("SELECT COUNT(*) c FROM chunks").get().c;
db.close();
if (n < cases.length) throw new Error("chunks table damaged");
console.log("OK s9-unicode");
