import { useState } from "react";
import { ManagerFrame } from "./ManagerFrame";
import type { ManagerSection } from "./manager-sections";
import { ManagerJobBoard } from "./ManagerJobBoard";
import type { Job, JobStep, JobTeamMember } from "../../../shared/attendance";

const people: Record<string, string> = {
  alex: "Alex Martin",
  david: "David Okafor",
  priya: "Priya Kaur",
};
const jobs: Job[] = [
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
    shiftId: "s5",
    title: "Vehicle inspection",
    instructions: "Record checks for fleet vehicles before departure.",
    date: "2026-10-10",
    start: "07:00",
    end: "08:00",
    destination: "Depot",
    supervisor: "Manager",
    status: "completed",
    assignee: "david",
  },
  {
    id: "j6",
    shiftId: "s6",
    title: "Safety briefing",
    instructions: "Review the updated site entry procedure with the team.",
    date: "2026-10-10",
    start: "08:00",
    end: "08:45",
    destination: "Main Office",
    supervisor: "Manager",
    status: "completed",
    assignee: "priya",
  },
];
const steps: JobStep[] = [
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
const team: JobTeamMember[] = [
  { jobId: "j1", employeeId: "alex", name: "Alex Martin", team: "Operations" },
  { jobId: "j2", employeeId: "david", name: "David Okafor", team: "Fleet" },
  { jobId: "j3", employeeId: "priya", name: "Priya Kaur", team: "Operations" },
  { jobId: "j4", employeeId: "alex", name: "Alex Martin", team: "Operations" },
  { jobId: "j4", employeeId: "priya", name: "Priya Kaur", team: "Operations" },
  { jobId: "j5", employeeId: "david", name: "David Okafor", team: "Fleet" },
];
const examples: Partial<
  Record<ManagerSection, { title: string; description: string; rows: string[] }>
> = {
  Calendar: {
    title: "Work calendar",
    description: "Shifts, jobs and company events at a glance.",
    rows: [
      "10 Oct · 08:00–17:00 · Alex Martin · Main Office",
      "10 Oct · 07:30–16:30 · David Okafor · Depot",
      "11 Oct · Main office safety check",
    ],
  },
  Notes: {
    title: "Manager notes",
    description: "Private notes shared with other managers.",
    rows: ["North gate access code updated", "Confirm Monday maintenance schedule"],
  },
  Reports: {
    title: "Daily activity",
    description: "Attendance and task completion for 10 October.",
    rows: [
      "3 scheduled workers · 2 clocked in",
      "6 jobs · 2 completed",
      "1 timesheet awaiting review",
    ],
  },
  Views: {
    title: "Work overview",
    description: "Your team, workday and approvals in one place.",
    rows: ["3 workers scheduled today", "2 jobs in progress", "1 approval waiting"],
  },
  "Project management": {
    title: "Project management",
    description: "Assign task steps and build job teams.",
    rows: [
      "Maintenance support · 1 of 2 steps done",
      "Main office safety check · Alex Martin",
      "Equipment delivery · David Okafor",
    ],
  },
  Attendance: {
    title: "Clock in and clock out",
    description: "Worker attendance updates appear here during their shifts.",
    rows: [
      "Alex Martin · Clocked in 08:02 · Working",
      "David Okafor · Clocked in 07:31 · On job",
      "Priya Kaur · Clocked in 08:00 · On lunch",
    ],
  },
  Map: {
    title: "Team locations",
    description: "Worksite checks are visible during active shifts only.",
    rows: [
      "Main Office · 1 worker recently confirmed",
      "Depot · 1 worker recently confirmed",
      "No off-duty tracking",
    ],
  },
  Messages: {
    title: "Conversations",
    description: "Manager and worker messages.",
    rows: ["Alex Martin · Site inspection update", "David Okafor · Tomorrow’s assignment"],
  },
  Team: {
    title: "Your team",
    description: "People, employee numbers and assigned worksites.",
    rows: ["Alex Martin · Main Office", "David Okafor · Depot", "Priya Kaur · Main Office"],
  },
  Requests: {
    title: "Requests",
    description: "Leave, exceptions and overtime awaiting a decision.",
    rows: ["Leave request · Awaiting decision", "Timesheet · Overtime requested"],
  },
  Announcements: {
    title: "Company news",
    description: "Publish news, holidays, closures and events.",
    rows: ["Maintenance notice", "Team safety briefing"],
  },
  Corrections: {
    title: "Corrections",
    description: "Review attendance adjustments with an audit trail.",
    rows: ["Missing clock-out · Awaiting review"],
  },
  Policies: {
    title: "Attendance policies",
    description: "Set worksite checks, lunch and overtime rules.",
    rows: ["Worksite geofence", "Lunch schedule", "Location privacy window"],
  },
  Audit: {
    title: "Audit history",
    description: "See who changed records and when.",
    rows: ["Attendance action · 08:02", "Manager approval · 09:14"],
  },
  Kiosk: {
    title: "Supervised kiosk",
    description: "A shared device can record attendance at a worksite.",
    rows: ["Main Office kiosk", "Supervisor verification"],
  },
};

export function ManagerPreview({ onConnect }: { onConnect: () => void }) {
  const [section, setSection] = useState<ManagerSection>("Tasks");
  const detail = examples[section];
  return (
    <ManagerFrame
      active={section}
      onSelect={setSection}
      company="Project Inc."
      preview
      onConnect={onConnect}
    >
      {section === "Tasks" ? (
        <ManagerJobBoard
          jobs={jobs}
          steps={steps}
          team={team}
          names={(id) => people[id] || "Worker"}
          today="2026-10-10"
          onAdd={onConnect}
        />
      ) : (
        <section className="project-panel project-preview-section">
          <p className="project-panel-kicker">PROJECT INC. / {section.toUpperCase()}</p>
          <h2>{detail?.title || section}</h2>
          <p className="project-panel-sub">{detail?.description}</p>
          <div className="project-preview-rows">
            {detail?.rows.map((row) => (
              <article key={row}>{row}</article>
            ))}
          </div>
          <button onClick={onConnect}>Manage live {section.toLowerCase()}</button>
        </section>
      )}
    </ManagerFrame>
  );
}
