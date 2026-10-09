import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { rpc, session, getSnapshot } from "./backend";
import { retryDelayMs, classifySync, type QueueStatus } from "./syncState";
import type { AttendanceIntent, AttendanceSnapshot } from "../../shared/attendance";
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
export async function openQueue() {
  if (!opening)
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync("shiftline-outbox.db");
      await db.execAsync(
        `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PENDING','IN_FLIGHT','SYNCED','NEEDS_REVIEW','FAILED')),attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,lease_token TEXT,server_event_id TEXT,conflict_id TEXT,error TEXT); CREATE INDEX IF NOT EXISTS outbox_owner ON outbox(owner_id,status); CREATE TABLE IF NOT EXISTS snapshots(owner_id TEXT PRIMARY KEY,payload TEXT NOT NULL);`,
      );
      return db;
    })();
  try {
    return await opening;
  } catch (error) {
    opening = undefined;
    throw error;
  }
}
export interface QueuedEvent {
  id: string;
  payload: AttendanceIntent;
  status: QueueStatus;
  attempts: number;
  error: string | null;
  conflictId: string | null;
}
export async function enqueue(ownerId: string, intent: Omit<AttendanceIntent, "id">) {
  const db = await openQueue();
  const id = Crypto.randomUUID();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      "INSERT INTO outbox(id,owner_id,payload,status) VALUES(?,?,?,'PENDING')",
      id,
      ownerId,
      JSON.stringify({ ...intent, id }),
    );
  });
  return id;
}
export async function queueState(ownerId: string): Promise<QueuedEvent[]> {
  const db = await openQueue();
  const rows = await db.getAllAsync<{
    id: string;
    payload: string;
    status: QueueStatus;
    attempts: number;
    error: string | null;
    conflictId: string | null;
  }>(
    "SELECT id,payload,status,attempts,error,conflict_id AS conflictId FROM outbox WHERE owner_id=? ORDER BY rowid",
    ownerId,
  );
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}
export async function cacheSnapshot(ownerId: string, data: AttendanceSnapshot) {
  const db = await openQueue();
  await db.runAsync(
    "INSERT INTO snapshots VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload",
    ownerId,
    JSON.stringify(data),
  );
}
export async function cachedSnapshot(ownerId: string): Promise<AttendanceSnapshot | null> {
  const db = await openQueue();
  const row = await db.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM snapshots WHERE owner_id=?",
    ownerId,
  );
  return row ? JSON.parse(row.payload) : null;
}
export async function reconcile(ownerId: string, data: AttendanceSnapshot) {
  const db = await openQueue();
  for (const s of data.submissions) {
    if (s.status === "synced")
      await db.runAsync(
        "UPDATE outbox SET status='SYNCED',error=NULL WHERE id=? AND owner_id=? AND status='NEEDS_REVIEW'",
        s.id,
        ownerId,
      );
  }
}
// The oldest outstanding intent gates later intents. A review conflict must not
// silently let a subsequent lunch or clock-out bypass its unresolved clock-in.
export async function syncQueue() {
  const auth = await session();
  if (!auth) return { synced: 0, review: 0, retrying: true };
  const db = await openQueue();
  let synced = 0,
    review = 0;
  for (let batch = 0; batch < 20; batch++) {
    const now = Date.now();
    await db.runAsync(
      "UPDATE outbox SET status='PENDING',lease_token=NULL WHERE owner_id=? AND status='IN_FLIGHT' AND lease_until<=?",
      auth.user.id,
      now,
    );
    const row = await db.getFirstAsync<{
      id: string;
      payload: string;
      status: QueueStatus;
      attempts: number;
      next_attempt: number;
    }>(
      "SELECT * FROM outbox WHERE owner_id=? AND status<>'SYNCED' ORDER BY rowid LIMIT 1",
      auth.user.id,
    );
    if (!row) break;
    if (row.status === "NEEDS_REVIEW") {
      try {
        const snap = await getSnapshot(auth.access_token);
        await cacheSnapshot(auth.user.id, snap);
        await reconcile(auth.user.id, snap);
      } catch {
        return { synced, review, retrying: true };
      }
      const updated = await db.getFirstAsync<{ status: QueueStatus }>(
        "SELECT status FROM outbox WHERE id=?",
        [row.id],
      );
      if (updated?.status === "SYNCED") continue;
      return { synced, review, retrying: false };
    }
    if (row.status === "FAILED" || row.status === "IN_FLIGHT" || row.next_attempt > now)
      return { synced, review, retrying: row.status !== "FAILED" };
    const lease = Crypto.randomUUID();
    const claimed = await db.runAsync(
      "UPDATE outbox SET status='IN_FLIGHT',lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND owner_id=? AND status='PENDING'",
      lease,
      now + 120000,
      row.id,
      auth.user.id,
    );
    if (claimed.changes !== 1) break;
    try {
      const result = await rpc("submit_attendance", JSON.parse(row.payload), auth.access_token);
      const status = classifySync(result);
      await db.withExclusiveTransactionAsync(async (tx) => {
        const updated = await tx.runAsync(
          "UPDATE outbox SET status=?,lease_token=NULL,lease_until=NULL,server_event_id=?,conflict_id=?,error=? WHERE id=? AND lease_token=?",
          status,
          result.eventId ?? null,
          result.conflictId ?? null,
          result.reason ?? null,
          row.id,
          lease,
        );
        if (status === "SYNCED" && updated.changes === 1)
          await tx.runAsync(
            "INSERT INTO snapshots VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET payload=excluded.payload",
            auth.user.id,
            JSON.stringify(result.snapshot),
          );
      });
      if (status === "SYNCED") {
        synced++;
      } else {
        review++;
        break;
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String((error as { message?: string })?.message || "Connection interrupted");
      await db.runAsync(
        "UPDATE outbox SET status='PENDING',lease_token=NULL,lease_until=NULL,next_attempt=?,error=? WHERE id=? AND lease_token=?",
        Date.now() + retryDelayMs(row.attempts, Math.floor(Math.random() * 5000)),
        message,
        row.id,
        lease,
      );
      return { synced, review, retrying: true };
    }
  }
  return { synced, review, retrying: false };
}
export async function retryQueue(ownerId: string) {
  const db = await openQueue();
  await db.runAsync(
    "UPDATE outbox SET next_attempt=0 WHERE owner_id=? AND status='PENDING'",
    ownerId,
  );
  return syncQueue();
}
