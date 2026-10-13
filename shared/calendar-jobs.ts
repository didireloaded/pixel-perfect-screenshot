import type { AttendanceSnapshot, CalendarJob } from "./attendance";
// Preserve existing field jobs in the calendar without displaying attendance settings.
export function calendarJobs(
  data: Pick<AttendanceSnapshot, "calendarJobs" | "jobs" | "employees">,
): CalendarJob[] {
  return [
    ...(data.calendarJobs ?? []),
    ...data.jobs.map((job) => ({
      id: job.id,
      date: job.date,
      title: job.title,
      details: job.instructions || job.destination,
      employeeIds: [job.assignee],
      assignedNames: data.employees.filter((e) => e.id === job.assignee).map((e) => e.name),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
