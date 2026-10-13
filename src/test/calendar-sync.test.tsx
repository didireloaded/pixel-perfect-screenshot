import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AttendanceCalendar } from "../../worker-ui/src/components/AttendanceCalendar";
import type { AttendanceSnapshot } from "../../shared/attendance";

it("updates open shift details when the shared snapshot changes", () => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  const data = {
    me: "worker",
    today: "2026-10-13",
    company: { timezone: "Africa/Windhoek" },
    sites: [{ id: "site", name: "Office" }],
    events: [],
    timesheets: [],
    shifts: [
      {
        id: "shift",
        employeeId: "worker",
        date: "2026-10-13",
        siteId: "site",
        start: "08:00",
        end: "17:00",
        totals: { workedMinutes: 0, lunchMinutes: 0, personalMinutes: 0, overtimeMinutes: 0 },
      },
    ],
  } as unknown as AttendanceSnapshot;
  const { rerender } = render(<AttendanceCalendar data={data} onCorrection={vi.fn()} />);
  expect(screen.getByLabelText("Shift scheduled")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /13 Scheduled/ }));
  const updated = { ...data, shifts: data.shifts.map((shift) => ({ ...shift, start: "09:00" })) };
  rerender(<AttendanceCalendar data={updated} onCorrection={vi.fn()} />);
  expect(screen.getByText("09:00–17:00")).toBeInTheDocument();
  expect(screen.queryByText("08:00–17:00")).not.toBeInTheDocument();
});
