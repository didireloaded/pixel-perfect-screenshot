import { beforeEach, expect, it, vi } from "vitest";
import { attendanceOutbox, type QueuedAttendance } from "../../shared/web-attendance-outbox";

beforeEach(() => localStorage.clear());
const event = (id: string, time = "2026-10-13T10:00:00Z"): QueuedAttendance => ({
  id,
  shiftId: "shift",
  type: "start_lunch",
  capturedAt: time,
  offline: true,
});
it("persists across reloads and isolates company and employee queues", () => {
  attendanceOutbox(localStorage, "a", "one").save(event("first"));
  expect(attendanceOutbox(localStorage, "a", "one").list()).toEqual([event("first")]);
  expect(attendanceOutbox(localStorage, "a", "two").list()).toEqual([]);
  expect(attendanceOutbox(localStorage, "b", "one").list()).toEqual([]);
});
it("retains an uncertain delivery and replays the exact original payload", async () => {
  const queue = attendanceOutbox(localStorage, "a", "one");
  queue.save(event("first"));
  await expect(
    queue.flush(async () => {
      throw new Error("network");
    }),
  ).rejects.toThrow("network");
  await queue.flush(async (payload) => {
    expect(payload).toEqual(event("first"));
    return { status: "synced" };
  });
  expect(queue.list()).toEqual([]);
});
it("sends in action order and stops at a review conflict", async () => {
  const queue = attendanceOutbox(localStorage, "a", "one");
  queue.save(event("first"));
  queue.save(event("later", "2026-10-13T11:00:00Z"));
  const sent: string[] = [];
  await queue.flush(async (payload) => {
    sent.push(payload.id);
    return { status: "needs_review" };
  });
  expect(sent).toEqual(["first"]);
  expect(queue.list().map((item) => item.id)).toEqual(["later"]);
});
it("never discards events without server confirmation or overwrites changed payloads", async () => {
  const queue = attendanceOutbox(localStorage, "a", "one");
  queue.save(event("first"));
  expect(() => queue.save({ ...event("first"), type: "clock_out" })).toThrow("ID conflict");
  await expect(queue.flush(async () => ({}))).rejects.toThrow("did not confirm");
  expect(queue.list()).toHaveLength(1);
});
it("preserves action order and original evidence when the device clock moves backward", async () => {
  const queue = attendanceOutbox(localStorage, "a", "one");
  queue.save(event("first", "2026-10-13T12:00:00Z"));
  queue.save({ ...event("second", "2026-10-13T11:00:00Z"), type: "end_lunch" });
  const sent: string[] = [];
  await queue.flush(async (payload) => {
    sent.push(payload.capturedAt);
    return { status: "synced" };
  });
  expect(sent).toEqual(["2026-10-13T12:00:00Z", "2026-10-13T11:00:00Z"]);
});
it("reports storage failure and preserves unreadable entries", () => {
  const queue = attendanceOutbox(localStorage, "a", "one");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  expect(() => queue.save(event("first"))).toThrow("Quota exceeded");
  write.mockRestore();
  localStorage.setItem("shiftline-attendance:a:one:broken", "{}");
  expect(() => queue.list()).toThrow("unreadable");
  expect(localStorage.getItem("shiftline-attendance:a:one:broken")).toBe("{}");
});
