/**
 * sweep.test.ts — rolling 24h per-library sweep cap.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toImport = (p) => pathToFileURL(p).href;
const { abortSweep, commitSweep, DEFAULT_SWEEPS_PER_WINDOW, openSweepDb, remainingSweeps, reserveSweep, SWEEP_WINDOW_MS, } = await import(toImport(path.join(distDir, "sweep.js")));
let tmpRoot;
before(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cm-sweep-"));
});
after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});
function freshDb() {
    const file = path.join(tmpRoot, `s-${process.hrtime.bigint()}.db`);
    return openSweepDb(file);
}
test("fourth reserve in the window is denied; empty commit does not count", () => {
    const db = freshDb();
    const t0 = 1_700_000_000_000;
    const ids = [];
    for (let i = 0; i < DEFAULT_SWEEPS_PER_WINDOW; i++) {
        const r = reserveSweep(db, "lib-a", { now: t0 + i, holdMs: 60_000 });
        assert.equal(r.ok, true);
        if (r.ok)
            ids.push(r.reservationId);
    }
    const denied = reserveSweep(db, "lib-a", { now: t0 + 10, holdMs: 60_000 });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
        assert.equal(denied.code, "SWEEP_LIMIT");
        assert.ok(denied.retryAfterMs > 0);
    }
    const empty = commitSweep(db, ids[0], [], { now: t0 + 20 });
    assert.equal(empty.counted, false);
    const afterEmpty = reserveSweep(db, "lib-a", { now: t0 + 30, holdMs: 60_000 });
    assert.equal(afterEmpty.ok, true);
    db.close();
});
test("keys on the same library share the cap; another library does not", () => {
    const db = freshDb();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
        const r = reserveSweep(db, "shared", { now: t0 + i });
        assert.equal(r.ok, true);
        if (r.ok)
            commitSweep(db, r.reservationId, [`ext-${i}`], { now: t0 + i });
    }
    assert.equal(reserveSweep(db, "shared", { now: t0 + 50 }).ok, false);
    const other = reserveSweep(db, "other", { now: t0 + 50 });
    assert.equal(other.ok, true);
    db.close();
});
test("duplicate external ids do not count a second sweep", () => {
    const db = freshDb();
    const t0 = 1_700_000_000_000;
    const a = reserveSweep(db, "lib-b", { now: t0 });
    assert.equal(a.ok, true);
    if (a.ok) {
        const first = commitSweep(db, a.reservationId, ["chat-1"], { now: t0 + 1 });
        assert.equal(first.counted, true);
        assert.equal(first.createdUnits, 1);
    }
    const b = reserveSweep(db, "lib-b", { now: t0 + 2 });
    assert.equal(b.ok, true);
    if (b.ok) {
        const dup = commitSweep(db, b.reservationId, ["chat-1"], { now: t0 + 3 });
        assert.equal(dup.counted, false);
        assert.equal(dup.createdUnits, 0);
    }
    const left = remainingSweeps(db, "lib-b", { now: t0 + 4 });
    assert.equal(left.remaining, 2);
    db.close();
});
test("abort releases the slot; window expiry frees counted sweeps", () => {
    const db = freshDb();
    const t0 = 1_700_000_000_000;
    const held = reserveSweep(db, "lib-c", { now: t0, holdMs: 60_000 });
    assert.equal(held.ok, true);
    if (held.ok)
        abortSweep(db, held.reservationId);
    const again = reserveSweep(db, "lib-c", { now: t0 + 1 });
    assert.equal(again.ok, true);
    if (again.ok)
        commitSweep(db, again.reservationId, ["x"], { now: t0 + 2 });
    const later = remainingSweeps(db, "lib-c", { now: t0 + SWEEP_WINDOW_MS + 3 });
    assert.equal(later.remaining, 3);
    db.close();
});
