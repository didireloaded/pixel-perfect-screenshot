import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Briefcase,
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  House,
  LogOut,
  Mail,
  MapPin,
  RefreshCw,
  Send,
} from "lucide-react";
import type { AttendanceSnapshot, EventType, Job, Shift } from "../../shared/attendance";
import * as backend from "./backend";

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
const stateLabels = {
  not_clocked_in: "Not clocked in",
  working: "Working",
  on_lunch: "On lunch",
  on_job: "On job",
  on_personal: "Away",
  clocked_out: "Clocked out",
};

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[20px] bg-card p-5 shadow-[0_1px_2px_rgba(28,28,30,.04),0_8px_24px_rgba(28,28,30,.045)] dark:bg-dcard ${className}`}
    >
      {children}
    </section>
  );
}
function Action({
  children,
  onClick,
  disabled,
  secondary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] px-4 text-[15px] font-semibold disabled:opacity-45 ${secondary ? "bg-fill text-ink dark:bg-dfill dark:text-white" : "bg-brand text-white"}`}
    >
      {children}
    </button>
  );
}
const minutes = (n: number) => `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m`;
const displayDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const displayTime = (time: number, zone: string) =>
  new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone,
  });

export default function LiveWorkerApp({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<AttendanceSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [departureOpen, setDepartureOpen] = useState(false);
  const [departureKind, setDepartureKind] = useState<"personal" | "emergency">("personal");
  const [departureNote, setDepartureNote] = useState("");
  const lastPositionSent = useRef(0);
  const writeLock = useRef(false);
  const revision = useRef(0);
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const run = useCallback(
    async (action: string, payload: Record<string, unknown>, success: string) => {
      if (writeLock.current || !navigator.onLine) {
        setError(
          navigator.onLine
            ? "Wait for the current action to finish"
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
    [],
  );

  const act = async (type: EventType, extra: Record<string, unknown> = {}) => {
    let location: Record<string, number> | undefined;
    const shift = data?.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
    if (!shift) {
      setError("No shift is assigned for today");
      return;
    }
    if (type === "clock_in" && data?.policy?.require_gps_stamp) {
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
        return;
      }
    }
    await run(
      "transition",
      { id: crypto.randomUUID(), type, ...(location ? { location } : {}), ...extra },
      eventLabels[type],
    );
  };
  const me = data?.employees.find((e) => e.id === data.me);
  const shift = data?.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
  const state = data?.states.find((s) => s.shiftId === shift?.id)?.state ?? "not_clocked_in";
  const myEvents =
    data?.events.filter((e) => e.employeeId === data.me && e.shiftId === shift?.id) ?? [];
  const myJobs = data?.jobs.filter((j) => j.assignee === data.me) ?? [];
  const activeJob = myJobs.find((j) => j.shiftId === shift?.id && j.status === "in_progress");
  const upcomingJobs = myJobs
    .filter((j) => j.status !== "completed")
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const unread = data?.messages.filter((m) => m.recipientId === data.me && !m.readAt).length ?? 0;
  const site = data?.sites.find((s) => s.id === shift?.siteId);
  const monitorKey = data && data.me ? `shiftline-site-monitor:${data.company.id}:${data.me}` : "";
  useEffect(() => {
    if (monitorKey) setLocationEnabled(localStorage.getItem(monitorKey) === "on");
  }, [monitorKey]);
  useEffect(() => {
    if (
      !data ||
      !shift ||
      !site ||
      !locationEnabled ||
      !visible ||
      state !== "working" ||
      site.latitude == null ||
      site.longitude == null ||
      !navigator.geolocation
    )
      return;
    const companyTime = () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: data.company.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
    const allowed = () => companyTime() >= shift.start && companyTime() < shift.trackingStop;
    if (!allowed()) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (!allowed() || Date.now() - lastPositionSent.current < 60000) return;
        lastPositionSent.current = Date.now();
        void backend
          .command<{ snapshot: AttendanceSnapshot; status?: string }>("report_position", {
            shiftId: shift.id,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            source: "web",
          })
          .then((result) => {
            if (result.status === "exit")
              setNotice("You left the worksite. Your manager has been alerted.");
            if (result.status === "return") setNotice("You are back at the worksite.");
          })
          .catch((cause) =>
            setError(cause instanceof Error ? cause.message : "Worksite check failed"),
          );
      },
      () => setError("Worksite checks are paused because location is unavailable."),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    );
    const stop = window.setInterval(() => {
      if (!allowed()) navigator.geolocation.clearWatch(watch);
    }, 1000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(stop);
    };
  }, [data, shift, site, locationEnabled, visible, state]);

  if (loading)
    return (
      <div className="flex h-full items-center justify-center bg-page text-sub dark:bg-dpage">
        Loading your workday…
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
  const zone = data.company.timezone;
  return (
    <div className="relative flex h-full flex-col bg-page text-ink dark:bg-dpage dark:text-white">
      <header className="flex items-center gap-3 px-6 pb-3 pt-11">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-brand/12 text-sm font-bold text-brand">
          {me.name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-sub dark:text-dsub">{data.company.name}</p>
          <h1 className="truncate text-[19px] font-bold">
            {tab === "today"
              ? `Hello, ${me.name.split(" ")[0]}`
              : tabs.find((t) => t.id === tab)?.label}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Refresh records"
          className="rounded-full p-2 text-sub"
        >
          <RefreshCw size={20} />
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              await backend.signOut();
              onSignOut();
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Could not sign out");
            }
          }}
          aria-label="Sign out"
          className="rounded-full p-2 text-sub"
        >
          <LogOut size={20} />
        </button>
      </header>
      <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-32">
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
        {tab === "today" && (
          <>
            <p className="px-1 text-[13px] font-semibold text-sub dark:text-dsub">
              {displayDate(data.today)} ·{" "}
              {shift ? `${shift.start}–${shift.end}` : "No shift assigned"}
            </p>
            <Card className="bg-[#eeecff] dark:bg-dcard">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-brand dark:bg-dfill">
                  {stateLabels[state]}
                </span>
                <Clock3 size={22} className="text-brand" />
              </div>
              <h2 className="mt-5 text-[29px] font-bold leading-tight">
                {shift ? "Your workday" : "No shift today"}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-[14px] text-sub dark:text-dsub">
                <MapPin size={15} />{" "}
                {data.sites.find((s) => s.id === shift?.siteId)?.name ?? "Schedule pending"}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/75 p-3 dark:bg-dfill">
                  <p className="text-xs text-sub">Clock in</p>
                  <p className="mt-1 font-bold">
                    {myEvents.find((e) => e.type === "clock_in")
                      ? displayTime(myEvents.find((e) => e.type === "clock_in")!.capturedAt, zone)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/75 p-3 dark:bg-dfill">
                  <p className="text-xs text-sub">Clock out</p>
                  <p className="mt-1 font-bold">
                    {myEvents.find((e) => e.type === "clock_out")
                      ? displayTime(myEvents.find((e) => e.type === "clock_out")!.capturedAt, zone)
                      : "—"}
                  </p>
                </div>
              </div>
              {shift && site?.latitude != null && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !locationEnabled;
                    setLocationEnabled(next);
                    localStorage.setItem(monitorKey, next ? "on" : "off");
                  }}
                  className="mt-4 text-left text-xs font-semibold text-brand"
                >
                  {locationEnabled
                    ? "Worksite checks on · tap to pause"
                    : "Enable worksite checks during this shift"}
                </button>
              )}
              <div className="mt-5 space-y-2">
                {state === "not_clocked_in" && (
                  <Action disabled={busy || !shift} onClick={() => void act("clock_in")}>
                    Clock in
                  </Action>
                )}
                {state === "working" && (
                  <>
                    <Action disabled={busy} onClick={() => void act("start_lunch")}>
                      <Coffee size={18} /> Start lunch
                    </Action>
                    <Action secondary disabled={busy} onClick={() => setDepartureOpen(true)}>
                      Leave temporarily
                    </Action>
                    <Action secondary disabled={busy} onClick={() => void act("clock_out")}>
                      Clock out
                    </Action>
                  </>
                )}
                {state === "on_lunch" && (
                  <Action disabled={busy} onClick={() => void act("end_lunch")}>
                    End lunch
                  </Action>
                )}
                {state === "on_personal" && (
                  <Action disabled={busy} onClick={() => void act("end_personal")}>
                    Return to work
                  </Action>
                )}
                {state === "on_job" && (
                  <>
                    <Action disabled={busy} onClick={() => void act("end_job")}>
                      Return from job
                    </Action>
                    <Action secondary disabled={busy} onClick={() => void act("clock_out")}>
                      Clock out
                    </Action>
                  </>
                )}
              </div>
            </Card>
            <Card>
              <h2 className="text-[17px] font-bold">Today’s timeline</h2>
              {!myEvents.length && (
                <p className="mt-3 text-sm text-sub">Your recorded actions will appear here.</p>
              )}
              <div className="mt-3 space-y-3">
                {myEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between border-t border-sep pt-3 text-sm dark:border-dsep"
                  >
                    <span>{eventLabels[e.type]}</span>
                    <span className="text-sub">{displayTime(e.capturedAt, zone)}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h2 className="text-[17px] font-bold">Next job</h2>
              {upcomingJobs[0] ? (
                <>
                  <p className="mt-2 font-semibold">{upcomingJobs[0].title}</p>
                  <p className="mt-1 text-sm text-sub">
                    {displayDate(upcomingJobs[0].date)} · {upcomingJobs[0].start}–
                    {upcomingJobs[0].end}
                  </p>
                  <Action secondary onClick={() => setTab("jobs")}>
                    View job
                  </Action>
                </>
              ) : (
                <p className="mt-2 text-sm text-sub">No upcoming jobs assigned.</p>
              )}
            </Card>
          </>
        )}
        {tab === "calendar" && (
          <>
            <Card>
              <h2 className="text-[21px] font-bold">Your calendar</h2>
              <p className="mt-1 text-sm text-sub">Assigned shifts and upcoming work</p>
            </Card>
            {data.shifts
              .filter((s) => s.employeeId === data.me)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((s) => (
                <Card key={s.id}>
                  <div className="flex justify-between">
                    <h3 className="font-bold">{displayDate(s.date)}</h3>
                    <span className="text-sm text-brand">
                      {s.start}–{s.end}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-sub">
                    {data.sites.find((site) => site.id === s.siteId)?.name} · {s.lunchMinutes}{" "}
                    minute lunch
                  </p>
                  {myJobs
                    .filter((j) => j.shiftId === s.id)
                    .map((j) => (
                      <p key={j.id} className="mt-2 rounded-xl bg-fill p-2 text-sm dark:bg-dfill">
                        {j.start} · {j.title}
                      </p>
                    ))}
                </Card>
              ))}
            {!data.shifts.some((s) => s.employeeId === data.me) && (
              <Card>
                <p className="text-sm text-sub">Your manager has not assigned shifts yet.</p>
              </Card>
            )}
          </>
        )}
        {tab === "jobs" && (
          <>
            <Card>
              <h2 className="text-[21px] font-bold">Your jobs</h2>
              <p className="mt-1 text-sm text-sub">Tasks, progress and team members</p>
            </Card>
            {myJobs
              .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
              .map((j) => (
                <JobCard
                  key={j.id}
                  job={j}
                  data={data}
                  busy={busy}
                  run={run}
                  act={act}
                  active={activeJob?.id === j.id}
                  state={state}
                />
              ))}
            {!myJobs.length && (
              <Card>
                <p className="text-sm text-sub">No jobs assigned yet.</p>
              </Card>
            )}
          </>
        )}
        {tab === "inbox" && <Inbox data={data} busy={busy} run={run} />}
        {tab === "hours" && <Hours data={data} busy={busy} run={run} />}
      </div>
      {departureOpen && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-black/40"
          role="presentation"
          onClick={() => setDepartureOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Temporary departure"
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[28px] bg-card p-6 pb-10 dark:bg-dcard"
          >
            <h2 className="text-xl font-bold">Leave temporarily</h2>
            <p className="mt-1 text-sm text-sub">
              Tell your manager why you’re leaving. Personal time is excluded from worked hours.
            </p>
            <label className="mt-5 block text-sm font-semibold">
              Reason
              <select
                value={departureKind}
                onChange={(e) => setDepartureKind(e.target.value as "personal" | "emergency")}
                className="mt-2 w-full rounded-xl bg-fill p-3 dark:bg-dfill"
              >
                <option value="personal">Personal</option>
                <option value="emergency">Emergency</option>
              </select>
            </label>
            <label className="mt-3 block text-sm font-semibold">
              Note
              <textarea
                value={departureNote}
                onChange={(e) => setDepartureNote(e.target.value)}
                maxLength={140}
                placeholder="A short note for your manager"
                className="mt-2 min-h-20 w-full rounded-xl bg-fill p-3 text-sm dark:bg-dfill"
              />
            </label>
            <div className="mt-5 space-y-2">
              <Action
                disabled={busy}
                onClick={() => {
                  void act("start_personal", {
                    reason: departureKind,
                    note: departureNote.trim() || departureKind,
                  });
                  setDepartureOpen(false);
                  setDepartureNote("");
                }}
              >
                Confirm departure
              </Action>
              <Action secondary onClick={() => setDepartureOpen(false)}>
                Cancel
              </Action>
            </div>
          </div>
        </div>
      )}
      <nav
        aria-label="Worker tabs"
        className="absolute inset-x-4 bottom-7 z-20 flex justify-between rounded-full bg-white/95 p-2 shadow-[0_10px_35px_rgba(0,0,0,.12)] backdrop-blur dark:bg-dcard/95"
      >
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? "page" : undefined}
            className={`relative flex min-w-[58px] flex-col items-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] ${tab === id ? "font-bold text-brand" : "text-sub"}`}
          >
            <Icon size={22} />
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
  act: (type: EventType, extra?: Record<string, unknown>) => Promise<void>;
  active: boolean;
  state: string;
}) {
  const steps = data.jobSteps.filter((s) => s.jobId === job.id);
  const team = data.jobTeam.filter((t) => t.jobId === job.id);
  const comments = data.jobComments.filter((c) => c.jobId === job.id);
  const [comment, setComment] = useState("");
  return (
    <Card>
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
      {job.date === data.today && job.status === "assigned" && state === "working" && (
        <div className="mt-4">
          <Action disabled={busy} onClick={() => void act("start_job", { jobId: job.id })}>
            Start job
          </Action>
        </div>
      )}
      {active && (
        <div className="mt-4">
          <Action disabled={busy} onClick={() => void act("end_job")}>
            Return from job
          </Action>
        </div>
      )}
    </Card>
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
        <h2 className="text-[21px] font-bold">From your company</h2>
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
            <Card key={n.id}>
              <h3 className="font-bold">{n.title}</h3>
              <p className="mt-1 text-xs text-sub">
                {displayDate(n.startsOn)}
                {n.endsOn !== n.startsOn ? ` – ${displayDate(n.endsOn)}` : ""}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm">{n.body}</p>
              {n.requiresAck && !n.acknowledged && (
                <div className="mt-3">
                  <Action
                    secondary
                    disabled={busy}
                    onClick={() => void run("ack_notice", { id: n.id }, "Acknowledged")}
                  >
                    Acknowledge
                  </Action>
                </div>
              )}
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-sm text-sub">No company news yet.</p>
          </Card>
        ))}
      {section === "events" &&
        (events.length ? (
          events.map((n) => (
            <Card key={n.id}>
              <h3 className="font-bold">{n.title}</h3>
              <p className="mt-1 text-xs text-sub">
                {displayDate(n.startsOn)} · {n.startsTime ?? "Time to be confirmed"}
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm">{n.body}</p>
            </Card>
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
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
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
  const submitLeave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      await run(
        "create_request",
        { kind: "leave", summary: summary.trim(), detail: detail.trim() },
        "Request sent to your manager",
      )
    ) {
      setSummary("");
      setDetail("");
    }
  };
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
      <Card>
        <h2 className="text-[17px] font-bold">Request time off</h2>
        <form onSubmit={(e) => void submitLeave(e)} className="mt-3 space-y-2">
          <input
            required
            maxLength={120}
            placeholder="Reason or dates"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded-xl bg-fill p-3 text-sm outline-none dark:bg-dfill"
          />
          <textarea
            maxLength={2000}
            placeholder="Details for your manager"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            className="min-h-20 w-full rounded-xl bg-fill p-3 text-sm outline-none dark:bg-dfill"
          />
          <button
            type="submit"
            disabled={busy || !summary.trim()}
            className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brand px-4 text-[15px] font-semibold text-white disabled:opacity-45"
          >
            <Send size={16} /> Send request
          </button>
        </form>
      </Card>
      {data.requests
        .filter((r) => r.employeeId === data.me)
        .map((r) => (
          <Card key={r.id}>
            <div className="flex justify-between gap-2">
              <h3 className="font-bold">{r.summary}</h3>
              <span className="text-xs font-bold capitalize text-brand">{r.status}</span>
            </div>
            <p className="mt-2 text-sm text-sub">{r.detail || r.kind.replace("_", " ")}</p>
            {r.reason && <p className="mt-2 text-sm">Manager: {r.reason}</p>}
          </Card>
        ))}
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
