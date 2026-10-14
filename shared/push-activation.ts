// Service-worker installation can fail or finish before the listener is attached.
export function waitForPushActivation(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return Promise.reject(new Error("Notification setup did not start. Try again."));
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant")
        finish(new Error("Notification setup failed. Try again."));
    };
    const timer = setTimeout(
      () => finish(new Error("Notification setup timed out. Reconnect and try again.")),
      15000,
    );
    worker.addEventListener("statechange", changed);
    changed();
  });
}
