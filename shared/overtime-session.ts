import type { AttendanceEvent, OvertimeSession } from "./attendance";
export function overtimeSessionSeconds(
  session: OvertimeSession,
  events: AttendanceEvent[],
  now: number,
) {
  const start = Date.parse(
    session.reviewStatus === "approved" && session.requestedStartAt
      ? session.requestedStartAt
      : session.startedAt,
  );
  const finish = Math.min(
    now,
    Date.parse(session.plannedFinishAt),
    session.endedAt ? Date.parse(session.endedAt) : Infinity,
  );
  const sorted = events
    .filter((event) => event.shiftId === session.shiftId)
    .sort((a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id));
  let seconds = 0;
  sorted.forEach((event, index) => {
    if (["clock_in", "end_lunch", "start_job", "end_job", "end_personal"].includes(event.type))
      seconds +=
        Math.max(
          0,
          Math.min(finish, sorted[index + 1]?.capturedAt ?? now) -
            Math.max(start, event.capturedAt),
        ) / 1000;
  });
  return Math.floor(seconds);
}
