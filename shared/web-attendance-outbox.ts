import type { EventType } from "./attendance";

export interface QueuedAttendance {
  id: string;
  shiftId: string;
  type: Exclude<EventType, "clock_in">;
  capturedAt: string;
  offline: boolean;
  jobId?: string;
  note?: string;
  reason?: string;
  expectedReturn?: string;
}

// One key per event avoids overwriting another tab's pending writes. No GPS or
// account credentials are retained. Server authorization remains authoritative.
export function attendanceOutbox(storage: Storage, companyId: string, employeeId: string) {
  const prefix = `shiftline-attendance:${companyId}:${employeeId}:`;
  const list = (): QueuedAttendance[] => {
    const entries: { event: QueuedAttendance; order: number }[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const value = storage.getItem(key);
      if (!value) continue;
      const stored = JSON.parse(value) as { event: QueuedAttendance; order: number };
      const event = stored.event;
      if (
        !event ||
        key !== prefix + event.id ||
        !event.shiftId ||
        !Number.isSafeInteger(stored.order) ||
        !Number.isFinite(Date.parse(event.capturedAt))
      )
        throw new Error(
          "Saved attendance is unreadable. Contact your manager; do not clear browser storage.",
        );
      entries.push(stored);
    }
    return entries
      .sort((a, b) => a.order - b.order || a.event.id.localeCompare(b.event.id))
      .map((entry) => entry.event);
  };
  return {
    list,
    save(event: QueuedAttendance) {
      list();
      const key = prefix + event.id;
      const prior = storage.getItem(key);
      if (prior !== null) {
        if (JSON.stringify(JSON.parse(prior).event) !== JSON.stringify(event))
          throw new Error("Attendance ID conflict");
        return;
      }
      let order = 0;
      for (let index = 0; index < storage.length; index++) {
        const entryKey = storage.key(index);
        if (entryKey?.startsWith(prefix))
          order = Math.max(order, JSON.parse(storage.getItem(entryKey)!).order);
      }
      const value = JSON.stringify({ event, order: order + 1 });
      storage.setItem(key, value);
      if (storage.getItem(key) !== value)
        throw new Error("Could not save attendance on this device");
    },
    async flush<T extends { status?: string }>(send: (event: QueuedAttendance) => Promise<T>) {
      const results: T[] = [];
      for (const event of list()) {
        const result = await send(event);
        if (result.status !== "synced" && result.status !== "needs_review")
          throw new Error("Server did not confirm saved attendance. Retry synchronization.");
        storage.removeItem(prefix + event.id);
        results.push(result);
        // Later events depend on this state. Preserve them until the manager
        // resolves the conflict instead of creating a cascade of invalid events.
        if (result.status === "needs_review") break;
      }
      return results;
    },
  };
}
