import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LiveWorkerApp from "../../worker-ui/src/LiveWorkerApp";
import type { AttendanceSnapshot } from "../../shared/attendance";
const api = vi.hoisted(() => ({ snapshot: vi.fn(), command: vi.fn(), watch: vi.fn() }));
vi.mock("../../worker-ui/src/backend", () => api);
vi.mock("../../shared/watch-work-position", () => ({ watchWorkPosition: vi.fn(() => () => {}) }));
const initial = {
  me: "worker",
  today: "2026-10-13",
  role: "employee",
  company: { id: "company", name: "Company", timezone: "Africa/Windhoek" },
  employees: [{ id: "worker", name: "Worker", role: "employee" }],
  sites: [],
  jobs: [],
  messages: [],
  submissions: [],
  notices: [],
  shifts: [
    {
      id: "shift",
      employeeId: "worker",
      date: "2026-10-13",
      start: "08:00",
      end: "20:00",
      totals: {
        recordedMinutes: 0,
        workedMinutes: 0,
        lunchMinutes: 0,
        personalMinutes: 0,
        overtimeMinutes: 0,
      },
    },
  ],
  states: [{ shiftId: "shift", employeeId: "worker", state: "working" }],
  events: [
    {
      id: "in",
      shiftId: "shift",
      employeeId: "worker",
      type: "clock_in",
      capturedAt: Date.now() - 60000,
      sync: "synced",
    },
  ],
} as unknown as AttendanceSnapshot;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.snapshot.mockResolvedValue(initial);
  api.watch.mockReturnValue(() => {});
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("saves offline lunch, restores it after remount and replays the original ID on reconnection", async () => {
  const first = render(<LiveWorkerApp onSignOut={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Start" }));
  expect(await screen.findByText(/1 attendance event\(s\) saved/)).toBeInTheDocument();
  expect(api.command).not.toHaveBeenCalled();
  const savedKey = Object.keys(localStorage).find((key) =>
    key.startsWith("shiftline-attendance:"),
  )!;
  const payload = JSON.parse(localStorage.getItem(savedKey)!).event;
  expect(payload.type).toBe("start_lunch");
  expect(payload.offline).toBe(true);
  expect(payload.location).toBeUndefined();
  first.unmount();
  render(<LiveWorkerApp onSignOut={vi.fn()} />);
  expect(await screen.findByText(/1 attendance event\(s\) saved/)).toBeInTheDocument();
  api.command.mockResolvedValue({
    status: "synced",
    snapshot: {
      ...initial,
      states: [{ shiftId: "shift", employeeId: "worker", state: "on_lunch" }],
      events: [
        ...initial.events,
        {
          ...payload,
          capturedAt: Date.parse(payload.capturedAt),
          employeeId: "worker",
          sync: "synced",
        },
      ],
    },
  });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fireEvent(window, new Event("online"));
  await waitFor(() => expect(api.command).toHaveBeenCalledWith("submit_attendance", payload));
  await waitFor(() => expect(localStorage.getItem(savedKey)).toBeNull());
  expect(await screen.findByText("Saved attendance synchronized")).toBeInTheDocument();
});
