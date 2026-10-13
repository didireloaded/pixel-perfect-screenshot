import type { Shift } from "./attendance";

// Both web entry points share this privacy lifecycle. No background location.
export function watchWorkPosition(
  shift: Pick<Shift, "id" | "date" | "start" | "trackingStop">,
  timezone: string,
  send: (action: string, data: Record<string, unknown>) => Promise<unknown>,
  onError: (message: string) => void,
) {
  let disposed = false;
  let watch: number | null = null;
  let lastSent = 0;
  let lastRequested = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const allowed = () => {
    const local = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    const [date, time] = local.split(" ");
    return (
      date === shift.date &&
      !!time &&
      time >= shift.start &&
      time < shift.trackingStop &&
      document.visibilityState === "visible" &&
      navigator.onLine
    );
  };
  // A clear follows any outstanding write so late HTTP responses cannot restore a paused marker.
  const clear = () => {
    pending = pending
      .catch(() => {})
      .then(() => send("clear_position", {}))
      .catch(() => {});
  };
  const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
  const report: PositionCallback = (position) => {
    if (disposed || !allowed() || Date.now() - lastSent < 10000) return;
    lastSent = Date.now();
    pending = pending
      .catch(() => {})
      .then(() => {
        if (disposed || !allowed()) return;
        return send("report_position", {
          shiftId: shift.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
          source: "web",
        });
      })
      .catch((cause) => {
        if (!disposed) {
          clear();
          onError(cause instanceof Error ? cause.message : "Location sharing is unavailable");
        }
      });
  };
  const unavailable = () => {
    if (!disposed) {
      clear();
      onError("Location sharing is paused because location is unavailable.");
    }
  };
  const update = () => {
    if (disposed) return;
    if (!allowed()) {
      if (watch !== null) {
        navigator.geolocation.clearWatch(watch);
        watch = null;
        clear();
      }
      return;
    }
    if (watch !== null) {
      // Stationary devices may not emit watch updates. Request fresh evidence each minute.
      if (Date.now() - Math.max(lastSent, lastRequested) >= 60000) {
        lastRequested = Date.now();
        navigator.geolocation.getCurrentPosition(report, unavailable, options);
      }
      return;
    }
    lastRequested = Date.now();
    watch = navigator.geolocation.watchPosition(report, unavailable, options);
  };
  update();
  const timer = setInterval(update, 1000);
  return () => {
    disposed = true;
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    clearInterval(timer);
    clear();
  };
}
