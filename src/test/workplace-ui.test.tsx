import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemedSelect } from "../../shared/ThemedSelect";
import { NoticeCard } from "../../worker-ui/src/components/NoticeDetails";
import { WorkerHome } from "../../worker-ui/src/components/WorkerHome";
import { deriveState, computeDay } from "@/lib/attendance";
import type { AttendanceSnapshot, CompanyNotice, AttendanceEvent } from "../../shared/attendance";
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});
afterEach(cleanup);
it("dropdowns submit real values, clear filters and reset with their form", async () => {
  const submit = vi.fn();
  render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget).get("department"));
      }}
    >
      <label>
        Department
        <ThemedSelect name="department" defaultValue="">
          <option value="">All departments</option>
          <option value="HR">HR</option>
          <option value="Operations">Operations</option>
        </ThemedSelect>
      </label>
      <button>Save</button>
      <button type="reset">Reset</button>
    </form>,
  );
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Department" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "HR" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenLastCalledWith("HR");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "All departments" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenLastCalledWith("");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Operations" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("All departments"));
});
it("company updates open a full detail sheet with acknowledgement", async () => {
  const notice: CompanyNotice = {
    id: "notice",
    kind: "announcement",
    title: "New work hours",
    body: "The complete update, with all company details.\nPlease check your assigned schedule.",
    startsOn: "2026-10-13",
    endsOn: "2026-10-14",
    requiresAck: true,
    acknowledged: false,
    createdAt: "2026-10-13",
  };
  const ack = vi.fn().mockResolvedValue(true);
  render(<NoticeCard notice={notice} busy={false} onAcknowledge={ack} />);
  fireEvent.click(screen.getByRole("button", { name: /Read update/ }));
  expect(screen.getByRole("dialog", { name: "New work hours" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "I’ve read this update" }));
  expect(ack).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("job lunch is available from Today and display rules resume the active job", () => {
  const action = vi.fn();
  const ev = (type: AttendanceEvent["type"], h: number): AttendanceEvent => ({
    id: type,
    type,
    employeeId: "worker",
    shiftId: "shift",
    jobId: "job",
    capturedAt: Date.UTC(2026, 9, 13, h),
    sync: "synced",
  });
  const events = [
    ev("clock_in", 8),
    ev("start_job", 10),
    ev("start_lunch", 12),
    ev("end_lunch", 13),
  ];
  expect(deriveState(events)).toBe("on_job");
  expect(
    computeDay([...events, ev("end_job", 16), ev("clock_out", 17)], {
      version: 1,
      lunchPaid: false,
      dailyRegularMinutes: 480,
    }).workedMinutes,
  ).toBe(480);
  const data = {
    me: "worker",
    today: "2026-10-13",
    company: { timezone: "UTC" },
    events: [ev("clock_in", 8), ev("start_job", 10)],
    notices: [],
    sites: [],
    shifts: [
      {
        id: "shift",
        employeeId: "worker",
        date: "2026-10-13",
        start: "08:00",
        end: "17:00",
        totals: { workedMinutes: 0 },
      },
    ],
    jobs: [
      {
        id: "job",
        shiftId: "shift",
        assignee: "worker",
        date: "2026-10-13",
        title: "Inspection",
        destination: "Job site",
        status: "in_progress",
        latitude: -22.6,
      },
    ],
  } as unknown as AttendanceSnapshot;
  render(
    <WorkerHome
      data={data}
      state="on_job"
      busy={false}
      onAction={action}
      onDeparture={vi.fn()}
      onJobs={vi.fn()}
      onMonitoring={vi.fn()}
      monitoring={false}
      onAcknowledge={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Start$/ }));
  expect(action).toHaveBeenCalledWith("start_lunch");
  expect(screen.getByText("Job site")).toBeInTheDocument();
});
