import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createBackend } from "./backend";
import { waitForPushActivation } from "./push-activation";
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
  prompt = false,
}: {
  app: "worker" | "manager";
  onOpen?: (destination: string) => void;
  feed?: boolean;
  prompt?: boolean;
}) {
  const api = useMemo(() => createBackend(app), [app]);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const feedRevision = useRef(0);
  const pushRevision = useRef(0);
  const accountLifecycle = useRef({ active: true });
  const heading = useId();
  const promptKey = `shiftline-notification-setup-seen:${app}`;
  useEffect(() => {
    const lifecycle = { active: true };
    accountLifecycle.current = lifecycle;
    return () => {
      lifecycle.active = false;
    };
  }, [app]);
  useEffect(() => {
    const element = dialog.current;
    if (prompt && promptOpen) element?.showModal();
    return () => element?.close();
  }, [prompt, promptOpen]);
  useEffect(() => {
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
    );
    const installPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setInstall(null);
    };
    window.addEventListener("beforeinstallprompt", installPrompt);
    window.addEventListener("appinstalled", done);
    let live = true;
    const considerPrompt = (subscription: PushSubscription | null) => {
      if (!live || !prompt) return;
      if (subscription || ("Notification" in window && Notification.permission === "denied")) {
        try {
          localStorage.setItem(promptKey, "complete");
        } catch {
          /* Settings remain available. */
        }
        return;
      }
      try {
        if (localStorage.getItem(promptKey)) return;
        // Remember presentation, not permission: installation and push remain opt-in.
        localStorage.setItem(promptKey, "shown");
        setPromptOpen(true);
      } catch {
        // Without persistent storage, keep setup in Notifications instead of nagging.
      }
    };
    const update = async () => {
      if (document.visibilityState !== "visible") return;
      const token = ++feedRevision.current;
      try {
        const rows = await api.notifications<Update[]>("list");
        if (live && token === feedRevision.current) setUpdates(rows);
      } catch {
        if (live && token === feedRevision.current)
          setMessage("Could not refresh notifications. Check your connection and try again.");
      }
    };
    if (feed) void update();
    const timer = feed ? setInterval(update, 15000) : undefined;
    const verifyPhone = () => {
      if (navigator.onLine === false || document.visibilityState === "hidden") return;
      const revision = ++pushRevision.current;
      const current = () => live && revision === pushRevision.current;
      if ("serviceWorker" in navigator)
        void navigator.serviceWorker
          .register(`/push-${app}-sw.js`, { scope: app === "manager" ? "/manager" : "/" })
          .then((r) => r.pushManager.getSubscription())
          .then(async (s) => {
            if (!current()) return;
            if (s) {
              try {
                // A browser subscription outlives an app login. Verify that this
                // account owns it before presenting phone delivery as enabled.
                const json = s.toJSON();
                await api.notifications("subscribe", {
                  endpoint: json.endpoint,
                  p256dh: json.keys?.["p256dh"],
                  auth: json.keys?.["auth"],
                  app,
                });
              } catch (cause) {
                if (!current()) return;
                setEnabled(false);
                if (
                  cause instanceof Error &&
                  cause.message.includes("Subscription belongs to another account")
                ) {
                  // Revoke delivery to the previous account on a shared device.
                  // The next enable gesture creates a fresh endpoint.
                  await s.unsubscribe();
                  if (!current()) return;
                  setMessage("Enable phone notifications for your current account.");
                  considerPrompt(null);
                } else {
                  setMessage(
                    "Could not verify phone notifications. Reconnect and enable them again.",
                  );
                }
                return;
              }
            }
            if (!current()) return;
            setEnabled(Boolean(s));
            setMessage((value) =>
              value.startsWith("Could not verify phone notifications") ||
              value.startsWith("Could not check phone notifications")
                ? ""
                : value,
            );
            considerPrompt(s);
          })
          .catch(() => {
            if (current()) {
              setEnabled(false);
              setMessage("Could not check phone notifications. Try again when connected.");
            }
          });
      else void Promise.resolve().then(() => considerPrompt(null));
    };
    verifyPhone();
    window.addEventListener("online", verifyPhone);
    document.addEventListener("visibilitychange", verifyPhone);
    return () => {
      live = false;
      clearInterval(timer);
      ++pushRevision.current;
      window.removeEventListener("online", verifyPhone);
      document.removeEventListener("visibilitychange", verifyPhone);
      window.removeEventListener("beforeinstallprompt", installPrompt);
      window.removeEventListener("appinstalled", done);
    };
  }, [api, app, feed, prompt, promptKey]);
  const enable = async () => {
    ++pushRevision.current;
    const lifecycle = accountLifecycle.current;
    const current = () => lifecycle.active;
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
      if (!current()) return;
      if (permission !== "granted")
        throw new Error(
          "Notifications are not allowed. You can change this in browser or phone settings.",
        );
      const { key } = await api.notifications<{ key: string | null }>("public_key");
      if (!current()) return;
      if (!key) throw new Error("Push delivery is not configured yet.");
      const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
        c.charCodeAt(0),
      );
      const registration = await navigator.serviceWorker.register(`/push-${app}-sw.js`, {
        scope: app === "manager" ? "/manager" : "/",
      });
      if (!current()) return;
      await waitForPushActivation(registration);
      if (!current()) return;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        }));
      if (!current()) return;
      const json = subscription.toJSON();
      await api.notifications("subscribe", {
        endpoint: json.endpoint,
        p256dh: json.keys?.["p256dh"],
        auth: json.keys?.["auth"],
        app,
      });
      if (!current()) return;
      setEnabled(true);
      try {
        localStorage.setItem(promptKey, "complete");
      } catch {
        /* Permission is already saved by the browser. */
      }
      setPromptOpen(false);
      setMessage("Notifications enabled on this device.");
    } catch (cause) {
      if (current())
        setMessage(cause instanceof Error ? cause.message : "Could not enable notifications.");
    } finally {
      if (current()) setBusy(false);
    }
  };
  const disable = async () => {
    ++pushRevision.current;
    const lifecycle = accountLifecycle.current;
    const current = () => lifecycle.active;
    setBusy(true);
    try {
      const r = await navigator.serviceWorker.getRegistration(app === "manager" ? "/manager" : "/");
      const s = await r?.pushManager.getSubscription();
      if (!current()) return;
      if (s) {
        try {
          await api.notifications("unsubscribe", { endpoint: s.endpoint });
        } finally {
          // Browser revocation must still happen when server cleanup is offline.
          await s.unsubscribe();
          if (current()) setEnabled(false);
        }
      }
      if (current()) {
        setEnabled(false);
        setMessage("Notifications disabled on this device.");
      }
    } catch {
      if (current())
        setMessage("Could not complete notification cleanup. Try again when connected.");
    } finally {
      if (current()) setBusy(false);
    }
  };
  const content = (
    <section className="rounded-2xl border p-4 my-4" aria-label="App notifications">
      <h2 id={heading} className="font-semibold">
        {prompt ? "Work updates on your phone" : "Notification settings"}
      </h2>
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
                      const lifecycle = accountLifecycle.current;
                      try {
                        await api.notifications("read", { id: item.id });
                        if (!lifecycle.active) return;
                        // Discard any list captured before this successful receipt.
                        ++feedRevision.current;
                        setUpdates((items) =>
                          items.map((v) =>
                            v.id === item.id ? { ...v, read_at: new Date().toISOString() } : v,
                          ),
                        );
                      } catch {
                        if (lifecycle.active) setMessage("Could not save read status.");
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
  if (!prompt) return content;
  if (!promptOpen) return null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      className="fixed inset-0 m-auto w-[calc(100%_-_32px)] max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border-0 bg-white p-4 shadow-xl backdrop:bg-black/50 dark:bg-[#211c2c] dark:text-white"
      onCancel={(event) => {
        event.preventDefault();
        setPromptOpen(false);
      }}
    >
      {content}
      <p className="text-sm px-4">You can change these options later in Notifications.</p>
      <button className="mt-3 rounded-xl border px-4 py-3" onClick={() => setPromptOpen(false)}>
        Not now
      </button>
    </dialog>
  );
}
