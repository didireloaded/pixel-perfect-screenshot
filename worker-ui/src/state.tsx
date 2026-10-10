import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as backend from "./backend";
import {
  DEVICES, Device, EMPLOYEE, INITIAL_REQUESTS, JOBS, MESSAGES as MESSAGES_ALL,
  NOTIFICATIONS, RequestItem, SHIFT,
} from "./data";
import { SHIFT_RECORDS } from "./demo/shiftRecords";
import { buildDayView, validateOvertimeRequest } from "./calc/overtime";
import type {
  AttendanceEvent, DayView, DepartureKind, EventType, OvertimeClaim,
  OvertimeValidation, ShiftPolicy, ShiftRecord,
} from "./calc/overtime";

/** Northstar day-shift policy for the live in-progress shift. */
const LIVE_POLICY: ShiftPolicy = {
  id: "ns-ops-standard",
  workdate: "2026-10-09",
  scheduledStart: "2026-10-09T08:00:00+01:00",
  scheduledEnd: "2026-10-09T17:00:00+01:00",
  overtimeAfterMinutes: 480,
  overtimeGraceMinutes: 5,
  roundingMinutes: 5,
  unpaidDepartureKinds: ["personal", "emergency"],
  lunchUnpaid: true,
  jobTimePaid: true,
  clockOutCutoffMinutes: 240,
  duplicateWindowSeconds: 120,
  timezone: "Europe/London",
};

export const LIVE_SHIFT_ID = "s-live";

export type Phase =
  | "splash"
  | "welcome"
  | "signin"
  | "signup"
  | "verify"
  | "activate"
  | "app";

export type Tab = "today" | "calendar" | "jobs" | "inbox" | "hours";

export interface NavEntry {
  name: string;
  params?: Record<string, any>;
  key: number;
}

export type AttStatus = "off" | "working" | "lunch" | "away" | "onjob" | "done";

export type SyncState = "pending" | "confirmed" | "review" | "unsynced";

export interface TimelineEvent {
  id: number;
  time: string;
  label: string;
  kind: "in" | "lunch" | "away" | "job" | "out";
  sync: SyncState;
}

/** Whether worksite location checks are running right now, and why not. */
export interface SiteCheckState {
  active: boolean;
  label: string;
  reason: string;
}

/** One row of the worker-visible sync history. */
export interface SyncLogEntry {
  id: number;
  /** ISO-8601 */
  at: string;
  kind: "saved" | "confirmed" | "conflict" | "manual";
  label: string;
}

export interface Blocker {
  id: string;
  jobId: string;
  category: string;
  note: string;
  at: string;
  status: "Sent" | "Acknowledged";
}

export interface Handover {
  jobId: string;
  note: string;
  state: "completed" | "blocked";
  at: string;
}

export interface Attachment {
  id: string;
  jobId: string;
  name: string;
  kind: "photo" | "document";
  /** Object URL for photos taken in this session; undefined for demo entries. */
  url?: string;
  size: string;
  at: string;
}

export interface HelpRequest {
  id: string;
  about: string;
  subject: string;
  message: string;
  at: string;
  status: "Sent" | "Answered";
  answer?: string;
  answeredBy?: string;
}

export interface Attendance {
  status: AttStatus;
  clockInAt?: number;
  clockInLabel?: string;
  lunchStartedAt?: number;
  breakMs: number;
  awayStartedAt?: number;
  awayReason?: string;
  awayKind?: DepartureKind;
  awayNote?: string;
  /** Worker's own estimate, shown on Today and to the manager. Never used in maths. */
  awayExpectedReturn?: string;
  jobStartedAt?: number;
  activeJobId?: string;
  clockOutAt?: number;
  clockOutLabel?: string;
  pendingSync: boolean;
  timeline: TimelineEvent[];
  /**
   * The real attendance event log for today, in the same shape the backend
   * stores. Every clock action appends here, so overtime is derived from
   * recorded events rather than from the phone's clock.
   */
  liveLog: AttendanceEvent[];
  /** in-app reminders that have been surfaced / dismissed */
  reminders: { lunch?: boolean; siteExit?: boolean };
}

