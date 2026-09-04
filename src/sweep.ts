/**
 * Sweep ledger — per-library rolling 24h cap (PRODUCT_HOST F).
 * Lives in its own sqlite file so FTS schema rebuilds do not wipe it.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

export const DEFAULT_SWEEPS_PER_WINDOW = 3;
export const SWEEP_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SWEEP_HOLD_MS = 15 * 60 * 1000;

export type SweepReserveOk = {
  ok: true;
  reservationId: string;
  remainingAfterReserve: number;
};

export type SweepReserveDenied = {
  ok: false;
  code: "SWEEP_LIMIT";
  remaining: 0;
  retryAfterMs: number;
};

export type SweepReserveResult = SweepReserveOk | SweepReserveDenied;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sweep_reservations (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  committed_at INTEGER,
  created_units INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sweep_lib_created ON sweep_reservations(library_id, created_at);
CREATE TABLE IF NOT EXISTS sweep_idempotency (
  library_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  reservation_id TEXT NOT NULL,
  PRIMARY KEY (library_id, external_id)
);
`;

export function sweepDbPath(indexDir: string): string {
  return path.join(indexDir, "sweep.db");
}

export function openSweepDb(file: string): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

function occupiedCount(
  db: Database.Database,
  libraryId: string,
  now: number,
  windowMs: number,
): { n: number; oldestOccupying: number | null } {
  const since = now - windowMs;
  const rows = db
    .prepare(
      `SELECT created_at AS createdAt, committed_at AS committedAt, expires_at AS expiresAt, created_units AS createdUnits
       FROM sweep_reservations WHERE library_id = ? AND created_at > ?`,
    )
    .all(libraryId, since) as Array<{
      createdAt: number;
      committedAt: number | null;
      expiresAt: number;
      createdUnits: number;
    }>;
  let n = 0;
  let oldest: number | null = null;
  for (const r of rows) {
    const liveHold = r.committedAt == null && r.expiresAt > now;
    const countedCommit = r.committedAt != null && r.createdUnits > 0;
    if (!liveHold && !countedCommit) continue;
    n += 1;
    if (oldest === null || r.createdAt < oldest) oldest = r.createdAt;
  }
  return { n, oldestOccupying: oldest };
}

export function remainingSweeps(
  db: Database.Database,
  libraryId: string,
  opts?: { limit?: number; now?: number; windowMs?: number },
): { remaining: number; retryAfterMs: number } {
  const limit = opts?.limit ?? DEFAULT_SWEEPS_PER_WINDOW;
  const now = opts?.now ?? Date.now();
  const windowMs = opts?.windowMs ?? SWEEP_WINDOW_MS;
  const { n, oldestOccupying } = occupiedCount(db, libraryId, now, windowMs);
  const remaining = Math.max(0, limit - n);
  const retryAfterMs =
    remaining > 0 || oldestOccupying === null ? 0 : Math.max(0, oldestOccupying + windowMs - now);
  return { remaining, retryAfterMs };
}

/** Take one slot for an in-flight sweep. Concurrent callers serialize on sqlite. */
export function reserveSweep(
  db: Database.Database,
  libraryId: string,
  opts?: { limit?: number; now?: number; windowMs?: number; holdMs?: number },
): SweepReserveResult {
  const limit = opts?.limit ?? DEFAULT_SWEEPS_PER_WINDOW;
  const now = opts?.now ?? Date.now();
  const windowMs = opts?.windowMs ?? SWEEP_WINDOW_MS;
  const holdMs = opts?.holdMs ?? SWEEP_HOLD_MS;
  const run = db.transaction((): SweepReserveResult => {
    const { n, oldestOccupying } = occupiedCount(db, libraryId, now, windowMs);
    if (n >= limit) {
      const retryAfterMs =
        oldestOccupying === null ? windowMs : Math.max(0, oldestOccupying + windowMs - now);
      return { ok: false, code: "SWEEP_LIMIT", remaining: 0, retryAfterMs };
    }
    const id = crypto.randomBytes(16).toString("hex");
    db.prepare(
      `INSERT INTO sweep_reservations(id, library_id, created_at, expires_at, committed_at, created_units)
       VALUES (?, ?, ?, ?, NULL, 0)`,
    ).run(id, libraryId, now, now + holdMs);
    return { ok: true, reservationId: id, remainingAfterReserve: Math.max(0, limit - n - 1) };
  });
  return run();
}

export function abortSweep(db: Database.Database, reservationId: string): void {
  db.prepare(`DELETE FROM sweep_reservations WHERE id = ? AND committed_at IS NULL`).run(reservationId);
}

/**
 * Finish a sweep. Zero new units (after idempotency) does not count.
 * Duplicate external ids in this library are ignored and do not add created_units.
 */
export function commitSweep(
  db: Database.Database,
  reservationId: string,
  externalIds: string[],
  opts?: { now?: number },
): { createdUnits: number; counted: boolean } {
  const now = opts?.now ?? Date.now();
  const run = db.transaction(() => {
    const row = db
      .prepare(`SELECT library_id AS libraryId, committed_at AS committedAt FROM sweep_reservations WHERE id = ?`)
      .get(reservationId) as { libraryId: string; committedAt: number | null } | undefined;
    if (!row) throw new Error("Unknown sweep reservation.");
    if (row.committedAt != null) {
      const createdUnits = (
        db.prepare(`SELECT created_units AS n FROM sweep_reservations WHERE id = ?`).get(reservationId) as { n: number }
      ).n;
      return { createdUnits, counted: createdUnits > 0 };
    }
    let created = 0;
    const ins = db.prepare(
      `INSERT INTO sweep_idempotency(library_id, external_id, reservation_id) VALUES (?, ?, ?)
       ON CONFLICT(library_id, external_id) DO NOTHING`,
    );
    for (const raw of externalIds) {
      const id = raw.trim();
      if (!id) continue;
      const info = ins.run(row.libraryId, id, reservationId);
      if (info.changes > 0) created += 1;
    }
    if (created === 0) {
      db.prepare(`DELETE FROM sweep_reservations WHERE id = ?`).run(reservationId);
      return { createdUnits: 0, counted: false };
    }
    db.prepare(
      `UPDATE sweep_reservations SET committed_at = ?, created_units = ?, expires_at = ? WHERE id = ?`,
    ).run(now, created, now, reservationId);
    return { createdUnits: created, counted: true };
  });
  return run();
}
