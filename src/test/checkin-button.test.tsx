import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkerHome } from "../../worker-ui/src/components/WorkerHome";
import type { AttendanceSnapshot } from "../../shared/attendance";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("disables check-in at the cutoff without disabling clock-out", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T14:59:59Z"));
  const data = {
    me: "worker",
    company: { timezone: "Africa/Windhoek", checkinCloseTime: "17:00" },
    today: "2026-10-14",
    shifts: [],
    events: [],
    jobs: [],
    sites: [],
    notices: [],
  } as unknown as AttendanceSnapshot;
  const props = {
    data,
    busy: false,
    onAction: vi.fn(),
    onDeparture: vi.fn(),
    onJobs: vi.fn(),
    onMonitoring: vi.fn(),
    monitoring: false,
    onAcknowledge: vi.fn(),
  };
  const view = render(<WorkerHome {...props} state="not_clocked_in" />);
  const button = screen.getByRole("button", { name: /clock in|check in/i });
  expect(button).toBeEnabled();
  act(() => vi.advanceTimersByTime(1000));
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent(/(?:clock|check)-in closed/i);
  view.rerender(<WorkerHome {...props} state="working" />);
  expect(screen.getByRole("button", { name: "Clock out" })).toBeEnabled();
});
