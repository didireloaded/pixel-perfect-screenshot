import { activeJobForShift } from "../../shared/active-job";
import { watchWorkPosition } from "../../shared/watch-work-position";
import { attendanceOutbox, type QueuedAttendance } from "../../shared/web-attendance-outbox";
import { deriveState } from "../../src/lib/attendance";
import { NoticeCard } from "./components/NoticeDetails";
import { ThemedSelect } from "../../shared/ThemedSelect";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Menu,
  WifiOff,
  Briefcase,
  CalendarDays,
  Check,
  Clock3,
  House,
  Mail,
  MapPin,
} from "lucide-react";
import type { AttendanceSnapshot, EventType, Job, Shift } from "../../shared/attendance";
import * as backend from "./backend";
import { WorkerHome } from "./components/WorkerHome";
import { WorkerActivities } from "./components/WorkerActivities";
import { WorkerJobCalendar } from "./components/WorkerJobCalendar";
import {
  WorkerCard as Card,
  WorkerAction as Action,
  WorkerSheet,
  EmptyState,
} from "./components/WorkerUI";
import { WorkerProfile, WorkerRequests, WorkerNotifications } from "./components/WorkerAccount";

type Result = { snapshot: AttendanceSnapshot; status?: string; reason?: string };
type Tab = "today" | "calendar" | "jobs" | "inbox" | "hours";
const tabs: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: "today", label: "Today", Icon: House },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "jobs", label: "Jobs", Icon: Briefcase },
  { id: "inbox", label: "Inbox", Icon: Mail },
  { id: "hours", label: "Hours", Icon: Clock3 },
];
const eventLabels: Record<EventType, string> = {
  clock_in: "Clocked in",
  start_lunch: "Started lunch",
  end_lunch: "Returned from lunch",
  start_job: "Left for job",
  end_job: "Returned from job",
  start_personal: "Left temporarily",
  end_personal: "Returned to work",
  clock_out: "Clocked out",
};
const minutes = (n: number) => `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m`;
const displayDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
export default function LiveWorkerApp({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<AttendanceSnapshot | null>(null);
  const [secondary, setSecondary] = useState<"profile" | "requests" | "notifications" | null>(null);
  const [correction, setCorrection] = useState<Shift | null>(null);
  const [jobFilter, setJobFilter] = useState<"all" | "assigned" | "in_progress" | "completed">(
    "all",
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [confirmOut, setConfirmOut] = useState(false);
  const switchTab = (next: Tab) => {
    setTab(next);
    setSecondary(null);
  };
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [clockInOpen, setClockInOpen] = useState(false);
  const [expectedEnd, setExpectedEnd] = useState("17:00");
  const [shareDuringWork, setShareDuringWork] = useState(true);
  const [locating, setLocating] = useState(false);
  const clockInLock = useRef(false);
  const [departureOpen, setDepartureOpen] = useState(false);
  const [departureKind, setDepartureKind] = useState<"personal" | "emergency">("personal");
  const [departureNote, setDepartureNote] = useState("");
  const writeLock = useRef(false);
  const revision = useRef(0);
  const planStartIds = useRef(new Map<string, string>());
  const [pendingAttendance, setPendingAttendance] = useState<QueuedAttendance[]>([]);
  const outbox = useMemo(
    () => (data?.me ? attendanceOutbox(localStorage, data.company.id, data.me) : null),
    [data?.company.id, data?.me],
  );
  const reviewPending =
    data?.submissions?.some(
      (item) =>
        item.status === "needs_review" &&
        (pendingAttendance.some((event) => event.shiftId === item.shift_id) ||
          data.shifts.some((shift) => shift.id === item.shift_id && shift.date === data.today)),
    ) ?? false;
  const syncAttendance = useCallback(async () => {
    if (!outbox || !navigator.onLine || writeLock.current || reviewPending) return;
    try {
      if (outbox.list().length === 0) return;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read saved attendance");
      return;
    }
    writeLock.current = true;
    ++revision.current;
    setBusy(true);
    try {
      const synchronize = () =>
        outbox.flush(async (event) => {
          const result = await backend.command<Result>("submit_attendance", { ...event });
          if (result.status === "synced" || result.status === "needs_review")
            setData(result.snapshot);
          return result;
        });
      const results = navigator.locks
        ? await navigator.locks.request("shiftline-attendance-sync", synchronize)
        : await synchronize();
      const latest = results.at(-1);
      if (latest) {
        setData(latest.snapshot);
        setError("");
        setNotice(
          latest.status === "needs_review"
            ? `Attendance needs manager review: ${latest.reason ?? "conflict"}`
            : "Saved attendance synchronized",
        );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Attendance is saved on this device. Retry synchronization.",
      );
    } finally {
      try {
        setPendingAttendance(outbox.list());
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not read saved attendance");
      }
      writeLock.current = false;
      setBusy(false);
    }
  }, [outbox, reviewPending]);
  useEffect(() => {
    if (!outbox) return;
    try {
      setPendingAttendance(outbox.list());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read saved attendance");
    }
    const sync = () => {
      if (document.visibilityState === "visible") void syncAttendance();
    };
    const changed = () => {
      try {
        setPendingAttendance(outbox.list());
        sync();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not read saved attendance");
      }
    };
    sync();
    const timer = window.setInterval(sync, 15000);
    window.addEventListener("online", sync);
    window.addEventListener("storage", changed);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener("storage", changed);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [outbox, syncAttendance]);
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  const refresh = useCallback(async () => {
    if (writeLock.current) return;
    const token = ++revision.current;
    try {
      const next = await backend.snapshot<AttendanceSnapshot>();
      if (token === revision.current && !writeLock.current) {
        setData(next);
        setError("");
      }
    } catch (cause) {
      if (token === revision.current)
        setError(cause instanceof Error ? cause.message : "Could not load your records");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!data?.company.id) return;
    return backend.watch(data.company.id, refresh);
  }, [data?.company.id, refresh]);
  const run = useCallback(
    async (action: string, payload: Record<string, unknown>, success: string) => {
      if (writeLock.current || !navigator.onLine || pendingAttendance.length > 0) {
        setError(
          navigator.onLine
            ? "Synchronize saved attendance before continuing"
            : "Reconnect to save this action",
        );
        return false;
      }
      writeLock.current = true;
      ++revision.current;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const result = await backend.command<Result>(action, payload);
        setData(result.snapshot);
        setNotice(
          result.status === "needs_review"
            ? `Saved for manager review: ${result.reason ?? "attendance conflict"}`
            : success,
        );
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save this action");
        return false;
      } finally {
        writeLock.current = false;
        setBusy(false);
      }
    },
    [pendingAttendance.length],
  );

  const act = async (type: EventType, extra: Record<string, unknown> = {}) => {
    let location: Record<string, number> | undefined;
    const shift = data?.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
    if (type === "clock_in" && !extra["expectedEnd"]) {
      setClockInOpen(true);
      return false;
    }
    if (!shift && type !== "clock_in") {
      setError("Check in to start your workday first");
      return false;
    }
    if (type !== "clock_in" && shift && outbox) {
      if (writeLock.current || reviewPending) {
        setError(
          reviewPending
            ? "Ask your manager to review the attendance conflict before continuing"
            : "Wait for the current action to finish",
        );
        return false;
      }
      try {
        const saved: QueuedAttendance = {
          id: crypto.randomUUID(),
          shiftId: shift.id,
          type,
          capturedAt: new Date().toISOString(),
          offline: !navigator.onLine,
          ...(typeof extra["jobId"] === "string" ? { jobId: extra["jobId"] } : {}),
          ...(typeof extra["note"] === "string" ? { note: extra["note"] } : {}),
          ...(typeof extra["reason"] === "string" ? { reason: extra["reason"] } : {}),
          ...(typeof extra["expectedReturn"] === "string"
            ? { expectedReturn: extra["expectedReturn"] }
            : {}),
        };
        outbox.save(saved);
        setPendingAttendance(outbox.list());
        setNotice("Saved on this device · awaiting server confirmation");
        setError("");
        await syncAttendance();
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not save attendance on this device",
        );
        return false;
      }
    }
    if (clockInLock.current) return false;
    clockInLock.current = true;
    if (type === "clock_in" && data?.policy?.require_gps_stamp) {
      setLocating(true);
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0,
          }),
        );
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        };
      } catch {
        setError(
          "Location is required to clock in under your company policy. Enable location and try again.",
        );
        clockInLock.current = false;
        return false;
      } finally {
        setLocating(false);
      }
    }
    try {
      return await run(
        type === "clock_in" ? "start_workday" : "transition",
        {
          id: crypto.randomUUID(),
          ...(type === "clock_in" ? {} : { type }),
          ...(location ? { location } : {}),
          ...extra,
        },
        eventLabels[type],
      );
    } finally {
      clockInLock.current = false;
    }
  };
  const me = data?.employees.find((e) => e.id === data.me);
  const shift = data?.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
  const state =
    pendingAttendance.some((item) => item.shiftId === shift?.id) && data
      ? deriveState([
          ...data.events.filter((event) => event.shiftId === shift?.id),
          ...pendingAttendance
            .filter((item) => item.shiftId === shift?.id)
            .map((item) => ({
              id: item.id,
              employeeId: data.me,
              shiftId: item.shiftId,
              type: item.type,
              capturedAt: Date.parse(item.capturedAt),
              sync: "waiting_to_sync" as const,
            })),
        ])
      : (data?.states.find((s) => s.shiftId === shift?.id)?.state ?? "not_clocked_in");
  const myJobs = data?.jobs.filter((j) => j.assignee === data.me) ?? [];
  const availablePlans = (data?.calendarJobs ?? []).filter(
    (plan) =>
      ["all", "assigned"].includes(jobFilter) &&
      !myJobs.some((job) => job.calendarJobId === plan.id) &&
      (jobFilter !== "assigned" || plan.date >= (data?.today ?? "")),
  );
  const activeJob = data ? activeJobForShift(data.events, myJobs, shift?.id) : undefined;
  const unread = data?.messages.filter((m) => m.recipientId === data.me && !m.readAt).length ?? 0;
  const site = data?.sites.find((s) => s.id === shift?.siteId);
  const monitorKey = data && data.me ? `shiftline-site-monitor:${data.company.id}:${data.me}` : "";
  useEffect(() => {
    if (monitorKey) setLocationEnabled(localStorage.getItem(monitorKey) === "on");
  }, [monitorKey]);
  const shiftId = shift?.id,
    shiftDate = shift?.date,
    shiftStart = shift?.start,
    trackingStop = shift?.trackingStop,
    timezone = data?.company.timezone;
  const targetLatitude = state === "on_job" ? activeJob?.latitude : site?.latitude;
  const targetLongitude = state === "on_job" ? activeJob?.longitude : site?.longitude;
  useEffect(() => {
    if (
      !shiftId ||
      !shiftDate ||
      !shiftStart ||
      !trackingStop ||
      !timezone ||
      !locationEnabled ||
      !visible ||
      !online ||
      pendingAttendance.length > 0 ||
      !["working", "on_job"].includes(state) ||
      targetLatitude == null ||
      targetLongitude == null ||
      !navigator.geolocation
    )
      return;
    return watchWorkPosition(
      { id: shiftId, date: shiftDate, start: shiftStart, trackingStop },
      timezone,
      async (action, payload) => {
        const result = await backend.command<Result>(action, payload);
        if (result.status === "exit")
          setNotice("You left the assigned work location. Your manager has been alerted.");
        if (result.status === "return") setNotice("You are back at the assigned work location.");
        return result;
      },
      setError,
    );
  }, [
    shiftId,
    shiftDate,
    shiftStart,
    trackingStop,
    timezone,
    locationEnabled,
    visible,
    online,
    pendingAttendance.length,
    state,
    targetLatitude,
    targetLongitude,
  ]);

  if (loading)
    return (
      <div className="worker-loading" role="status" aria-label="Loading your workday">
        <span className="sr-only">Loading your workday…</span>
        <div className="skeleton h-10 w-40 rounded-xl" />
        <div className="skeleton mt-10 h-16 w-48 self-center" />
        <div className="skeleton mt-6 h-16 w-full" />
        <div className="skeleton mt-5 h-12 w-full" />
        <div className="skeleton mt-10 h-44 w-44 self-center rounded-full" />
        <div className="skeleton mt-10 h-24 w-full" />
      </div>
    );
  if (!data)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-page px-7 text-center dark:bg-dpage">
        <p className="font-semibold">Your records could not load</p>
        <p className="text-sm text-sub">{error}</p>
        <Action onClick={() => void refresh()}>Retry</Action>
      </div>
    );
  if (data.onboarding || !me)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-page px-7 text-center dark:bg-dpage">
        <p className="font-semibold">Activate your employee account</p>
        <p className="text-sm text-sub">
          Ask your manager for your employee number and one-time code, then sign in again to
          activate.
        </p>
        <Action onClick={onSignOut}>Sign in again</Action>
      </div>
    );
  return (
    <div className="relative flex h-full flex-col bg-page text-ink dark:bg-dpage dark:text-white">
      <header className={`worker-header ${tab !== "today" || secondary ? "compact" : ""}`}>
        {secondary ? (
          <>
            <button
              className="worker-icon-button worker-back"
              onClick={() => setSecondary(null)}
              aria-label="Back to app"
            >
              <ChevronLeft size={22} />
            </button>
            <h1>
              {secondary === "profile"
                ? "Profile"
                : secondary === "requests"
                  ? "My Requests"
                  : "Notifications"}
            </h1>
            <span className="worker-header-spacer" />
          </>
        ) : tab === "today" ? (
          <>
            <button
              className="worker-avatar"
              aria-label="Open profile"
              onClick={() => setSecondary("profile")}
            >
              {me.name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
            </button>
            <div className="worker-greeting">
              <p>Welcome back,</p>
              <h1>{me.name}</h1>
            </div>
            <button
              className="worker-icon-button"
              aria-label="Notifications"
              onClick={() => setSecondary("notifications")}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <button
              className="worker-icon-button"
              aria-label="Open app menu"
              onClick={() => setSecondary("profile")}
            >
              <Menu size={19} />
            </button>
          </>
        ) : (
          <>
            <span className="worker-header-spacer" />
            <h1>
              {tab === "calendar"
                ? "Job Calendar"
                : tab === "hours"
                  ? "Working Hours"
                  : tabs.find((item) => item.id === tab)?.label}
            </h1>
            <button
              className="worker-icon-button"
              aria-label="Open profile"
              onClick={() => setSecondary("profile")}
            >
              <Menu size={18} />
            </button>
          </>
        )}
      </header>
      <div key={secondary ?? tab} className="worker-scroll no-scrollbar">
        {!online && (
          <div role="status" className="worker-offline">
            <WifiOff size={15} />
            You’re offline. Lunch and clock-out for an open workday can be saved on this device.
          </div>
        )}
        {pendingAttendance.length > 0 && (
          <div role="status" className="worker-offline">
            {pendingAttendance.length} attendance event(s) saved on this device. Not yet confirmed.
            <button
              disabled={busy || !online || reviewPending}
              onClick={() => void syncAttendance()}
            >
              Retry sync
            </button>
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-2xl bg-bad/10 p-3 text-sm text-bad">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-2xl bg-ok/10 p-3 text-sm text-ink dark:text-white">
            {notice}
          </div>
        )}
        {!secondary && tab === "today" && (
          <WorkerHome
            onAcknowledge={(id) => run("ack_notice", { id }, "Acknowledged")}
            data={data}
            state={state}
            busy={busy || locating || reviewPending}
            onAction={(type) => void act(type)}
            onDeparture={() => setDepartureOpen(true)}
            onEmergency={() => {
              setDepartureKind("emergency");
              setDepartureOpen(true);
            }}
            onJobs={() => switchTab("jobs")}
            monitoring={locationEnabled}
            onMonitoring={() => {
              const next = !locationEnabled;
              setLocationEnabled(next);
              localStorage.setItem(monitorKey, next ? "on" : "off");
            }}
          />
        )}
        {!secondary && tab === "calendar" && <WorkerJobCalendar data={data} />}
        {!secondary && tab === "today" && (
          <WorkerActivities
            data={data}
            state={state}
            busy={busy || locating || pendingAttendance.length > 0}
            online={online}
            run={run}
          />
        )}
        {!secondary && tab === "jobs" && (
          <>
            <div className="worker-segmented">
              {(["all", "assigned", "in_progress", "completed"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={jobFilter === value}
                  onClick={() => setJobFilter(value)}
                >
                  {value === "all"
                    ? "All"
                    : value === "assigned"
                      ? "Upcoming"
                      : value === "in_progress"
                        ? "Active"
                        : "Done"}
                </button>
              ))}
            </div>
            {availablePlans.map((plan) => (
              <Card key={plan.id}>
                <h2 className="font-semibold">{plan.title}</h2>
                <p className="text-sm mt-2">
                  {plan.date} · {plan.address || "Location needs confirmation"}
                </p>
                <p className="mt-3 whitespace-pre-wrap">{plan.details}</p>
                <p className="text-xs mt-2">
                  {plan.assignedNames.length
                    ? `Required employees: ${plan.assignedNames.join(", ")}`
                    : "Open to company workers"}
                </p>
                <Action
                  disabled={
                    busy ||
                    !online ||
                    pendingAttendance.length > 0 ||
                    reviewPending ||
                    state !== "working" ||
                    plan.date !== data.today ||
                    plan.latitude == null ||
                    !plan.address ||
                    (plan.employeeIds.length > 0 && !plan.employeeIds.includes(data.me))
                  }
                  onClick={() => {
                    let eventId = planStartIds.current.get(plan.id);
                    if (!eventId) {
                      eventId = crypto.randomUUID();
                      planStartIds.current.set(plan.id, eventId);
                    }
                    void run(
                      "start_calendar_job",
                      { id: eventId, calendarJobId: plan.id },
                      "Started job",
                    ).then((saved) => {
                      if (saved) planStartIds.current.delete(plan.id);
                    });
                  }}
                >
                  Leave for this job
                </Action>
              </Card>
            ))}
            {myJobs
              .filter((job) => jobFilter === "all" || job.status === jobFilter)
              .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
              .map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  data={data}
                  busy={busy || locating || !online}
                  run={run}
                  act={act}
                  active={activeJob?.id === j.id}
                  state={state}
                />
              ))}
            {!availablePlans.length &&
              !myJobs.some((job) => jobFilter === "all" || job.status === jobFilter) && (
                <EmptyState
                  icon={<Briefcase size={27} />}
                  title="No jobs here yet"
                  description="Assigned work will appear here with your schedule and team."
                />
              )}
          </>
        )}
        {!secondary && tab === "inbox" && <Inbox data={data} busy={busy || !online} run={run} />}
        {!secondary && tab === "hours" && <Hours data={data} busy={busy || !online} run={run} />}
        {secondary === "profile" && (
          <WorkerProfile
            data={data}
            onRequests={() => {
              setCorrection(null);
              setSecondary("requests");
            }}
            onSignOut={() => setConfirmOut(true)}
            monitoring={locationEnabled}
            onMonitoring={() => {
              const next = !locationEnabled;
              setLocationEnabled(next);
              localStorage.setItem(monitorKey, next ? "on" : "off");
            }}
          />
        )}
        {secondary === "requests" && (
          <WorkerRequests data={data} busy={busy || !online} run={run} correction={correction} />
        )}
        {secondary === "notifications" && (
          <WorkerNotifications
            data={data}
            onInbox={() => switchTab("inbox")}
            onRequests={() => {
              setCorrection(null);
              setSecondary("requests");
            }}
            onHours={() => switchTab("hours")}
          />
        )}
      </div>
      {clockInOpen && (
        <WorkerSheet
          title="Start your workday"
          onClose={() => {
            if (!busy && !locating) setClockInOpen(false);
          }}
        >
          <p className="worker-muted-copy">
            Your check-in time is recorded when you confirm. Choose your expected finish so location
            sharing stops on time.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (await act("clock_in", { expectedEnd })) {
                setLocationEnabled(shareDuringWork);
                localStorage.setItem(monitorKey, shareDuringWork ? "on" : "off");
                setClockInOpen(false);
              }
            }}
          >
            <label className="block my-4">
              Expected finish today
              <input
                aria-label="Expected finish today"
                type="time"
                required
                value={expectedEnd}
                onChange={(event) => setExpectedEnd(event.target.value)}
                className="block w-full rounded-xl border p-3 mt-2"
              />
            </label>
            <p className="worker-muted-copy">
              Lunch is planned for 12:00–13:00. Tap Start lunch and End lunch to record your actual
              break. Regular time uses the existing eight-hour rule; extra time needs approval.
            </p>
            <label className="flex gap-2 my-4">
              <input
                type="checkbox"
                checked={shareDuringWork}
                onChange={(event) => setShareDuringWork(event.target.checked)}
              />
              Share my location while working. Pauses on lunch, personal time, clock-out or expected
              finish.
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="worker-action mt-5" disabled={busy || locating || !online}>
              {locating ? "Checking location…" : busy ? "Checking in…" : "Check in now"}
            </button>
          </form>
        </WorkerSheet>
      )}
      {departureOpen && (
        <WorkerSheet title="Leave temporarily" onClose={() => setDepartureOpen(false)}>
          <p className="worker-muted-copy">
            Let your manager know why you’re leaving. Personal time is excluded from worked hours.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-xs text-bad">
              {error}
            </p>
          )}
          <div className="worker-request-form">
            <label>
              Reason
              <ThemedSelect
                value={departureKind}
                onValueChange={(value) => setDepartureKind(value as "personal" | "emergency")}
              >
                <option value="personal">Personal</option>
                <option value="emergency">Emergency</option>
              </ThemedSelect>
            </label>
            <label>
              Note
              <textarea
                value={departureNote}
                onChange={(event) => setDepartureNote(event.target.value)}
                maxLength={140}
                placeholder="A short note for your manager"
              />
            </label>
            <Action
              disabled={busy || reviewPending}
              onClick={() => {
                void act("start_personal", {
                  reason: departureKind,
                  note: departureNote.trim() || departureKind,
                }).then((saved) => {
                  if (saved) {
                    setDepartureOpen(false);
                    setDepartureNote("");
                  }
                });
              }}
            >
              Confirm departure
            </Action>
          </div>
        </WorkerSheet>
      )}
      {confirmOut && (
        <WorkerSheet title="Sign out of Shiftline?" onClose={() => setConfirmOut(false)}>
          <p className="worker-muted-copy">
            {pendingAttendance.length > 0
              ? "You have attendance saved only on this device. Sign in with the same account to synchronize it. Do not clear browser storage."
              : "Your recorded attendance stays safe. Sign in again to return to your workday."}
          </p>
          <div className="mt-5 space-y-3">
            <Action
              onClick={() => {
                void backend
                  .signOut()
                  .then(onSignOut)
                  .catch((cause) =>
                    setError(cause instanceof Error ? cause.message : "Could not sign out"),
                  );
                setConfirmOut(false);
              }}
            >
              Sign out
            </Action>
            <Action secondary onClick={() => setConfirmOut(false)}>
              Stay signed in
            </Action>
          </div>
        </WorkerSheet>
      )}
      <nav aria-label="Worker tabs" className="worker-tabbar">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            aria-current={!secondary && tab === id ? "page" : undefined}
            className={`worker-tab ${!secondary && tab === id ? "active" : ""}`}
          >
            <span className="worker-tab-icon">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            {label}
            {id === "inbox" && unread > 0 && (
              <span className="absolute right-1 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] text-white">
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function JobCard({
  job,
  data,
  busy,
  run,
  act,
  active,
  state,
}: {
  job: Job;
  data: AttendanceSnapshot;
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>;
  act: (type: EventType, extra?: Record<string, unknown>) => Promise<boolean>;
  active: boolean;
  state: string;
}) {
  const steps = data.jobSteps.filter((s) => s.jobId === job.id);
  const team = data.jobTeam.filter((t) => t.jobId === job.id);
  const comments = data.jobComments.filter((c) => c.jobId === job.id);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const completed = steps.filter((step) => step.completedAt).length;
  const percentage =
    job.status === "completed"
      ? 100
      : steps.length
        ? Math.round((completed / steps.length) * 100)
        : 0;
  return (
    <>
      <button className="worker-job-list-card" onClick={() => setOpen(true)}>
        <div>
          <span className={`worker-job-state ${job.status}`}>{job.status.replace(/_/g, " ")}</span>
          <ChevronRight size={17} />
        </div>
        <h3>{job.title}</h3>
        <p>
          <MapPin size={13} />
          {job.destination}
        </p>
        <small>
          {displayDate(job.date)} · {job.start}–{job.end}
        </small>
        <div className="worker-job-progress">
          <span>
            {steps.length ? `${completed}/${steps.length} tasks completed` : "View job details"}
          </span>
          <b>{percentage}%</b>
        </div>
        <div className="worker-progress-track">
          <span style={{ width: `${percentage}%` }} />
        </div>
      </button>
      {open && (
        <WorkerSheet title={job.title} onClose={() => setOpen(false)}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{job.title}</h3>
            <span className="rounded-full bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">
              {job.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-sub">
            {displayDate(job.date)} · {job.start}–{job.end}
          </p>
          <p className="mt-2 flex gap-1 text-sm">
            <MapPin size={16} /> {job.destination}
          </p>
          <p className="mt-3 rounded-xl bg-fill p-3 text-xs leading-relaxed dark:bg-dfill">
            {job.lunchOption === "none"
              ? "No lunch scheduled for this job. Contact your manager if you need a break."
              : "Lunch follows your shift schedule. Location sharing pauses during lunch."}
            {job.overtime && " Overtime job: recorded hours still require approval."}
          </p>
          {job.latitude != null && job.longitude != null && (
            <a
              className="mt-2 inline-block text-xs font-semibold text-brand"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`}
            >
              Open job directions ↗
            </a>
          )}
          {job.instructions && (
            <p className="mt-3 text-sm leading-relaxed text-sub">{job.instructions}</p>
          )}
          {steps.length > 0 && (
            <div className="mt-4 border-t border-sep pt-3 dark:border-dsep">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-sub">
                Tasks · {steps.filter((s) => s.completedAt).length}/{steps.length}
              </p>
              {steps.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      "set_job_step_done",
                      { stepId: s.id, done: !s.completedAt },
                      s.completedAt ? "Task reopened" : "Task completed",
                    )
                  }
                  className="flex w-full items-center gap-3 py-2 text-left text-sm"
                >
                  <span
                    className={`grid h-5 w-5 place-items-center rounded-md border ${s.completedAt ? "border-ok bg-ok text-white" : "border-sep"}`}
                  >
                    {s.completedAt && <Check size={14} />}
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          )}
          {team.length > 0 && (
            <p className="mt-3 text-xs text-sub">Team: {team.map((m) => m.name).join(", ")}</p>
          )}
          <div className="mt-4 border-t border-sep pt-3 dark:border-dsep">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sub">Comments</h4>
            <div className="mt-2 space-y-2">
              {comments.map((item) => (
                <div key={item.id} className="rounded-xl bg-fill p-3 text-sm dark:bg-dfill">
                  <b>{item.authorName}</b>
                  <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
                  <small className="text-sub">{new Date(item.createdAt).toLocaleString()}</small>
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!comment.trim()) return;
                void run(
                  "add_job_comment",
                  { jobId: job.id, body: comment.trim() },
                  "Comment posted",
                ).then((ok) => {
                  if (ok) setComment("");
                });
              }}
            >
              <input
                aria-label="Task comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={2000}
                placeholder="Write a comment"
                className="min-w-0 flex-1 rounded-xl bg-fill px-3 py-2 text-sm dark:bg-dfill"
              />
              <button
                type="submit"
                disabled={busy || !comment.trim()}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
          {job.date === data.today &&
            job.status !== "completed" &&
            job.assignee === data.me &&
            state === "working" && (
              <div className="mt-4">
                <Action disabled={busy} onClick={() => void act("start_job", { jobId: job.id })}>
                  Out on job
                </Action>
              </div>
            )}
          {active && (
            <div className="mt-4">
              <Action
                secondary
                disabled={busy}
                onClick={() => void act(state === "on_lunch" ? "end_lunch" : "start_lunch")}
              >
                {state === "on_lunch" ? "End lunch · resume job" : "Take lunch on this job"}
              </Action>
            </div>
          )}
          {active && (
            <div className="mt-4">
              <Action disabled={busy || state === "on_lunch"} onClick={() => void act("end_job")}>
                Return from job
              </Action>
            </div>
          )}
        </WorkerSheet>
      )}
    </>
  );
}

function Inbox({
  data,
  busy,
  run,
}: {
  data: AttendanceSnapshot;
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const [section, setSection] = useState<"messages" | "news" | "events">("messages");
  const [reply, setReply] = useState<Record<string, string>>({});
  const roots = data.messages.filter((m) => m.id === m.threadId && m.recipientId === data.me);
  const notices = data.notices.filter((n) => n.kind !== "event");
  const events = data.notices.filter((n) => n.kind === "event");
  return (
    <>
      <Card>
        <h2 className="text-[17px] font-semibold">From your company</h2>
        <p className="mt-1 text-sm text-sub">Messages, news and upcoming events</p>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-fill p-1 dark:bg-dfill">
          {(["messages", "news", "events"] as const).map((name) => (
            <button
              key={name}
              onClick={() => setSection(name)}
              className={`rounded-lg px-2 py-2 text-xs font-semibold capitalize ${section === name ? "bg-white text-brand shadow-sm dark:bg-dcard" : "text-sub"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </Card>
      {section === "messages" &&
        (roots.length ? (
          roots.map((root) => {
            const thread = data.messages
              .filter((m) => m.threadId === root.id)
              .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
            return (
              <Card key={root.id}>
                <h3 className="font-bold">{root.title}</h3>
                <p className="mt-1 text-xs text-sub">{root.senderName}</p>
                <div className="mt-4 space-y-3">
                  {thread.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[88%] rounded-2xl p-3 text-sm ${m.senderId === data.me ? "ml-auto bg-brand text-white" : "bg-fill dark:bg-dfill"}`}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-[11px] opacity-70">
                        {new Date(m.sentAt).toLocaleString()}
                      </p>
                      {m.recipientId === data.me && !m.readAt && (
                        <button
                          className="mt-1 text-xs underline"
                          disabled={busy}
                          onClick={() => void run("read_message", { id: m.id }, "Marked as read")}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const body = reply[root.id]?.trim();
                    if (body)
                      void run("reply_message", { threadId: root.id, body }, "Reply sent").then(
                        (ok) => {
                          if (ok) setReply((prev) => ({ ...prev, [root.id]: "" }));
                        },
                      );
                  }}
                >
                  <input
                    aria-label={`Reply to ${root.senderName}`}
                    className="min-w-0 flex-1 rounded-xl bg-fill px-3 py-2 text-sm dark:bg-dfill"
                    placeholder="Write a reply…"
                    maxLength={2000}
                    value={reply[root.id] ?? ""}
                    onChange={(e) => setReply((prev) => ({ ...prev, [root.id]: e.target.value }))}
                  />
                  <button
                    type="submit"
                    disabled={busy || !reply[root.id]?.trim()}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </Card>
            );
          })
        ) : (
          <Card>
            <p className="text-sm text-sub">
              No conversations yet. Your manager can start one here.
            </p>
          </Card>
        ))}
      {section === "news" &&
        (notices.length ? (
          notices.map((n) => (
            <NoticeCard
              key={n.id}
              notice={n}
              busy={busy}
              onAcknowledge={() => run("ack_notice", { id: n.id }, "Acknowledged")}
            />
          ))
        ) : (
          <Card>
            <p className="text-sm text-sub">No company news yet.</p>
          </Card>
        ))}
      {section === "events" &&
        (events.length ? (
          events.map((n) => (
            <NoticeCard
              key={n.id}
              notice={n}
              busy={busy}
              onAcknowledge={() => run("ack_notice", { id: n.id }, "Acknowledged")}
            />
          ))
        ) : (
          <Card>
            <p className="text-sm text-sub">No upcoming company events.</p>
          </Card>
        ))}
    </>
  );
}

function Hours({
  data,
  busy,
  run,
}: {
  data: AttendanceSnapshot;
  busy: boolean;
  run: (action: string, payload: Record<string, unknown>, success: string) => Promise<boolean>;
}) {
  const shifts = useMemo(
    () =>
      data.shifts
        .filter((s) => s.employeeId === data.me)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data],
  );
  const approved = shifts
    .filter((s) => data.timesheets.find((t) => t.shiftId === s.id)?.status === "approved")
    .reduce((sum, s) => sum + s.totals.workedMinutes, 0);
  return (
    <>
      <Card className="bg-[#eeecff] dark:bg-dcard">
        <Clock3 className="text-brand" />
        <p className="mt-3 text-sm text-sub">Approved hours</p>
        <h2 className="mt-1 text-[32px] font-bold">{minutes(approved)}</h2>
        <p className="mt-1 text-xs text-sub">
          Gross pay and exports are prepared after manager approval.
        </p>
      </Card>
      {shifts.map((s: Shift) => {
        const ts = data.timesheets.find((t) => t.shiftId === s.id);
        return (
          <Card key={s.id}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{displayDate(s.date)}</h3>
              <span className="text-xs font-semibold capitalize text-brand">
                {ts?.status ?? "open"}
              </span>
            </div>
            <p className="mt-1 text-xs text-sub">
              {s.start}–{s.end} · {data.sites.find((site) => site.id === s.siteId)?.name}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <p>
                Recorded
                <br />
                <b>{minutes(s.totals.recordedMinutes)}</b>
              </p>
              <p>
                Regular
                <br />
                <b>{minutes(s.totals.regularMinutes)}</b>
              </p>
              <p>
                Lunch
                <br />
                <b>{minutes(s.totals.lunchMinutes)}</b>
              </p>
              <p>
                Approved overtime
                <br />
                <b>{minutes(s.totals.overtimeMinutes)}</b>
              </p>
            </div>
            {s.totals.missingClockOut && (
              <p className="mt-3 text-sm text-bad">
                Clock-out is missing. Ask your manager for a correction.
              </p>
            )}
            {s.totals.complete && ts?.status === "open" && (
              <div className="mt-4">
                <Action
                  disabled={busy}
                  onClick={() =>
                    void run(
                      "submit_timesheet",
                      { shiftId: s.id, overtimeMinutes: s.totals.unapprovedOvertimeMinutes },
                      "Timesheet submitted for review",
                    )
                  }
                >
                  Submit timesheet · {minutes(s.totals.unapprovedOvertimeMinutes)} overtime
                </Action>
              </div>
            )}
            {ts?.status === "submitted" && (
              <p className="mt-3 text-sm text-sub">Waiting for manager review.</p>
            )}
          </Card>
        );
      })}
      {!shifts.length && (
        <Card>
          <p className="text-sm text-sub">Your hours will appear once shifts are assigned.</p>
        </Card>
      )}
    </>
  );
}
