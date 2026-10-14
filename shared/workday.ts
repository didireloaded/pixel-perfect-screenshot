import type { AttendanceSnapshot, Shift } from "./attendance";

// Attendance belongs to the start date, including an unresolved overnight day.
export function currentWorkday(data: AttendanceSnapshot, employeeId = data.me) {
  const shifts = data.shifts.filter((item) => item.employeeId === employeeId);
  return (
    shifts.find(
      (item) =>
        (item.date === data.today || (item.finishDate && item.finishDate > item.date)) &&
        data.states?.some(
          (entry) =>
            entry.shiftId === item.id && !["not_clocked_in", "clocked_out"].includes(entry.state),
        ),
    ) ?? shifts.find((item) => item.date === data.today)
  );
}

export function workPositionAllowed(
  shift: Pick<Shift, "date" | "start" | "trackingStop" | "startsAt" | "finishesAt">,
  timezone: string,
  now = Date.now(),
) {
  if (shift.startsAt || shift.finishesAt) {
    return now >= Date.parse(shift.startsAt ?? "") && now < Date.parse(shift.finishesAt ?? "");
  }
  // Compatibility for previously cached same-day snapshots.
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(now));
  const [date, time] = local.split(" ");
  return date === shift.date && Boolean(time && time >= shift.start && time < shift.trackingStop);
}
