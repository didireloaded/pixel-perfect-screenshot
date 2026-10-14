import { describe, expect, it } from "vitest";
import { jobDepartureBlock } from "../../worker-ui/src/job-departure";
import type { CalendarJob } from "../../shared/attendance";

const plan: CalendarJob = {
  id: "job",
  title: "Setup",
  details: "Stage setup",
  date: "2026-10-14",
  address: "Confirmed venue",
  latitude: -22.6,
  longitude: 17.08,
  employeeIds: [],
  assignedNames: [],
};
const context = {
  today: "2026-10-14",
  employeeId: "worker",
  state: "working" as const,
  busy: false,
  online: true,
  pendingAttendance: false,
  reviewPending: false,
};
describe("job departure availability", () => {
  it("allows a working employee to depart for a located job today", () => {
    expect(jobDepartureBlock(plan, context)).toBeNull();
  });
  it("explains every attendance state that blocks departure", () => {
    for (const state of [
      "not_clocked_in",
      "clocked_out",
      "on_lunch",
      "on_personal",
      "on_job",
    ] as const)
      expect(jobDepartureBlock(plan, { ...context, state })).toBeTruthy();
  });
  it("requires both coordinates, an address, and today's date", () => {
    for (const change of [{ latitude: null }, { longitude: null }, { address: "" }])
      expect(jobDepartureBlock({ ...plan, ...change }, context)).toContain("map pin");
    expect(jobDepartureBlock({ ...plan, date: "2026-10-15" }, context)).toContain("2026-10-15");
  });
  it("preserves crew, network, sync and review restrictions", () => {
    expect(jobDepartureBlock({ ...plan, employeeIds: ["other"] }, context)).toContain("assigned");
    expect(jobDepartureBlock({ ...plan, employeeIds: ["worker"] }, context)).toBeNull();
    for (const change of [
      { online: false },
      { busy: true },
      { pendingAttendance: true },
      { reviewPending: true },
    ])
      expect(jobDepartureBlock(plan, { ...context, ...change })).toBeTruthy();
  });
});
