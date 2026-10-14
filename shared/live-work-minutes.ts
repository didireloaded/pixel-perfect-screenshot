import type { AttendanceEvent, AttendanceState, Shift } from "./attendance";
// Display-only estimate. Never used for payroll, exports, approvals or stored evidence.
export function liveWorkMinutes(
  shift: Shift | undefined,
  state: AttendanceState,
  events: AttendanceEvent[],
  now: number,
) {
  const recorded = shift?.totals.recordedMinutes ?? shift?.totals.workedMinutes ?? 0;
  if (!shift || !["working", "on_job"].includes(state))
    return { minutes: recorded, estimated: false };
  const last = events
    .filter((event) => event.shiftId === shift.id)
    .sort((a, b) => b.capturedAt - a.capturedAt)[0];
  if (
    !last ||
    !["clock_in", "end_lunch", "start_job", "end_job", "end_personal"].includes(last.type)
  )
    return { minutes: recorded, estimated: false };
  return {
    minutes:
      recorded +
      Math.floor(
        Math.max(
          0,
          Math.min(now, shift.finishesAt ? Date.parse(shift.finishesAt) : now) - last.capturedAt,
        ) / 60000,
      ),
    estimated: true,
  };
}
