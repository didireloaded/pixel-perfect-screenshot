import { expect, it } from "vitest";
import { overtimeSessionSeconds } from "../../shared/overtime-session";
import type { AttendanceEvent, OvertimeSession } from "../../shared/attendance";
const time = (value: string) => Date.parse(`2026-10-15T${value}:00Z`);
const session = {
  shiftId: "shift",
  startedAt: new Date(time("17:30")).toISOString(),
  plannedFinishAt: new Date(time("20:00")).toISOString(),
  endedAt: null,
  reviewStatus: "none",
} as OvertimeSession;
const events = [
  ["clock_in", "08:00"],
  ["start_lunch", "18:00"],
  ["end_lunch", "18:30"],
  ["clock_out", "19:00"],
].map(([type, at], index) => ({
  id: String(index),
  shiftId: "shift",
  capturedAt: time(at!),
  type,
})) as AttendanceEvent[];
it("counts from the tap, excludes lunch and stops at clock-out", () => {
  expect(overtimeSessionSeconds(session, events, time("20:00"))).toBe(3600);
});
it("uses an earlier start only after approval and never extends beyond the planned finish", () => {
  const requested = {
    ...session,
    requestedStartAt: new Date(time("17:00")).toISOString(),
    reviewStatus: "pending" as const,
  };
  expect(overtimeSessionSeconds(requested, events, time("20:00"))).toBe(3600);
  expect(
    overtimeSessionSeconds({ ...requested, reviewStatus: "approved" }, events, time("20:00")),
  ).toBe(5400);
  expect(overtimeSessionSeconds(session, events.slice(0, 1), time("21:00"))).toBe(9000);
});
