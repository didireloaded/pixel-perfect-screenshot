import type { Shift } from "./attendance";
import { workPositionAllowed } from "./workday";

// Both web entry points share this privacy lifecycle. No background location.
export function watchWorkPosition(
  shift: Pick<Shift, "id" | "date" | "start" | "trackingStop" | "startsAt" | "finishesAt">,
  timezone: string,
  send: (action: string, data: Record<string, unknown>) => Promise<unknown>,
  onError: (message: string) => void,
) {
  let disposed = false;
  let leavingPage = false;
  let watch: number | null = null;
  let generation = 0;
  let lastSent = 0;
  let lastRequested = 0;
  let pending: Promise<unknown> = Promise.resolve();
  const allowed = () => {
    return (
      workPositionAllowed(shift, timezone) &&
      !leavingPage &&
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
  const fresh = (position: GeolocationPosition) =>
    Number.isFinite(position.timestamp) &&
    position.timestamp <= Date.now() + 1000 &&
    Date.now() - position.timestamp <= 30000;
  const report = (position: GeolocationPosition, observedGeneration: number) => {
    if (
      disposed ||
      observedGeneration !== generation ||
      !allowed() ||
      !fresh(position) ||
      Date.now() - lastSent < 10000
    )
      return;
    lastSent = Date.now();
    pending = pending
      .catch(() => {})
      .then(() => {
        // Never relabel queued or pre-pause evidence as a current position.
        if (disposed || observedGeneration !== generation || !allowed() || !fresh(position)) return;
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
  const unavailable = (observedGeneration: number, error: GeolocationPositionError) => {
    if (!disposed && observedGeneration === generation && allowed()) {
      clear();
      onError(
        error.code === 1
          ? "Location permission is blocked. Allow location for this app in your browser or phone settings, then turn work location sharing off and on."
          : error.code === 3
            ? "GPS timed out. Move near a window or outdoors and keep the app open; location sharing will retry."
            : "Your device cannot get a GPS position. Turn on phone location services and keep the app open; location sharing will retry.",
      );
    }
  };
  const update = () => {
    if (disposed) return;
    if (!allowed()) {
      if (watch !== null) {
        navigator.geolocation.clearWatch(watch);
        watch = null;
        ++generation;
        lastSent = 0;
        clear();
      }
      return;
    }
    if (watch !== null) {
      // Stationary devices may not emit watch updates. Request fresh evidence each minute.
      if (Date.now() - Math.max(lastSent, lastRequested) >= 60000) {
        lastRequested = Date.now();
        const currentGeneration = generation;
        navigator.geolocation.getCurrentPosition(
          (position) => report(position, currentGeneration),
          (error) => unavailable(currentGeneration, error),
          options,
        );
      }
      return;
    }
    lastRequested = Date.now();
    const currentGeneration = generation;
    watch = navigator.geolocation.watchPosition(
      (position) => report(position, currentGeneration),
      (error) => unavailable(currentGeneration, error),
      options,
    );
  };
  const hidePage = () => {
    leavingPage = true;
    update();
  };
  const showPage = () => {
    leavingPage = false;
    update();
  };
  // Background timers are throttled. Privacy changes must stop GPS synchronously.
  document.addEventListener("visibilitychange", update);
  window.addEventListener("offline", update);
  window.addEventListener("online", update);
  window.addEventListener("pagehide", hidePage);
  window.addEventListener("pageshow", showPage);
  update();
  const timer = setInterval(update, 1000);
  return () => {
    disposed = true;
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    clearInterval(timer);
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("offline", update);
    window.removeEventListener("online", update);
    window.removeEventListener("pagehide", hidePage);
    window.removeEventListener("pageshow", showPage);
    clear();
  };
}
