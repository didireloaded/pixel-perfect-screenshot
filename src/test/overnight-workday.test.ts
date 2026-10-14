import { expect, it, vi, afterEach } from "vitest";
import { currentWorkday, workPositionAllowed } from "../../shared/workday";
import { watchWorkPosition } from "../../shared/watch-work-position";
import { liveWorkMinutes } from "../../shared/live-work-minutes";
import type { AttendanceSnapshot } from "../../shared/attendance";
it("stops the live estimate at planned finish without changing recorded hours", () => {
  const workday = {
    id: "shift",
    finishesAt: "2026-10-14T02:00:00Z",
    totals: { recordedMinutes: 120 },
  } as AttendanceSnapshot["shifts"][number];
  const events = [
    { shiftId: "shift", type: "end_lunch", capturedAt: Date.parse("2026-10-14T01:00:00Z") },
  ] as AttendanceSnapshot["events"];
  expect(
    liveWorkMinutes(workday, "working", events, Date.parse("2026-10-14T05:00:00Z")).minutes,
  ).toBe(180);
  expect(workday.totals.recordedMinutes).toBe(120);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const shift = {
  id: "night",
  employeeId: "worker",
  date: "2026-10-13",
  finishDate: "2026-10-14",
  start: "20:00",
  trackingStop: "04:00",
  startsAt: "2026-10-13T18:00:00Z",
  finishesAt: "2026-10-14T02:00:00Z",
};
it("selects an open overnight day instead of an unstarted calendar-day record", () => {
  const data = {
    me: "worker",
    today: "2026-10-14",
    shifts: [{ ...shift, id: "today", date: "2026-10-14" }, shift],
    states: [
      { shiftId: "night", state: "on_job" },
      { shiftId: "today", state: "not_clocked_in" },
    ],
  } as unknown as AttendanceSnapshot;
  expect(currentWorkday(data)?.id).toBe("night");
  data.states[0]!.state = "clocked_out";
  expect(currentWorkday(data)?.id).toBe("today");
});
it("keeps legacy unresolved days separate and rejects incomplete tracking instants", () => {
  const data = {
    me: "worker",
    today: "2026-10-14",
    shifts: [{ ...shift, finishDate: shift.date }],
    states: [{ shiftId: "night", state: "working" }],
  } as unknown as AttendanceSnapshot;
  expect(currentWorkday(data)).toBeUndefined();
  expect(
    workPositionAllowed(
      { ...shift, finishesAt: undefined },
      "Africa/Windhoek",
      Date.parse("2026-10-13T20:00Z"),
    ),
  ).toBe(false);
});
it("tracks across midnight but clears at the exact planned finish", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T01:59:59Z"));
  const watch = vi.fn().mockReturnValue(7),
    clear = vi.fn(),
    send = vi.fn().mockResolvedValue({});
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: watch, clearWatch: clear },
  });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  const stop = watchWorkPosition(shift, "Africa/Windhoek", send, vi.fn());
  expect(watch).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000);
  expect(clear).toHaveBeenCalledWith(7);
  expect(send).toHaveBeenCalledWith("clear_position", {});
  stop();
});
