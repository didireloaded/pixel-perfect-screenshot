import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkerPermissions } from "../../worker-ui/src/components/WorkerPermissions";
import { jobRunsOn, jobPhase } from "../../shared/calendar-jobs";
import type { CalendarJob } from "../../shared/attendance";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("explains denied location without claiming permission was granted", async () => {
  const enabled = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: vi.fn((_success, error) => error({ code: 1 })) },
  });
  render(
    <WorkerPermissions
      employeeId="worker"
      companyId="company"
      required
      onEnabled={enabled}
      onNotifications={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Allow work location" }));
  expect(screen.getByRole("status")).toHaveTextContent("Location is blocked");
  expect(enabled).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Your company requires location" })).toBeDisabled();
});
it("remembers acknowledged setup only for this company and employee", async () => {
  const enabled = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success) => success({ coords: { latitude: 0, longitude: 0 } })),
    },
  });
  const props = {
    employeeId: "worker",
    companyId: "company",
    required: true,
    onEnabled: enabled,
    onNotifications: vi.fn(),
  };
  const { rerender } = render(<WorkerPermissions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Allow work location" }));
  expect(enabled).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.queryByText("Set up your work phone")).not.toBeInTheDocument();
  rerender(<WorkerPermissions {...props} employeeId="other" />);
  await waitFor(() => expect(screen.getByText("Set up your work phone")).toBeInTheDocument());
});
it("shows a job on every planned date and never infers completion from an elapsed date", () => {
  const plan = { date: "2026-12-26", endDate: "2026-12-29" } as CalendarJob;
  expect(jobRunsOn(plan, "2026-12-28")).toBe(true);
  expect(jobRunsOn(plan, "2026-12-30")).toBe(false);
  expect(jobPhase(plan, "2026-12-30")).toBe("in_progress");
  expect(jobPhase({ ...plan, completedAt: "2026-12-29T17:00:00Z" }, "2026-12-30")).toBe(
    "completed",
  );
});
