import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../shared/database.types";
import { startLiveSync } from "../../shared/live-sync";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function transport() {
  let broadcast: () => void = () => {};
  let subscribed: (status: string) => void = () => {};
  const channel = {
    on: vi.fn((_type, _filter, callback) => {
      broadcast = callback;
      return channel;
    }),
    subscribe: vi.fn((callback) => {
      subscribed = callback;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    realtime: { setAuth: vi.fn(async () => {}) },
    removeChannel: vi.fn(async () => {}),
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    mocks: client,
    broadcast: () => broadcast(),
    subscribe: () => subscribed("SUBSCRIBED"),
  };
}
describe("company snapshot synchronization", () => {
  it("uses a private company channel, recovers on focus and stops after cleanup", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const api = transport(),
      refresh = vi.fn(async () => {});
    const stop = startLiveSync(api.client, "company-1", refresh);
    await Promise.resolve();
    expect(api.mocks.channel).toHaveBeenCalledWith("shiftline:company-1", {
      config: { private: true },
    });
    api.subscribe();
    await Promise.resolve();
    api.broadcast();
    await Promise.resolve();
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15000);
    expect(refresh).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(30000);
    api.broadcast();
    window.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(4);
    expect(api.mocks.removeChannel).toHaveBeenCalledOnce();
  });
  it("coalesces updates during a pending read and pauses while hidden or offline", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const api = transport();
    let resolve: () => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const stop = startLiveSync(api.client, "company-1", refresh);
    await Promise.resolve();
    api.broadcast();
    api.broadcast();
    api.broadcast();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    visibility.mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(15000);
    expect(refresh).toHaveBeenCalledTimes(2);
    visibility.mockReturnValue("visible");
    online.mockReturnValue(false);
    api.broadcast();
    expect(refresh).toHaveBeenCalledTimes(2);
    online.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    expect(refresh).toHaveBeenCalledTimes(3);
    resolve();
    stop();
  });
});
