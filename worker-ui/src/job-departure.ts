import type { AttendanceState, CalendarJob } from "../../shared/attendance";

// Keep the explanation and disabled state together. The server validates departure again.
export function jobDepartureBlock(
  plan: CalendarJob,
  context: {
    today: string;
    employeeId: string;
    state: AttendanceState;
    busy: boolean;
    online: boolean;
    pendingAttendance: boolean;
    reviewPending: boolean;
  },
): string | null {
  if (context.busy) return "Saving your changes…";
  if (!context.online) return "Connect to the internet to leave for this job.";
  if (context.pendingAttendance) return "Wait for your attendance to finish syncing.";
  if (context.reviewPending) return "Your attendance needs manager review before departure.";
  if (plan.date !== context.today) return `Departure is available on ${plan.date}.`;
  if (!plan.address || plan.latitude == null || plan.longitude == null)
    return "Your manager needs to confirm this job’s address and map pin before departure.";
  if (plan.employeeIds.length && !plan.employeeIds.includes(context.employeeId))
    return "This job is reserved for its assigned employees.";
  switch (context.state) {
    case "not_clocked_in":
      return "Check in from Today before leaving for a job.";
    case "clocked_out":
      return "Your workday has ended. You cannot leave for a job.";
    case "on_lunch":
      return "End your lunch break from Today before leaving.";
    case "on_personal":
      return "Record your return to work from Today before leaving.";
    case "on_job":
      return "Finish your current job before leaving for another.";
    case "working":
      return null;
  }
}
