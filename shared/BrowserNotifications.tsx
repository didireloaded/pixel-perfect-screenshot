import { useEffect, useMemo, useState } from "react";
import { createBackend } from "./backend";
type Update = {
  id: string;
  title: string;
  destination: string;
  created_at: string;
  read_at: string | null;
};
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function BrowserNotifications({
  app,
  onOpen,
  feed = false,
}: {
  app: "worker" | "manager";
  onOpen?: (destination: string) => void;
  feed?: boolean;
}) {
  const api = useMemo(() => createBackend(app), [app]);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  useEffect(() => {
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    );
    const prompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setInstall(null);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("appinstalled", done);
    let live = true;
    const update = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const rows = await api.notifications<Update[]>("list");
        if (live) setUpdates(rows);
      } catch {
        if (live)
          setMessage("Could not refresh notifications. Check your connection and try again.");
      }
    };
    if (feed) void update();
    const timer = feed ? setInterval(update, 15000) : undefined;
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register(`/push-${app}-sw.js`, { scope: app === "manager" ? "/manager" : "/" })
        .then((r) => r.pushManager.getSubscription())
        .then((s) => {
          if (live) setEnabled(Boolean(s));
        })
        .catch(() => {});
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("appinstalled", done);
    };
  }, [api, app, feed]);
  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      )
        throw new Error(
          "Push is unavailable here. On iPhone, add Shiftline to your Home Screen and open it there.",
        );
      // Permission is requested only from this user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notifications are not allowed. You can change this in browser or phone settings.",
        );
      const { key } = await api.notifications<{ key: string | null }>("public_key");
      if (!key) throw new Error("Push delivery is not configured yet.");
      const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      );
      const registration = await navigator.serviceWorker.register(`/push-${app}-sw.js`, {
        scope: app === "manager" ? "/manager" : "/",
      });
      if (!registration.active)
        await new Promise<void>((resolve) => {
          const worker = registration.installing ?? registration.waiting;
          if (!worker) {
            resolve();
            return;
          }
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") resolve();
          });
        });
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      const json = subscription.toJSON();
      await api.notifications("subscribe", {
        endpoint: json.endpoint,
        p256dh: json.keys?.["p256dh"],
        auth: json.keys?.["auth"],
        app,
      });
      setEnabled(true);
      setMessage("Notifications enabled on this device.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const r = await navigator.serviceWorker.getRegistration(app === "manager" ? "/manager" : "/");
      const s = await r?.pushManager.getSubscription();
      if (s) {
        await api.notifications("unsubscribe", { endpoint: s.endpoint });
        await s.unsubscribe();
      }
      setEnabled(false);
      setMessage("Notifications disabled on this device.");
    } catch {
      setMessage("Could not disable notifications. Try again when connected.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border p-4 my-4" aria-label="App notifications">
      <h2 className="font-semibold">Stay up to date</h2>
      <p className="text-sm my-2">
        Messages, jobs, company updates and request decisions. Phone alerts show no private work
        details.
      </p>
      <div className="flex flex-wrap gap-3">
        {!installed && (
          <button
            className="rounded-xl border px-4 py-3"
            onClick={async () => {
              if (install) {
                await install.prompt();
                const choice = await install.userChoice;
                if (choice.outcome === "accepted") setInstalled(true);
                setInstall(null);
              } else setHelp((v) => !v);
            }}
          >
            Add to Home Screen
          </button>
        )}
        <button
          className="rounded-xl border px-4 py-3"
          disabled={busy}
          onClick={() => void (enabled ? disable() : enable())}
        >
          {busy
            ? "Saving…"
            : enabled
              ? "Disable phone notifications"
              : "Enable phone notifications"}
        </button>
      </div>
      {help && (
        <p className="text-sm mt-3">
          iPhone: open in Safari, tap Share, then Add to Home Screen. Android: open the browser menu
          and choose Install app or Add to Home Screen. Open the saved app, then enable
          notifications.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm mt-3">
          {message}
        </p>
      )}
      {feed && (
        <div className="mt-4">
          {updates.length === 0 ? (
            <p className="text-sm">New updates will appear here.</p>
          ) : (
            updates.map((item) => (
              <article key={item.id} className="border-t py-3">
                <button
                  className="text-left w-full py-2"
                  onClick={() => onOpen?.(item.destination)}
                >
                  <b>{item.title}</b>
                  <p className="text-sm">
                    {new Date(item.created_at).toLocaleString()} ·{" "}
                    {item.read_at ? "Read" : "Unread"}
                  </p>
                </button>
                {!item.read_at && (
                  <button
                    className="text-sm py-2"
                    onClick={async () => {
                      try {
                        await api.notifications("read", { id: item.id });
                        setUpdates((items) =>
                          items.map((v) =>
                            v.id === item.id ? { ...v, read_at: new Date().toISOString() } : v,
                          ),
                        );
                      } catch {
                        setMessage("Could not save read status.");
                      }
                    }}
                  >
                    Mark read
                  </button>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
