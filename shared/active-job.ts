import type { AttendanceEvent, Job } from "./attendance";
// Task-board status is planning; attendance determines the worker's current job.
export function activeJobForShift(
  events: AttendanceEvent[],
  jobs: Job[],
  shiftId: string | undefined,
) {
  if (!shiftId) return undefined;
  const boundary = events
    .filter((e) => e.shiftId === shiftId && ["start_job", "end_job", "clock_out"].includes(e.type))
    .sort((a, b) => a.capturedAt - b.capturedAt)
    .at(-1);
  return boundary?.type === "start_job" ? jobs.find((j) => j.id === boundary.jobId) : undefined;
}
