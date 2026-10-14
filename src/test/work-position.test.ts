import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { watchWorkPosition } from "../../shared/watch-work-position";
const shift = { id: "shift", date: "2026-10-13", start: "08:00", trackingStop: "17:00" };
let callback: PositionCallback;
const watch = vi.fn((success: PositionCallback) => {
  callback = success;
  return 1;
});
const clear = vi.fn();
const poll = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  watch.mockClear();
  clear.mockClear();
  poll.mockClear();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: watch, clearWatch: clear, getCurrentPosition: poll },
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => {
  vi.useRealTimers();
});
it("does not request location before the shift and stops at the exact deadline", async () => {
  vi.setSystemTime(new Date("2026-10-13T07:59:59Z"));
  const send = vi.fn().mockResolvedValue({});
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  expect(watch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(watch).toHaveBeenCalledOnce();
  vi.setSystemTime(new Date("2026-10-13T16:59:59Z"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(clear).toHaveBeenCalledWith(1);
  expect(send).toHaveBeenCalledWith("clear_position", {});
  stop();
});
it("removes the marker after an in-flight report finishes and ignores late GPS callbacks", async () => {
  let finish: () => void = () => {};
  const send = vi.fn((action: string) =>
    action === "report_position"
      ? new Promise<void>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(),
  );
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  callback({
    timestamp: Date.now(),
    coords: { latitude: -22.6, longitude: 17.08, accuracy: 10 },
  } as GeolocationPosition);
  await Promise.resolve();
  await Promise.resolve();
  expect(send).toHaveBeenCalledWith("report_position", expect.any(Object));
  stop();
  callback({
    timestamp: Date.now(),
    coords: { latitude: 99, longitude: 99, accuracy: 10 },
  } as GeolocationPosition);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(send.mock.calls.map(([action]) => action)).toEqual(["report_position", "clear_position"]);
});
it("pauses for a hidden tab without forwarding its position", async () => {
  const send = vi.fn().mockResolvedValue({});
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  callback({
    timestamp: Date.now(),
    coords: { latitude: 99, longitude: 99, accuracy: 10 },
  } as GeolocationPosition);
  await vi.advanceTimersByTimeAsync(1000);
  expect(send).not.toHaveBeenCalledWith("report_position", expect.anything());
  expect(clear).toHaveBeenCalledWith(1);
  stop();
});

it("requests fresh evidence for a stationary worker without sending an old point", async () => {
  const send = vi.fn().mockResolvedValue({});
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  await vi.advanceTimersByTimeAsync(60000);
  expect(poll).toHaveBeenCalledOnce();
  expect(send).not.toHaveBeenCalled();
  stop();
});

it("sends fresh movement every ten seconds without flooding the server", async () => {
  const send = vi.fn().mockResolvedValue({});
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  const point = {
    timestamp: Date.now(),
    coords: { latitude: -22.6, longitude: 17.08, accuracy: 10 },
  } as GeolocationPosition;
  callback(point);
  await vi.advanceTimersByTimeAsync(9999);
  callback(point);
  expect(send.mock.calls.filter(([action]) => action === "report_position")).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  callback(point);
  await vi.advanceTimersByTimeAsync(1);
  expect(send.mock.calls.filter(([action]) => action === "report_position")).toHaveLength(2);
  stop();
});

it("stops immediately on visibility and page lifecycle changes without waiting for a timer", async () => {
  const send = vi.fn().mockResolvedValue({});
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  const beforePause = callback;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(clear).toHaveBeenCalledWith(1);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(watch).toHaveBeenCalledTimes(2);
  beforePause({
    timestamp: Date.now(),
    coords: { latitude: 1, longitude: 1, accuracy: 10 },
  } as GeolocationPosition);
  await vi.advanceTimersByTimeAsync(1);
  expect(send).not.toHaveBeenCalledWith("report_position", expect.anything());
  window.dispatchEvent(new Event("pagehide"));
  expect(clear).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(watch).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("pageshow"));
  expect(watch).toHaveBeenCalledTimes(3);
  stop();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(watch).toHaveBeenCalledTimes(3);
});

it("discards queued evidence that became stale during a slow network request", async () => {
  let finish: () => void = () => {};
  const send = vi.fn((action: string) =>
    action === "report_position"
      ? new Promise<void>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(),
  );
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  const point = () =>
    ({
      timestamp: Date.now(),
      coords: { latitude: 1, longitude: 1, accuracy: 10 },
    }) as GeolocationPosition;
  callback(point());
  await vi.advanceTimersByTimeAsync(10000);
  callback(point());
  await vi.advanceTimersByTimeAsync(30001);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(send.mock.calls.filter(([action]) => action === "report_position")).toHaveLength(1);
  stop();
});

it("rejects stale and future-dated browser samples", async () => {
  const send = vi.fn().mockResolvedValue({});
  const stop = watchWorkPosition(shift, "UTC", send, vi.fn());
  for (const timestamp of [Date.now() - 30001, Date.now() + 1001, Number.NaN]) {
    callback({
      timestamp,
      coords: { latitude: 1, longitude: 1, accuracy: 10 },
    } as GeolocationPosition);
  }
  await vi.advanceTimersByTimeAsync(1);
  expect(send).not.toHaveBeenCalled();
  stop();
});
