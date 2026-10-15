import type { AttendanceSnapshot, CalendarJob } from "./attendance";
export function jobRunsOn(job: CalendarJob, date: string) {
  return job.date <= date && (job.endDate ?? job.date) >= date;
}
export function jobPhase(job: CalendarJob, today: string) {
  return job.completedAt ? "completed" : job.date > today ? "assigned" : "in_progress";
}
// Preserve existing field jobs in the calendar without displaying attendance settings.
export function calendarJobs(
  data: Pick<AttendanceSnapshot, "calendarJobs" | "jobs" | "employees">,
): CalendarJob[] {
  return [
    ...(data.calendarJobs ?? []),
    ...data.jobs
      .filter((job) => !job.calendarJobId)
      .map((job) => ({
        id: job.id,
        date: job.date,
        title: job.title,
        details: job.instructions || job.destination,
        address: job.destination,
        latitude: job.latitude ?? null,
        longitude: job.longitude ?? null,
        employeeIds: [job.assignee],
        assignedNames: data.employees.filter((e) => e.id === job.assignee).map((e) => e.name),
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
