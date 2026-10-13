import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ManagerCalendar } from "../components/app/ManagerCalendar";
import { WorkerJobCalendar } from "../../worker-ui/src/components/WorkerJobCalendar";
import { hrSummary } from "../../shared/hr-summary";
import { geofencePolygon } from "../../shared/geofence-polygon";
import { liveWorkMinutes } from "../../shared/live-work-minutes";
import type { AttendanceSnapshot } from "../../shared/attendance";
const { command } = vi.hoisted(() => ({ command: vi.fn().mockResolvedValue({ snapshot: {} }) }));
vi.mock("../lib/app-store", () => ({
  useAttendance: () => ({
    employees: [{ id: "worker", name: "Worker", role: "employee", accessStatus: "active" }],
    busy: false,
    online: true,
    command,
  }),
}));
const data = {
  me: "worker",
  today: "2026-10-13",
  company: { timezone: "Africa/Windhoek" },
  employees: [
    { id: "worker", name: "Worker", role: "employee", accessStatus: "active" },
    { id: "awaiting", role: "employee", accessStatus: "active" },
    { id: "pending", role: "employee", accessStatus: "pending" },
  ],
  jobs: [],
  shifts: [{ id: "shift", employeeId: "worker", date: "2026-10-13" }],
  events: [{ id: "clockin", shiftId: "shift", employeeId: "worker", type: "clock_in" }],
  requests: [],
  calendarJobs: [
    {
      id: "job",
      date: "2026-10-13",
      title: "Equipment inspection",
      details: "Inspect the generator and record issues.",
      employeeIds: ["worker"],
      assignedNames: ["Worker"],
    },
  ],
} as unknown as AttendanceSnapshot;
afterEach(cleanup);
it("creates a date-based calendar job with optional assignment and no attendance fields", async () => {
  render(<ManagerCalendar data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "New job" }));
  expect(screen.getByLabelText("Date")).toHaveValue("2026-10-13");
  expect(screen.queryByLabelText("Shift starts")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "New inspection" } });
  fireEvent.change(screen.getByLabelText("Job details"), { target: { value: "Check generator" } });
  fireEvent.click(screen.getByRole("button", { name: "Add job" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(
      "create_calendar_job",
      expect.objectContaining({
        date: "2026-10-13",
        title: "New inspection",
        details: "Check generator",
        employeeIds: [],
      }),
    ),
  );
});
it("workers see the same job and open updated details without an assigned shift", () => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const { rerender } = render(<WorkerJobCalendar data={{ ...data, shifts: [] }} />);
  expect(screen.getByText("Assigned to you")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Equipment inspection Inspect/ }));
  rerender(
    <WorkerJobCalendar
      data={{
        ...data,
        shifts: [],
        calendarJobs: data.calendarJobs!.map((job) => ({
          ...job,
          details: "Updated instructions",
        })),
      }}
    />,
  );
  expect(screen.getAllByText("Updated instructions").length).toBeGreaterThan(0);
});
it("HR counts approved employees and recorded attendance without inventing absence", () => {
  const summary = hrSummary({
    ...data,
    events: [...data.events, ...data.events],
    requests: [
      {
        id: "leave",
        kind: "leave",
        employeeId: "awaiting",
        status: "approved",
        leaveStart: "2026-10-13",
        leaveEnd: "2026-10-13",
      },
    ] as AttendanceSnapshot["requests"],
  });
  expect(summary.employees).toHaveLength(2);
  expect(summary.present.size).toBe(1);
  expect(summary.onLeave.size).toBe(1);
  expect(summary.awaiting).toHaveLength(0);
});
it("geofence rings close and represent metre distances around the workplace", () => {
  const ring = geofencePolygon(0, 0, 150);
  expect(ring).toHaveLength(65);
  expect(ring[0]).toEqual(ring[64]);
  expect(ring[0]![1]).toBeCloseTo(((150 / 6371000) * 180) / Math.PI, 8);
  expect(ring[16]![0]).toBeCloseTo(((150 / 6371000) * 180) / Math.PI, 8);
});
it("live work estimates pause for lunch and never change payroll totals", () => {
  const shift = {
    id: "shift",
    totals: { recordedMinutes: 60, workedMinutes: 60 },
  } as AttendanceSnapshot["shifts"][number];
  const start = Date.parse("2026-10-13T09:00:00Z");
  const events = [
    { id: "clock", shiftId: "shift", employeeId: "worker", type: "clock_in", capturedAt: start },
  ] as AttendanceSnapshot["events"];
  expect(liveWorkMinutes(shift, "working", events, start + 30 * 60000)).toEqual({
    minutes: 90,
    estimated: true,
  });
  expect(liveWorkMinutes(shift, "on_lunch", events, start + 30 * 60000)).toEqual({
    minutes: 60,
    estimated: false,
  });
  expect(liveWorkMinutes(shift, "clocked_out", events, start + 30 * 60000)).toEqual({
    minutes: 60,
    estimated: false,
  });
  expect(shift.totals.workedMinutes).toBe(60);
});
