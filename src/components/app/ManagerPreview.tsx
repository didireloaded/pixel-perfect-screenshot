import { ManagerDemoWorkspace } from "./ManagerDemoWorkspace";
import { type InsightData } from "./ManagerInsights";
import type { Totals } from "../../../shared/attendance";

import type { Job, JobStep, JobTeamMember } from "../../../shared/attendance";

const people: Record<string, string> = {
  alex: "Alex Martin",
  david: "David Okafor",
  priya: "Priya Kaur",
};
const demoJobs: Job[] = [
  {
    id: "j1",
    shiftId: "s1",
    title: "Main office safety check",
    instructions: "Inspect emergency exits and log any blocked access points.",
    date: "2026-10-11",
    start: "08:30",
    end: "10:00",
    destination: "Main Office",
    supervisor: "Manager",
    status: "assigned",
    assignee: "alex",
  },
  {
    id: "j2",
    shiftId: "s2",
    title: "Equipment delivery",
    instructions: "Collect replacement units and confirm the handover.",
    date: "2026-10-12",
    start: "11:00",
    end: "12:30",
    destination: "Warehouse",
    supervisor: "Manager",
    status: "assigned",
    assignee: "david",
  },
  {
    id: "j3",
    shiftId: "s3",
    title: "Site inspection",
    instructions: "Complete the north gate checklist and report the findings.",
    date: "2026-10-10",
    start: "09:00",
    end: "13:00",
    destination: "North Gate",
    supervisor: "Manager",
    status: "assigned",
    assignee: "priya",
  },
  {
    id: "j4",
    shiftId: "s4",
    title: "Maintenance support",
    instructions: "Assist the technician with the scheduled power check.",
    date: "2026-10-10",
    start: "10:00",
    end: "14:00",
    destination: "Plant Room",
    supervisor: "Manager",
    status: "in_progress",
    assignee: "alex",
  },
  {
    id: "j5",
    shiftId: "history-0",
    title: "Vehicle inspection",
    instructions: "Record checks for fleet vehicles before departure.",
    date: "2026-10-09",
    start: "07:00",
    end: "08:00",
    destination: "Depot",
    supervisor: "Manager",
    status: "completed",
    assignee: "david",
  },
  {
    id: "j6",
    shiftId: "history-1",
    title: "Safety briefing",
    instructions: "Review the updated site entry procedure with the team.",
    date: "2026-10-08",
    start: "08:00",
    end: "08:45",
    destination: "Main Office",
    supervisor: "Manager",
    status: "completed",
    assignee: "priya",
  },
];
const demoSteps: JobStep[] = [
  {
    id: "st1",
    jobId: "j4",
    label: "Inspect supply",
    sortOrder: 0,
    completedAt: "2026-10-10T09:30:00Z",
  },
  { id: "st2", jobId: "j4", label: "Submit report", sortOrder: 1, completedAt: null },
  {
    id: "st3",
    jobId: "j5",
    label: "Check vehicle",
    sortOrder: 0,
    completedAt: "2026-10-10T08:00:00Z",
  },
];
const demoTeam: JobTeamMember[] = [
  { jobId: "j1", employeeId: "alex", name: "Alex Martin", team: "Operations" },
  { jobId: "j2", employeeId: "david", name: "David Okafor", team: "Fleet" },
  { jobId: "j3", employeeId: "priya", name: "Priya Kaur", team: "Operations" },
  { jobId: "j4", employeeId: "alex", name: "Alex Martin", team: "Operations" },
  { jobId: "j4", employeeId: "priya", name: "Priya Kaur", team: "Operations" },
  { jobId: "j5", employeeId: "david", name: "David Okafor", team: "Fleet" },
];
const emptyTotals: Totals = {
  recordedSeconds: 0,
  regularSeconds: 0,
  overtimeSecondsApproved: 0,
  overtimeSecondsPending: 0,
  paidBreakSeconds: 0,
  unpaidBreakSeconds: 0,
  personalSeconds: 0,
  payableSeconds: 0,
  policyVersion: 1,
  workedMinutes: 0,
  recordedMinutes: 0,
  regularMinutes: 0,
  overtimeMinutes: 0,
  unapprovedOvertimeMinutes: 0,
  lunchMinutes: 0,
  personalMinutes: 0,
  missingClockOut: false,
  complete: false,
};
const previewInsights: InsightData = {
  today: "2026-10-10",
  company: { id: "preview", name: "Project Inc.", timezone: "Africa/Windhoek" },
  employees: Object.entries(people).map(([id, name]) => ({
    id,
    name,
    no: id,
    team: "Operations",
    siteId: "office",
    role: "employee",
    activated: true,
    payrollAdmin: false,
  })),
  shifts: Object.keys(people).map((id, index) => ({
    id: `shift-${index}`,
    employeeId: id,
    date: "2026-10-10",
    start: "08:00",
    end: "17:00",
    lunch: "12:00",
    lunchMinutes: 60,
    trackingStop: "17:00",
    siteId: "office",
    regularMinutes: 480,
    totals: emptyTotals,
  })),
  events: [
    {
      id: "event-1",
      shiftId: "shift-0",
      employeeId: "alex",
      type: "clock_in",
      capturedAt: new Date("2026-10-10T06:02:00Z").getTime(),
      sync: "synced",
    },
    {
      id: "event-2",
      shiftId: "shift-1",
      employeeId: "david",
      type: "clock_in",
      capturedAt: new Date("2026-10-10T06:05:00Z").getTime(),
      sync: "synced",
    },
  ],
  states: [
    { shiftId: "shift-0", employeeId: "alex", state: "working" },
    { shiftId: "shift-1", employeeId: "david", state: "on_lunch" },
  ],
  requests: [],
  messages: [],
  notices: [],
};
for (const [index, employeeId] of ["david", "priya"].entries()) {
  const date = index === 0 ? "2026-10-09" : "2026-10-08";
  const shiftId = `history-${index}`;
  previewInsights.shifts.push({
    ...previewInsights.shifts[index]!,
    id: shiftId,
    employeeId,
    date,
    totals: {
      ...emptyTotals,
      workedMinutes: 480,
      recordedMinutes: 480,
      regularMinutes: 480,
      recordedSeconds: 28800,
      regularSeconds: 28800,
      payableSeconds: 28800,
      lunchMinutes: 60,
      complete: true,
    },
  });
  for (const [type, time] of [
    ["clock_in", "06:00"],
    ["clock_out", "15:00"],
  ] as const)
    previewInsights.events.push({
      id: `${shiftId}-${type}`,
      shiftId,
      employeeId,
      type,
      capturedAt: new Date(`${date}T${time}:00Z`).getTime(),
      sync: "synced",
    });
}
export function ManagerPreview({ onConnect }: { onConnect: () => void }) {
  return (
    <ManagerDemoWorkspace
      onConnect={onConnect}
      initialJobs={demoJobs}
      initialSteps={demoSteps}
      initialTeam={demoTeam}
      base={previewInsights}
    />
  );
}
