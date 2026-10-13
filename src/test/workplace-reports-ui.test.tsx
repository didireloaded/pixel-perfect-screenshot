import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkplaceReports } from "../components/app/WorkplaceReports";
import { WorkerActivities } from "../../worker-ui/src/components/WorkerActivities";
import type { AttendanceSnapshot } from "../../shared/attendance";
const api = vi.hoisted(() => ({
  command: vi.fn().mockResolvedValue({ snapshot: {} }),
  refresh: vi.fn(),
}));
const data = {
  me: "worker",
  today: "2026-10-13",
  company: { id: "company", timezone: "Africa/Windhoek" },
  employees: [{ id: "worker", name: "Worker", role: "employee", team: "Operations" }],
  sites: [],
  shifts: [{ id: "shift", employeeId: "worker", date: "2026-10-13" }],
  jobs: [],
  incidents: [],
  workActivities: [],
  incidentExceptions: [],
  reportDocuments: [],
  busy: false,
  online: true,
};
vi.mock("../lib/app-store", () => ({ useAttendance: () => ({ ...data, ...api }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("submits an official incident with company-local times and no pay-adjustment fields", async () => {
  render(<WorkplaceReports />);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Power outage" } });
  fireEvent.change(screen.getByLabelText("What happened?"), {
    target: { value: "Office operations stopped." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit official report" }));
  await waitFor(() =>
    expect(api.command).toHaveBeenCalledWith(
      "create_incident",
      expect.objectContaining({
        kind: "power_outage",
        title: "Power outage",
        scope: "company",
        startsLocal: "2026-10-13T08:00",
        endsLocal: "2026-10-13T17:00",
      }),
    ),
  );
  const payload = api.command.mock.calls[0]![1];
  expect(payload).not.toHaveProperty("payableHours");
  expect(screen.getByText(/never changes attendance hours or pay/)).toBeInTheDocument();
});
it("records a worker-confirmed description without inventing an activity classification", async () => {
  const run = vi.fn().mockResolvedValue(true);
  render(
    <WorkerActivities
      data={data as unknown as AttendanceSnapshot}
      state="working"
      busy={false}
      online
      run={run}
    />,
  );
  fireEvent.change(screen.getByLabelText("Short explanation"), {
    target: { value: "Moving equipment from warehouse to venue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record activity" }));
  await waitFor(() =>
    expect(run).toHaveBeenCalledWith(
      "record_work_activity",
      expect.objectContaining({
        kind: "other",
        shiftId: "shift",
        jobId: null,
        description: "Moving equipment from warehouse to venue",
      }),
      "Work activity recorded",
    ),
  );
});
it("shows confirmed incident context separately from attendance and hides recording during lunch", () => {
  render(
    <WorkerActivities
      data={
        {
          ...data,
          incidents: [
            {
              id: "incident",
              title: "Power outage",
              description: "Management report",
              starts_at: "2026-10-13T12:00:00Z",
              ends_at: "2026-10-13T15:00:00Z",
            },
          ],
          incidentExceptions: [{ id: "link", incident_id: "incident", status: "pending" }],
        } as unknown as AttendanceSnapshot
      }
      state="on_lunch"
      busy={false}
      online
      run={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Record activity" })).not.toBeInTheDocument();
  expect(screen.getByText("Attendance impact awaiting review")).toBeInTheDocument();
  expect(screen.getByText(/does not automatically change your hours or pay/)).toBeInTheDocument();
});
