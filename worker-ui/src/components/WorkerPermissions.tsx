import { useEffect, useRef, useState } from "react";
import { WorkerCard } from "./WorkerUI";

export function WorkerPermissions({
  employeeId,
  companyId,
  required,
  onEnabled,
  onNotifications,
}: {
  employeeId: string;
  companyId: string;
  required: boolean;
  onEnabled: () => void;
  onNotifications: () => void;
}) {
  const key = `shiftline-permissions-v1:${companyId}:${employeeId}`;
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [granted, setGranted] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    ++generation.current;
    setGranted(false);
    setMessage("");
    try {
      setDismissed(localStorage.getItem(key) === "done");
    } catch {
      // Setup remains available when browser storage is disabled.
    }
    return () => {
      ++generation.current;
    };
  }, [key]);
  if (dismissed) return null;
  return (
    <WorkerCard className="p-5 space-y-3">
      <h2 className="font-semibold">Set up your work phone</h2>
      <p className="text-sm">
        Allow precise location so your manager can see your work location. Sharing stops for lunch,
        personal time and clock-out. Keep Shiftline open while working.
      </p>
      <button
        className="worker-action"
        disabled={busy || granted}
        onClick={() => {
          if (!navigator.geolocation) {
            setMessage(
              "Location is unavailable in this browser. Open Shiftline in Safari or Chrome over HTTPS.",
            );
            return;
          }
          setBusy(true);
          setMessage("");
          const current = generation.current;
          navigator.geolocation.getCurrentPosition(
            () => {
              if (current !== generation.current) return;
              setBusy(false);
              setGranted(true);
              onEnabled();
              setMessage("Location is allowed. Sharing starts only during an active workday.");
            },
            (error) => {
              if (current !== generation.current) return;
              setBusy(false);
              setMessage(
                error.code === 1
                  ? "Location is blocked. Open your browser's site settings and allow precise location, then try again."
                  : "No GPS fix yet. Turn on location services, move near a window and try again.",
              );
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          );
        }}
      >
        {busy ? "Checking location…" : granted ? "Location allowed" : "Allow work location"}
      </button>
      <button className="worker-action secondary" onClick={onNotifications}>
        Set up notifications
      </button>
      <p className="text-xs">
        Notifications are optional. On iPhone, add Shiftline to your home screen first. Installing
        the app does not enable background GPS.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <button
        className="worker-action secondary"
        disabled={required && !granted}
        onClick={() => {
          try {
            localStorage.setItem(key, "done");
          } catch {
            // Permission still works without saving this presentation preference.
          }
          setDismissed(true);
        }}
      >
        {required && !granted ? "Your company requires location" : "Continue"}
      </button>
    </WorkerCard>
  );
}
