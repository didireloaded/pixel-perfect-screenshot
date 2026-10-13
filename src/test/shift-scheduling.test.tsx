import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerShiftForm } from "@/components/app/ManagerShiftForm";
import { ManagerCalendar } from "@/components/app/ManagerCalendar";
import type { Shift } from "../../shared/attendance";
const state = vi.hoisted(() => ({ useAttendance: vi.fn() }));
vi.mock("@/lib/app-store", () => state);
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const draft = {
  employeeId: "worker",
  siteId: "site",
  date: "2026-10-13",
  start: "08:00",
  end: "17:00",
  lunch: "12:00",
  lunchMinutes: 60,
  regularMinutes: 480,
};
const shift = { ...draft, id: "shift", trackingStop: "17:00", totals: {} } as Shift;
const employee = {
  id: "worker",
  name: "Worker",
  no: "SL-100001",
  siteId: "site",
  role: "employee",
  accessStatus: "active",
};
let data: ReturnType<typeof fixture>;
function fixture() {
  return {
    today: draft.date,
    employees: [employee],
    sites: [{ id: "site", name: "Yard" }],
    shifts: [] as Shift[],
    events: [] as { shiftId: string }[],
    jobs: [],
    notices: [],
    submissions: [] as { shift_id: string }[],
    corrections: [],
    periods: [] as { start: string; end: string }[],
    timesheets: [] as { shiftId: string; status: string }[],
    busy: false,
    online: true,
    command: vi.fn().mockResolvedValue({ snapshot: {} }),
  };
}
beforeEach(() => {
  data = fixture();
  state.useAttendance.mockImplementation(() => data);
});
afterEach(cleanup);

describe("calendar scheduling", () => {
  it("shows attendance without requiring managers to assign a shift", () => {
    render(<ManagerCalendar data={data as never} />);
    expect(screen.queryByRole("button", { name: "Assign shift" })).not.toBeInTheDocument();
    expect(screen.getByText(/Workers check in to start/)).toBeInTheDocument();
  });
  it("selects existing attendance without opening a schedule editor", () => {
    data.shifts = [shift];
    render(<ManagerCalendar data={data as never} />);
    fireEvent.click(
      screen.getByRole("button", { name: `View Worker attendance on ${draft.date}` }),
    );
    expect(screen.getByText("1 attendance records")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(data.command).not.toHaveBeenCalled();
  });
  it("keeps unsaved edits when the server rejects a stale save", async () => {
    data.command.mockResolvedValue(null);
    const onSaved = vi.fn();
    render(
      <ManagerShiftForm
        date={draft.date}
        shift={shift}
        onSaved={onSaved}
        onEditExisting={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Shift starts"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(data.command).toHaveBeenCalledOnce());
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Shift starts")).toHaveValue("09:00");
  });
  it("protects recorded attendance and locked periods in the editor", () => {
    data.events = [{ shiftId: shift.id }];
    const view = render(
      <ManagerShiftForm
        date={draft.date}
        shift={shift}
        onSaved={vi.fn()}
        onEditExisting={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText(/Use Corrections/)).toBeInTheDocument();
    expect(screen.getByLabelText("Site")).toBeDisabled();
    data.events = [];
    data.periods = [{ start: draft.date, end: draft.date }];
    view.rerender(
      <ManagerShiftForm
        date={draft.date}
        shift={shift}
        onSaved={vi.fn()}
        onEditExisting={vi.fn()}
      />,
    );
    expect(screen.getByText(/locked payroll period/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});
