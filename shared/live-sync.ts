import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Broadcasts only invalidate the snapshot. All data still passes through the scoped RPC.
export function startLiveSync(
  client: SupabaseClient<Database>,
  companyId: string,
  refresh: () => Promise<void>,
) {
  let stopped = false;
  let running = false;
  let pending = false;
  const update = async () => {
    if (stopped || !navigator.onLine || document.visibilityState === "hidden") return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await refresh();
    } catch {
      // The caller owns its error UI. A failed read must not break later recovery.
    } finally {
      running = false;
      if (pending && !stopped) {
        pending = false;
        void update();
      }
    }
  };
  const trigger = () => {
    void update();
  };
  const channel = client.channel(`shiftline:${companyId}`, { config: { private: true } });
  channel.on("broadcast", { event: "refresh" }, trigger);
  void client.realtime
    .setAuth()
    .then(() => {
      if (!stopped)
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") trigger();
        });
    })
    .catch(() => {
      /* Polling below recovers from unavailable Realtime. */
    });
  const timer = window.setInterval(trigger, 15000);
  window.addEventListener("online", trigger);
  window.addEventListener("focus", trigger);
  document.addEventListener("visibilitychange", trigger);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("online", trigger);
    window.removeEventListener("focus", trigger);
    document.removeEventListener("visibilitychange", trigger);
    void client.removeChannel(channel).catch(() => {
      /* Local listeners are already stopped, even if channel teardown is offline. */
    });
  };
}
