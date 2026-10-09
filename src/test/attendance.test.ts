import { describe, expect, it } from "vitest";
import { applyEvent, computeDay, trackingAllowed, toCsv, type AttendanceEvent } from "@/lib/attendance";

const T = (h: number, m = 0) => Date.UTC(2026, 9, 9, h, m);
const ev = (id: string, type: AttendanceEvent["type"], at: number): AttendanceEvent => ({
  id, employeeId: "e1", type, capturedAt: at, sync: "synced",
});
const policy = { version: 1, lunchPaid: false, dailyRegularMinutes: 480 };

describe("attendance rules", () => {
  it("ignores a repeated tap with the same event id", () => {
    const a = applyEvent([], ev("x", "clock_in", T(8)));
    if (!a.ok) throw new Error();
    const b = applyEvent(a.events, ev("x", "clock_in", T(8)));
    expect(b.ok && b.events.length).toBe(1);
  });
  it("rejects a second clock in", () => {
    const r = applyEvent([ev("a", "clock_in", T(8))], ev("b", "clock_in", T(8, 1)));
    expect(r.ok).toBe(false);
  });
  it("does not allow clock out during lunch", () => {
    const r = applyEvent([ev("a", "clock_in", T(8)), ev("b", "start_lunch", T(12))], ev("c", "clock_out", T(13)));
    expect(r.ok).toBe(false);
  });
  it("deducts unpaid lunch and keeps an assigned job as working time", () => {
    const d = computeDay([
      ev("1", "clock_in", T(8)), ev("2", "start_lunch", T(12)), ev("3", "end_lunch", T(12, 45)),
      ev("4", "start_job", T(14)), ev("5", "end_job", T(15)), ev("6", "clock_out", T(16, 45)),
    ], policy);
    expect(d.workedMinutes).toBe(480);
    expect(d.lunchMinutes).toBe(45);
  });
  it("counts overtime only up to the approved amount", () => {
    const d = computeDay([ev("1", "clock_in", T(7)), ev("2", "clock_out", T(17))], policy, 60);
    expect(d.regularMinutes).toBe(480);
    expect(d.overtimeMinutes).toBe(60);
  });
  it("flags a missing clock-out instead of inventing one", () => {
    expect(computeDay([ev("1", "clock_in", T(8))], policy).missingClockOut).toBe(true);
  });
  it("handles an overnight shift", () => {
    const d = computeDay([ev("1", "clock_in", T(22)), ev("2", "clock_out", T(22) + 8 * 3600000)], policy);
    expect(d.workedMinutes).toBe(480);
  });
  it("stops tracking at the shift deadline and during lunch", () => {
    const base = { windowStart: T(8), windowEnd: T(17) };
    expect(trackingAllowed({ ...base, now: T(17), state: "working" })).toBe(false);
    expect(trackingAllowed({ ...base, now: T(12), state: "on_lunch" })).toBe(false);
    expect(trackingAllowed({ ...base, now: T(17, 30), state: "working", approvedExtensionEnd: T(18) })).toBe(true);
  });
  it("exports hours as decimal without floating point drift", () => {
    expect(toCsv([{ employeeNo: "1", name: "A", date: "d", regularMinutes: 465, overtimeMinutes: 0, status: "approved" }]))
      .toContain(",7.75,0.00,");
  });
});
