import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PunctualityHistory, PunctualitySettings } from "../components/app/Punctuality";
const api = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("../lib/backend", () => ({ punctuality: api.call }));
vi.mock("../lib/app-store", () => ({
  useAttendance: () => ({
    company: { id: "company", timezone: "Africa/Windhoek", checkinCloseTime: "17:00" },
    accessRole: "owner",
    online: true,
    today: "2026-10-19",
    employees: [
      { id: "worker", name: "John", role: "employee", activated: true, accessStatus: "active" },
    ],
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires an explicit roster and saves configured hours for the next day", async () => {
  api.call.mockResolvedValue({ policy: null, records: [] });
  render(<PunctualitySettings />);
  const enable = screen.getByLabelText("Enable check-in reminders");
  await waitFor(() => expect(enable).toBeEnabled());
  fireEvent.click(enable);
  expect(screen.getByRole("button", { name: "Save rule for tomorrow" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("John"));
  fireEvent.change(screen.getByLabelText("Expected start"), { target: { value: "09:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Save rule for tomorrow" }));
  await waitFor(() =>
    expect(api.call).toHaveBeenCalledWith(
      "configure",
      expect.objectContaining({
        enabled: true,
        employeeIds: ["worker"],
        start: "09:00",
        weekdays: [1, 2, 3, 4, 5],
      }),
    ),
  );
});

it("shows precise lateness and keeps a missing check-in separate from absence", async () => {
  api.call.mockResolvedValue({
    policy: null,
    records: [
      {
        id: "one",
        employeeId: "worker",
        expectedAt: "2026-10-19T06:00:00Z",
        clockInAt: "2026-10-19T06:10:12Z",
        originalClockInAt: "2026-10-19T06:10:12Z",
        status: "late",
        lateSeconds: 612,
      },
      {
        id: "two",
        employeeId: "worker",
        expectedAt: "2026-10-19T06:00:00Z",
        clockInAt: null,
        status: "no_checkin",
        lateSeconds: null,
      },
    ],
  });
  render(<PunctualityHistory />);
  expect(await screen.findByText("10m 12s late")).toBeInTheDocument();
  expect(screen.getByText("No check-in recorded")).toBeInTheDocument();
  expect(screen.getByText(/not confirmed absence/)).toBeInTheDocument();
});