export type JobStatus = "assigned" | "inprogress" | "completed";
export interface JobState {
  status: JobStatus;
  done: number[];
}

interface Toast {
  id: number;
  text: string;
  kind: "success" | "info" | "error";
}

export function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDur(ms: number) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

export function fmtDurShort(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

interface AppCtx {
  // auth flow
  phase: Phase;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
  signOut: () => void;

  // navigation
  tab: Tab;
  setTab: (t: Tab) => void;
  stack: NavEntry[];
  closing: NavEntry | null;
  push: (name: string, params?: Record<string, any>) => void;
  pop: () => void;
  popAll: () => void;
  goTab: (t: Tab) => void; // pops everything then switches tab

  // theme
  appearance: "system" | "light" | "dark";
  setAppearance: (a: "system" | "light" | "dark") => void;
  isDark: boolean;

  // attendance
  att: Attendance;
  clockIn: () => void;
  syncNow: () => number;
  dismissReminder: (key: "lunch" | "siteExit") => void;
  triggerLunchReminder: () => void;
  triggerSiteExitAlert: () => void;
  siteCheckState: SiteCheckState;
  startLunch: () => void;
  endLunch: () => number;
  startAway: (reason: string, note?: string, expectedReturn?: string) => void;
  endAway: () => number;
  startJobAtt: (jobId: string) => void;
  returnFromJob: () => void;
  clockOut: () => void;
  workedMs: (now: number) => number;

  // jobs
  jobState: Record<string, JobState>;
  toggleTask: (jobId: string, idx: number) => void;
  setJobStatus: (jobId: string, s: JobStatus) => void;

  // comms
  readMsgs: string[];
  markMsgRead: (id: string) => void;
  markAllMsgsRead: () => void;
  ackedNotices: string[];
  ackNotice: (id: string) => void;
  readNotifs: string[];
  markNotifRead: (id: string) => void;
  markAllNotifs: () => void;

  // requests
  requests: RequestItem[];
  addRequest: (r: RequestItem) => void;

  // hours & overtime (derived by src/calc/overtime.ts)
  submittedTs: string[];
  submitTimesheet: (id: string) => void;
  /** One entry per shift, newest first: totals + approval state. */
  dayViews: DayView[];
  liveShiftRecord: ShiftRecord | null;
  otClaims: OvertimeClaim[];
  requestOvertimeForShift: (
    shiftId: string,
    minutes: number,
    reason: string
  ) => OvertimeValidation;

  // account & devices
  devices: Device[];
  removeDevice: (id: string) => void;

  // sync ledger — what was saved, confirmed, or conflicted, and when
  syncLog: SyncLogEntry[];
  lastSyncedAt: number;

  // job support
  blockers: Blocker[];
  reportBlocker: (jobId: string, category: string, note: string) => void;
  handovers: Record<string, Handover>;
  saveHandover: (jobId: string, note: string, state: Handover["state"]) => void;
  attachments: Attachment[];
  addAttachment: (jobId: string, file: File) => void;

  // structured help requests
  helpRequests: HelpRequest[];
  askForHelp: (about: string, subject: string, message: string) => void;

  // accessibility
  textScale: number;
  setTextScale: (n: number) => void;
  reduceMotion: boolean;
  setReduceMotion: (b: boolean) => void;

  /** Shifts with a missing clock-in or clock-out, derived from the calc layer. */
  missingPunches: DayView[];

  // prefs
  prefs: Record<string, boolean>;
  setPref: (k: string, v: boolean) => void;

  // feedback
  toastItem: Toast | null;
  toast: (text: string, kind?: Toast["kind"]) => void;
  online: boolean;
}

const Ctx = createContext<AppCtx>(null as any);
export const useApp = () => useContext(Ctx);

let keyCounter = 1;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>("splash");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!await backend.hasSession()) return;
        const data = await backend.snapshot<{ onboarding?: boolean }>();
        if (active) setPhase(data.onboarding ? "activate" : "app");
      } catch { /* The sign-in screen handles authentication errors. */ }
    })();
    return () => { active = false; };
  }, []);
  const [tab, setTab] = useState<Tab>("today");
  const [stack, setStack] = useState<NavEntry[]>([]);
  const [closing, setClosing] = useState<NavEntry | null>(null);
  const closeTimer = useRef<number | null>(null);

  const push = useCallback((name: string, params?: Record<string, any>) => {
    setStack((s) => [...s, { name, params, key: keyCounter++ }]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) return s;
      const top = s[s.length - 1];
      setClosing(top);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => setClosing(null), 300);
      return s.slice(0, -1);
    });
  }, []);

  const popAll = useCallback(() => {
    setStack([]);
    setClosing(null);
  }, []);

  const goTab = useCallback((t: Tab) => {
    setStack([]);
    setClosing(null);
    setTab(t);
  }, []);

  // theme
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">("system");
  const [sysDark, setSysDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const isDark = appearance === "dark" || (appearance === "system" && sysDark);

  // attendance
  const [att, setAtt] = useState<Attendance>({
    status: "off",
    breakMs: 0,
    pendingSync: false,
    timeline: [],
    liveLog: [],
    reminders: {},
  });

  const evId = useRef(1);

  // ── Sync ledger: exactly what happened to what, and when ────────────────
  const [syncLog, setSyncLog] = useState<SyncLogEntry[]>(() => [
    {
      id: -3,
      at: "2026-10-08T17:02:11+01:00",
      kind: "confirmed",
      label: "Thu 8 Oct clock-out confirmed by the server",
    },
    {
      id: -2,
      at: "2026-10-02T15:44:02+01:00",
      kind: "conflict",
      label: "Fri 2 Oct clock-in conflict · kiosk 08:01, phone 08:02 · needs review",
    },
    {
      id: -1,
      at: "2026-10-02T08:02:40+01:00",
      kind: "saved",
      label: "Fri 2 Oct clock-in saved on this phone while offline",
    },
  ]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => Date.now() - 42 * 60000);

  const logSync = useCallback((kind: SyncLogEntry["kind"], label: string) => {
    setSyncLog((s) =>
      [{ id: Date.now() + Math.random(), at: new Date().toISOString(), kind, label }, ...s].slice(0, 40)
    );
    if (kind === "confirmed" || kind === "manual") setLastSyncedAt(Date.now());
  }, []);

  /**
   * Every clock action produces two things that share an id:
   *  • a display entry for the Today timeline, and
   *  • a real `AttendanceEvent` for the calculation layer.
   *
   * An action starts as *pending* and only becomes *confirmed* once the round
   * trip completes; offline actions are saved as *unsynced*. Departures are
   * additionally shown as needing manager review.
   */
  const makeEvent = (
    kind: TimelineEvent["kind"],
    label: string,
    opts: {
      type: EventType;
      review?: boolean;
      departureKind?: DepartureKind;
      note?: string;
      jobId?: string;
      jobTitle?: string;
    }
  ): { t: TimelineEvent; e: AttendanceEvent } => {
    const id = evId.current++;
    const nowMs = Date.now();
    const iso = new Date(nowMs).toISOString();
    const offline = !navigator.onLine;
    return {
      t: {
        id,
        time: fmtTime(nowMs),
        label,
        kind,
        sync: offline ? "unsynced" : opts.review ? "review" : "pending",
      },
      e: {
        id: `live-${id}`,
        type: opts.type,
        at: iso,
        source: "device",
        sync: offline ? "unsynced" : "pending",
        departureKind: opts.departureKind,
        note: opts.note,
        jobId: opts.jobId,
        jobTitle: opts.jobTitle,
        recordedAt: iso,
        actor: EMPLOYEE.name,
      },
    };
  };

  const confirmEvent = useCallback(
    (id: number, label: string, delay = 2200) => {
      window.setTimeout(() => {
        if (!navigator.onLine) return;
        setAtt((a) => ({
          ...a,
          timeline: a.timeline.map((e) =>
            e.id === id && e.sync === "pending" ? { ...e, sync: "confirmed" } : e
          ),
          liveLog: a.liveLog.map((e) =>
            e.id === `live-${id}` && e.sync !== "confirmed" ? { ...e, sync: "confirmed" } : e
          ),
        }));
        logSync("confirmed", `${label} · confirmed by the server`);
      }, delay);
    },
    [logSync]
  );

  const withEvent = useCallback(
    (
      a: Attendance,
      pair: { t: TimelineEvent; e: AttendanceEvent },
      extra: Partial<Attendance>
    ): Attendance => {
      if (pair.t.sync === "pending") confirmEvent(pair.t.id, pair.t.label);
      if (pair.t.sync === "unsynced") logSync("saved", `${pair.t.label} · saved on this phone`);
      return {
        ...a,
        ...extra,
        pendingSync: pair.t.sync === "unsynced" ? true : a.pendingSync,
        timeline: [...a.timeline, pair.t],
        liveLog: [...a.liveLog, pair.e],
      };
    },
    [confirmEvent]
  );

  const clockIn = useCallback(() => {
    const t = Date.now();
    setAtt((a) =>
      withEvent(a, makeEvent("in", "Clocked in · Main Office", { type: "clock_in" }), {
        status: "working",
        clockInAt: t,
        clockInLabel: fmtTime(t),
        reminders: { ...a.reminders, lunch: false, siteExit: false },
      })
    );
  }, [withEvent]);

  /** Flushes anything saved on the phone once a connection is back. */
  const syncNow = useCallback(() => {
    const queued = att.timeline.filter((e) => e.sync === "unsynced").length;
    logSync(
      "manual",
      queued > 0
        ? `Manual sync started · ${queued} saved action${queued > 1 ? "s" : ""} queued`
        : "Manual sync · nothing queued, already up to date"
    );
    if (queued === 0) {
      setAtt((a) => ({ ...a, pendingSync: false }));
      return 0;
    }
    window.setTimeout(() => {
      setAtt((a) => ({
        ...a,
        pendingSync: false,
        timeline: a.timeline.map((e) =>
          e.sync === "unsynced" || e.sync === "pending" ? { ...e, sync: "confirmed" } : e
        ),
        liveLog: a.liveLog.map((e) =>
          e.sync === "unsynced" || e.sync === "pending" ? { ...e, sync: "confirmed" } : e
        ),
      }));
    }, 1200);
    return queued;
  }, [att.timeline]);

  const dismissReminder = useCallback((key: "lunch" | "siteExit") => {
    setAtt((a) => ({ ...a, reminders: { ...a.reminders, [key]: true } }));
  }, []);

  const triggerLunchReminder = useCallback(() => {
    setAtt((a) =>
      a.status === "working" && !a.reminders.lunch
        ? { ...a, reminders: { ...a.reminders, lunch: true } }
        : a
    );
  }, []);

  const triggerSiteExitAlert = useCallback(() => {
    setAtt((a) => {
      if (a.status !== "working" || a.reminders.siteExit) return a;
      // A detection, not an attendance action: it is shown on the timeline but
      // deliberately never written to the event log or the calculation.
      const alertId = evId.current++;
      return {
        ...a,
        reminders: { ...a.reminders, siteExit: true },
        timeline: [
          ...a.timeline,
          {
            id: alertId,
            time: fmtTime(Date.now()),
            label: "Left the worksite · exit alert",
            kind: "away" as const,
            sync: "review" as const,
          },
        ],
      };
    });
  }, []);

  const startLunch = useCallback(() => {
    const t = Date.now();
    setAtt((a) =>
      withEvent(a, makeEvent("lunch", "Lunch break started", { type: "lunch_start" }), {
        status: "lunch",
        lunchStartedAt: t,
        reminders: { ...a.reminders, lunch: false },
      })
    );
  }, [withEvent]);

  const endLunch = useCallback(() => {
    const t = Date.now();
    let dur = 0;
    setAtt((a) => {
      dur = a.lunchStartedAt ? t - a.lunchStartedAt : 0;
      return withEvent(a, makeEvent("lunch", "Returned from lunch", { type: "lunch_end" }), {
        status: "working",
        breakMs: a.breakMs + dur,
        lunchStartedAt: undefined,
      });
    });
    return dur;
  }, [withEvent]);

  const startAway = useCallback(
    (reason: string, note?: string, expectedReturn?: string) => {
      const t = Date.now();
      const departureKind: DepartureKind = reason === "Emergency" ? "emergency" : "personal";
      setAtt((a) =>
        withEvent(
          a,
          makeEvent("away", `Left temporarily · ${reason}`, {
            type: "departure_start",
            review: true,
            departureKind,
            note: note?.trim() || reason,
          }),
          {
            status: "away",
            awayStartedAt: t,
            awayReason: reason,
            awayKind: departureKind,
            awayNote: note?.trim() || reason,
            awayExpectedReturn: expectedReturn,
          }
        )
      );
    },
    [withEvent]
  );

  const endAway = useCallback(() => {
    const t = Date.now();
    let dur = 0;
    setAtt((a) => {
      dur = a.awayStartedAt ? t - a.awayStartedAt : 0;
      return withEvent(
        a,
        makeEvent("away", "Returned to work", {
          type: "departure_end",
          review: true,
          departureKind: a.awayKind ?? "personal",
        }),
        {
          status: "working",
          breakMs: a.breakMs + dur,
          awayStartedAt: undefined,
          awayReason: undefined,
          awayKind: undefined,
          awayNote: undefined,
          awayExpectedReturn: undefined,
        }
      );
    });
    return dur;
  }, [withEvent]);

  const startJobAtt = useCallback(
    (jobId: string) => {
      const t = Date.now();
      const job = JOBS.find((j) => j.id === jobId);
      setAtt((a) =>
        withEvent(
          a,
          makeEvent("job", `Left for job · ${job?.title ?? "Job"}`, {
            type: "job_start",
            jobId,
            jobTitle: job?.title,
          }),
          {
            status: a.status === "off" || a.status === "done" ? a.status : "onjob",
            jobStartedAt: t,
            activeJobId: jobId,
          }
        )
      );
    },
    [withEvent]
  );

  const returnFromJob = useCallback(() => {
    setAtt((a) => {
      const job = JOBS.find((j) => j.id === a.activeJobId);
      return withEvent(
        a,
        makeEvent("job", `Returned from job · ${job?.title ?? "Job"}`, {
          type: "job_end",
          jobId: a.activeJobId,
          jobTitle: job?.title,
        }),
        {
          status: a.status === "onjob" ? "working" : a.status,
          jobStartedAt: undefined,
          activeJobId: undefined,
        }
      );
    });
  }, [withEvent]);

  const clockOut = useCallback(() => {
    const t = Date.now();
    setAtt((a) =>
      withEvent(a, makeEvent("out", "Clocked out · Main Office", { type: "clock_out" }), {
        status: "done",
        clockOutAt: t,
        clockOutLabel: fmtTime(t),
      })
    );
  }, [withEvent]);

  const workedMs = useCallback(
    (now: number) => {
      if (!att.clockInAt) return 0;
      const end = att.clockOutAt ?? now;
      let paused = att.breakMs;
      if (att.status === "lunch" && att.lunchStartedAt) paused += now - att.lunchStartedAt;
      if (att.status === "away" && att.awayStartedAt) paused += now - att.awayStartedAt;
      return Math.max(0, end - att.clockInAt - paused);
    },
    [att]
  );

  // jobs
  const [jobState, setJobState] = useState<Record<string, JobState>>(() => {
    const init: Record<string, JobState> = {};
    for (const j of JOBS) {
      init[j.id] = {
        status: j.bucket === "completed" ? "completed" : "assigned",
        done: j.bucket === "completed" ? j.tasks.map((_, i) => i) : [],
      };
    }
    return init;
  });

  const toggleTask = useCallback((jobId: string, idx: number) => {
    setJobState((s) => {
      const js = s[jobId];
      const done = js.done.includes(idx)
        ? js.done.filter((i) => i !== idx)
        : [...js.done, idx];
      return { ...s, [jobId]: { ...js, done } };
    });
  }, []);

  const setJobStatus = useCallback((jobId: string, status: JobStatus) => {
    setJobState((s) => ({ ...s, [jobId]: { ...s[jobId], status } }));
  }, []);

  // comms read state
  const [readMsgs, setReadMsgs] = useState<string[]>(["m3", "m4"]);
  const markMsgRead = useCallback(
    (id: string) => setReadMsgs((r) => (r.includes(id) ? r : [...r, id])),
    []
  );
  const [ackedNotices, setAckedNotices] = useState<string[]>(["n3"]);
  const ackNotice = useCallback(
    (id: string) => setAckedNotices((r) => (r.includes(id) ? r : [...r, id])),
    []
  );
  const [readNotifs, setReadNotifs] = useState<string[]>(["nt5", "nt6"]);
  const markNotifRead = useCallback(
    (id: string) => setReadNotifs((r) => (r.includes(id) ? r : [...r, id])),
    []
  );
  const markAllNotifs = useCallback(
    () => setReadNotifs(NOTIFICATIONS.map((n) => n.id)),
    []
  );

  // requests
  const [requests, setRequests] = useState<RequestItem[]>(INITIAL_REQUESTS);
  const addRequest = useCallback((r: RequestItem) => setRequests((rs) => [r, ...rs]), []);

  // prefs
  const [prefs, setPrefsState] = useState<Record<string, boolean>>({
    shiftReminders: true,
    jobAssignments: true,
    companyMessages: true,
    leaveDecisions: true,
    timesheetUpdates: false,
    announcements: true,
    siteChecks: true,
    exitAlerts: true,
  });
  const setPref = useCallback(
    (k: string, v: boolean) => setPrefsState((p) => ({ ...p, [k]: v })),
    []
  );

  /** Worksite location checks run only while an active shift is on the clock. */
  const siteCheckState = useMemo<SiteCheckState>(() => {
    if (!prefs.siteChecks)
      return {
        active: false,
        label: "Off",
        reason: "Worksite checks are switched off in Location & Privacy.",
      };
    switch (att.status) {
      case "off":
        return { active: false, label: "Idle", reason: "Checks run only at the moment you clock in or out." };
      case "working":
        return { active: true, label: "Active on shift", reason: "Confirming you are at Main Office while you work." };
      case "onjob":
        return { active: true, label: "Active · on job", reason: "Confirming you are at the job destination." };
      case "lunch":
        return { active: false, label: "Paused · break", reason: "Location checks pause for the whole of your break." };
      case "away":
        return { active: false, label: "Paused · departure", reason: "Location checks pause while you are away from site." };
      case "done":
        return { active: false, label: "Paused · after cutoff", reason: "Checks stop at the shift cutoff. Nothing is recorded once you clock out." };
    }
  }, [att.status, prefs.siteChecks]);

  // timesheet submission
  const [submittedTs, setSubmittedTs] = useState<string[]>([]);
  const submitTimesheet = useCallback((id: string) => {
    setSubmittedTs((s) => (s.includes(id) ? s : [...s, id]));
  }, []);

  // ── Overtime: claims plus views derived by the pure calculation layer ───
  const [otClaims, setOtClaims] = useState<OvertimeClaim[]>(() =>
    SHIFT_RECORDS.map((r) => r.claim).filter((c): c is OvertimeClaim => !!c)
  );

  /** Today's shift expressed as a real event log, so the same derivation that
   *  the backend would run applies to it. It stays provisional until a
   *  clock-out is confirmed — the phone's clock is never authoritative. */
  const liveShiftRecord = useMemo<ShiftRecord | null>(() => {
    if (!att.clockInAt) return null;
    return {
      id: LIVE_SHIFT_ID,
      label: "Fri 9 Oct",
      workdate: "2026-10-09",
      site: SHIFT.site,
      policy: LIVE_POLICY,
      events: att.liveLog,
      timesheetStatus: submittedTs.includes(LIVE_SHIFT_ID) ? "Submitted" : "Open",
      claim: otClaims.find((c) => c.shiftId === LIVE_SHIFT_ID),
    };
  }, [att.clockInAt, att.liveLog, submittedTs, otClaims]);

  const dayViews = useMemo<DayView[]>(() => {
    const records: ShiftRecord[] = [
      ...(liveShiftRecord ? [liveShiftRecord] : []),
      ...SHIFT_RECORDS.map((r) => ({ ...r, claim: otClaims.find((c) => c.shiftId === r.id) })),
    ];
    return records.map(buildDayView);
  }, [liveShiftRecord, otClaims]);

  /**
   * Requests overtime for one shift. Only amounts supported by the recorded
   * events and the shift policy are accepted, and a provisional calculation is
   * refused outright — that is what stops a missing clock-out from becoming
   * claimable overtime.
   */
  const requestOvertimeForShift = useCallback(
    (shiftId: string, minutes: number, reason: string): OvertimeValidation => {
      const view = dayViews.find((d) => d.record.id === shiftId);
      if (!view) {
        return { ok: false, cappedMinutes: 0, errors: ["That shift is not available."], warnings: [] };
      }
      const v = validateOvertimeRequest(minutes, view.totals, view.record.policy);
      if (!reason.trim()) {
        return { ...v, ok: false, errors: [...v.errors, "Add a short reason for the overtime."] };
      }
      if (!v.ok) return v;
      const claim: OvertimeClaim = {
        id: `cl-${shiftId}-${Date.now()}`,
        shiftId,
        requestedMinutes: v.cappedMinutes,
        eligibleAtSubmitMinutes: view.totals.overtimeEligibleMinutes,
        state: "requested_pending",
        // Submission metadata only — never an input to the calculation.
        submittedAt: new Date().toISOString(),
        submittedBy: EMPLOYEE.name,
      };
      setOtClaims((cs) => [...cs.filter((c) => c.shiftId !== shiftId), claim]);
      return v;
    },
    [dayViews]
  );

  // registered devices
  const [devices, setDevices] = useState<Device[]>(DEVICES);
  const removeDevice = useCallback((id: string) => {
    setDevices((d) => d.filter((x) => x.id !== id));
  }, []);

  // ── Job support: blockers, handover notes, attachments ──────────────────
  const [blockers, setBlockers] = useState<Blocker[]>([
    {
      id: "b1",
      jobId: "j3",
      category: "No access",
      note: "Area C is closed for floor maintenance until Saturday 18:00.",
      at: "2026-10-08T16:10:00+01:00",
      status: "Acknowledged",
    },
  ]);
  const reportBlocker = useCallback((jobId: string, category: string, note: string) => {
    const b: Blocker = {
      id: `b${Date.now()}`,
      jobId,
      category,
      note,
      at: new Date().toISOString(),
      status: "Sent",
    };
    setBlockers((s) => [b, ...s]);
  }, []);

  const [handovers, setHandovers] = useState<Record<string, Handover>>({});
  const saveHandover = useCallback((jobId: string, note: string, state: Handover["state"]) => {
    setHandovers((h) => ({ ...h, [jobId]: { jobId, note, state, at: new Date().toISOString() } }));
  }, []);

  const [attachments, setAttachments] = useState<Attachment[]>([
    {
      id: "a1",
      jobId: "j5",
      name: "audit-summary-signed.pdf",
      kind: "document",
      size: "412 KB",
      at: "2026-10-07T11:32:00+01:00",
    },
  ]);
  const addAttachment = useCallback((jobId: string, file: File) => {
    const isPhoto = file.type.startsWith("image/");
    const item: Attachment = {
      id: `a${Date.now()}`,
      jobId,
      name: file.name,
      kind: isPhoto ? "photo" : "document",
      url: isPhoto ? URL.createObjectURL(file) : undefined,
      size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      at: new Date().toISOString(),
    };
    setAttachments((s) => [...s, item]);
  }, []);

  // ── Structured help requests: worker → manager, never a group chat ──────
  const [helpRequests, setHelpRequests] = useState<HelpRequest[]>([
    {
      id: "h1",
      about: "Equipment Delivery · Fri 9 Oct",
      subject: "Loading bay access code",
      message: "David mentioned the code changed — where do I collect the new one?",
      at: "2026-10-08T09:15:00+01:00",
      status: "Answered",
      answer: "It's in the shift lead office, pinned to the board. Ask for David if it's not there.",
      answeredBy: "Sarah Chen",
    },
  ]);
  const askForHelp = useCallback((about: string, subject: string, message: string) => {
    setHelpRequests((s) => [
      { id: `h${Date.now()}`, about, subject, message, at: new Date().toISOString(), status: "Sent" },
      ...s,
    ]);
  }, []);

  // ── Accessibility ───────────────────────────────────────────────────────
  const [textScale, setTextScale] = useState(1);
  const [reduceMotion, setReduceMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );

  // ── Missing punches, derived from the calculation layer ─────────────────
  const missingPunches = useMemo(
    () => dayViews.filter((d) => !d.totals.clockIn || !d.totals.clockOut),
    [dayViews]
  );

  // toast
  const [toastItem, setToastItem] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);
  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = Date.now();
    setToastItem({ id, text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastItem(null), 2600);
  }, []);

  // connectivity
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // flush anything saved on the phone once a connection returns
  useEffect(() => {
    if (!online) return;
    const queued = att.timeline.filter((e) => e.sync === "unsynced");
    if (queued.length === 0) return;
    const t = window.setTimeout(() => {
      setAtt((a) => ({
        ...a,
        pendingSync: false,
        timeline: a.timeline.map((e) => (e.sync === "unsynced" ? { ...e, sync: "confirmed" } : e)),
        liveLog: a.liveLog.map((e) => (e.sync === "unsynced" ? { ...e, sync: "confirmed" } : e)),
      }));
      toast(`Synced ${queued.length} saved action${queued.length > 1 ? "s" : ""}`);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [online]); // eslint-disable-line

  const markAllMsgsRead = useCallback(() => {
    setReadMsgs(MESSAGES_ALL.map((m) => m.id));
  }, []);

  const signOut = useCallback(() => {
    void backend.signOut().catch((error) => window.alert(error instanceof Error ? error.message : "Sign out failed"));
    setStack([]);
    setClosing(null);
    setTab("today");
    setPhase("welcome");
  }, []);

  const value = useMemo<AppCtx>(
    () => ({
      phase, setPhase, signOut,
      tab, setTab, stack, closing, push, pop, popAll, goTab,
      appearance, setAppearance, isDark,
      att, clockIn, syncNow, dismissReminder, triggerLunchReminder,
      triggerSiteExitAlert, siteCheckState,
      startLunch, endLunch,
      startAway, endAway, startJobAtt, returnFromJob, clockOut, workedMs,
      jobState, toggleTask, setJobStatus,
      readMsgs, markMsgRead, markAllMsgsRead, ackedNotices, ackNotice,
      readNotifs, markNotifRead, markAllNotifs,
      requests, addRequest,
      submittedTs, submitTimesheet, dayViews, liveShiftRecord, otClaims,
      requestOvertimeForShift,
      devices, removeDevice,
      syncLog, lastSyncedAt,
      blockers, reportBlocker, handovers, saveHandover,
      attachments, addAttachment, helpRequests, askForHelp,
      textScale, setTextScale, reduceMotion, setReduceMotion, missingPunches,
      prefs, setPref,
      toastItem, toast, online,
    }),
    [
      phase, tab, stack, closing, appearance, isDark, att, jobState,
      readMsgs, ackedNotices, readNotifs, requests, prefs, toastItem, online,
      submittedTs, otClaims, dayViews, liveShiftRecord, devices, siteCheckState,
      syncLog, lastSyncedAt, blockers, reportBlocker, handovers, saveHandover,
      attachments, addAttachment, helpRequests, askForHelp,
      textScale, setTextScale, reduceMotion, setReduceMotion, missingPunches,
      push, pop, popAll, goTab, signOut, clockIn, syncNow, dismissReminder,
      triggerLunchReminder, triggerSiteExitAlert,
      startLunch, endLunch, startAway, endAway, startJobAtt, returnFromJob,
      clockOut, workedMs, toggleTask, setJobStatus, markMsgRead,
      markAllMsgsRead, ackNotice, markNotifRead, markAllNotifs, addRequest,
      submitTimesheet, requestOvertimeForShift, removeDevice, setPref, toast,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
