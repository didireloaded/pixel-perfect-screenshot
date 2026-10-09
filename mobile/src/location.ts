import * as Location from "expo-location";
import type { AttendanceSnapshot, Shift, LocationEvidence } from "../../shared/attendance";
export function zonedDateTime(date: string, hhmm: string, timezone: string): Date {
  const intended = Date.parse(`${date}T${hhmm}:00Z`);
  let candidate = intended;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: string) => parts.find((part) => part.type === type)!.value;
    const represented = Date.parse(
      `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`,
    );
    candidate += intended - represented;
  }
  return new Date(candidate);
}
// Foreground checks only. No background region registrations or off-duty location collection.
export async function clockInLocation(
  data: AttendanceSnapshot,
  shift: Shift,
): Promise<LocationEvidence | null> {
  if (!data.policyHistory.find((p) => p.version === shift.totals.policyVersion)?.require_gps_stamp)
    return null;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: data.company.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: data.company.timezone }).format(
    new Date(),
  );
  const minutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return h! * 60 + m!;
  };
  if (day !== shift.date || minutes(clock) < minutes(shift.start) - 30 || clock >= shift.end)
    throw new Error(
      "The authorised location window has ended. Record a correction request instead.",
    );
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  try {
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const nowClock = new Intl.DateTimeFormat("en-GB", {
      timeZone: data.company.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    if (nowClock >= shift.end) return null;
    return {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracyM: fix.coords.accuracy ?? 10000,
    };
  } catch {
    return null;
  }
}
