import { activeJobForShift } from "../../shared/active-job";
import { watchWorkPosition } from "../../shared/watch-work-position";
// Attendance writes and totals belong to the PostgreSQL API.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  deriveState,
  type AttendanceEvent,
  type EventType,
  type AttendanceState,
} from "./attendance";
import * as api from "./backend";
import { AccountScreen, PasswordRecovery } from "@/components/app/AccountScreen";
import type {
  AttendanceSnapshot as Snapshot,
  Employee,
  Site,
  Totals,
  Shift,
  Job,
  Req,
  Timesheet,
  Period,
  LocationStatus,
} from "../../shared/attendance";
export type {
  Employee,
  Site,
  Totals,
  Shift,
  Job,
  Req,
  Timesheet,
  Period,
  LocationStatus,
} from "../../shared/attendance";
export interface CommandResult {
  snapshot: Snapshot;
  activationCode?: string;
  kioskCode?: string;
  employeeNumber?: string;
  employeeId?: string;
  status?: string;
  conflictId?: string;
  rows?: Record<string, string | number>[];
}
interface Ctx extends Snapshot {
  ready: boolean;
  busy: boolean;
  online: boolean;
  location: LocationStatus;
  locationMonitoringEnabled: boolean;
  setLocationMonitoringEnabled: (enabled: boolean) => void;
  state: AttendanceState;
  shift: Shift;
  hasShift: boolean;
  myEvents: AttendanceEvent[];
  periodLocked: boolean;
  todayEvents: (id: string) => AttendanceEvent[];
  dayTotals: (id: string, date: string) => Totals;
  act: (type: EventType, extra?: Record<string, unknown>) => Promise<boolean>;
  command: (action: string, data: Record<string, unknown>) => Promise<CommandResult | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
export const uid = () => crypto.randomUUID();
export const todayISO = () => new Date().toLocaleDateString("en-CA");
export const at = (hhmm: string, base = new Date(), timezone?: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  if (!timezone) {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
  const intended = Date.parse(`${date}T${hhmm}:00Z`);
  let candidate = intended;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const part = (name: string) => parts.find((p) => p.type === name)!.value;
    const represented = Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
    candidate += intended - represented;
  }
  return candidate;
};
export const fmtTime = (t?: number, timezone?: string) =>
  t
    ? new Date(t).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        ...(timezone ? { timeZone: timezone } : {}),
      })
    : "—";
const EMPTY: Totals = {
  recordedSeconds: 0,
  regularSeconds: 0,
  overtimeSecondsApproved: 0,
  overtimeSecondsPending: 0,
  paidBreakSeconds: 0,
  unpaidBreakSeconds: 0,
  personalSeconds: 0,
  payableSeconds: 0,
  policyVersion: 1,
  workedMinutes: 0,
  recordedMinutes: 0,
  regularMinutes: 0,
  overtimeMinutes: 0,
  unapprovedOvertimeMinutes: 0,
  lunchMinutes: 0,
  personalMinutes: 0,
  missingClockOut: false,
  complete: false,
};
const C = createContext<Ctx | null>(null);
export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [signed, setSigned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [visible, setVisible] = useState(true);
  const [location, setLocation] = useState<LocationStatus>("inactive");
  const [locationMonitoringEnabled, setMonitoringEnabled] = useState(false);
  const lock = useRef(false);
  const revision = useRef(0);
  const identity = useRef<string | null>(null);
  const authRevision = useRef(0);
  const refresh = useCallback(async () => {
    if (lock.current) return;
    const token = ++revision.current;
    try {
      const auth = await api.authenticated();
      if (token !== revision.current) return;
      setSigned(auth);
      if (auth) {
        const s = await api.snapshot<Snapshot>();
        if (token === revision.current) setData(s.onboarding ? null : s);
      } else setData(null);
      setError("");
    } catch (e) {
      if (token === revision.current)
        setError(e instanceof Error ? e.message : "Server unavailable");
    } finally {
      if (token === revision.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = api.onAuthChange((event, userId) => {
      if (userId !== identity.current) {
        identity.current = userId;
        ++authRevision.current;
        ++revision.current;
        setData(null);
        setSigned(Boolean(userId));
        if (userId) setLoading(true);
      }
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (!userId) {
        ++authRevision.current;
        ++revision.current;
        setData(null);
        setSigned(false);
        setLoading(false);
        setRecovering(false);
        return;
      }
      clearTimeout(deferred);
      deferred = setTimeout(() => void refresh(), 0);
    });
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      clearTimeout(deferred);
      unsubscribe();
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, [refresh]);
  useEffect(() => {
    if (!data?.company?.id) return;
    return api.watch(data.company.id, refresh);
  }, [data?.company?.id, refresh]);
  const command = async (action: string, payload: Record<string, unknown>) => {
    if (lock.current || !navigator.onLine) {
      if (!navigator.onLine) toast.error("Reconnect to save this action");
      return null;
    }
    const authToken = authRevision.current;
    lock.current = true;
    ++revision.current;
    setBusy(true);
    try {
      const result = await api.command<CommandResult>(action, payload);
      if (authToken !== authRevision.current) return null;
      setData(result.snapshot);
      setError("");
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save. Try again.");
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
      if (authToken !== authRevision.current) void refresh();
    }
  };
  const logout = async () => {
    try {
      await api.signOut();
      ++revision.current;
      setData(null);
      setSigned(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sign out");
    }
  };
  const monitoringKey = data ? `shiftline-site-monitor:${data.company.id}:${data.me}` : "";
  useEffect(() => {
    setMonitoringEnabled(monitoringKey ? localStorage.getItem(monitoringKey) === "on" : false);
  }, [monitoringKey]);
  const setLocationMonitoringEnabled = (enabled: boolean) => {
    if (monitoringKey) localStorage.setItem(monitoringKey, enabled ? "on" : "off");
    setMonitoringEnabled(enabled);
  };
  const activeShift = data?.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
  const activeSite = data?.sites.find((s) => s.id === activeShift?.siteId);
  const activeState = data?.states.find((s) => s.shiftId === activeShift?.id)?.state;
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const activeJob = data ? activeJobForShift(data.events, data.jobs, activeShift?.id) : undefined;
  const positionShiftId = activeShift?.id,
    positionDate = activeShift?.date,
    positionStart = activeShift?.start,
    positionStop = activeShift?.trackingStop,
    positionTimezone = data?.company.timezone;
  const targetLatitude = activeState === "on_job" ? activeJob?.latitude : activeSite?.latitude;
  const targetLongitude = activeState === "on_job" ? activeJob?.longitude : activeSite?.longitude;
  useEffect(() => {
    if (
      !positionShiftId ||
      !positionDate ||
      !positionStart ||
      !positionStop ||
      !positionTimezone ||
      !online ||
      !visible ||
      !locationMonitoringEnabled ||
      targetLatitude == null ||
      targetLongitude == null ||
      !navigator.geolocation
    ) {
      setLocation("inactive");
      return;
    }
    if (!activeState || !["working", "on_job"].includes(activeState)) {
      setLocation("paused");
      return;
    }
    return watchWorkPosition(
      { id: positionShiftId, date: positionDate, start: positionStart, trackingStop: positionStop },
      positionTimezone,
      async (action, payload) => {
        const result = await api.command<CommandResult>(action, payload);
        if (action === "report_position") setLocation("active");
        if (result.status === "exit")
          toast.warning("You left the assigned work location. Your manager has been alerted.");
        return result;
      },
      (message) => {
        setLocation("unavailable");
        toast.error(message);
      },
    );
  }, [
    positionTimezone,
    positionShiftId,
    positionDate,
    positionStart,
    positionStop,
    targetLatitude,
    targetLongitude,
    activeState,
    online,
    visible,
    locationMonitoringEnabled,
  ]);
  useEffect(() => {
    if (
      !data ||
      !activeShift ||
      activeState !== "working" ||
      data.events.some((e) => e.shiftId === activeShift.id && e.type === "start_lunch")
    )
      return;
    const key = `shiftline-lunch:${activeShift.id}`;
    const remind = () => {
      const time = new Intl.DateTimeFormat("en-GB", {
        timeZone: data.company.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
      if (
        time >= activeShift.lunch &&
        time < activeShift.end &&
        sessionStorage.getItem(key) !== "shown"
      ) {
        sessionStorage.setItem(key, "shown");
        toast.info("It is time for lunch", {
          description: `Your scheduled break is ${activeShift.lunchMinutes} minutes.`,
        });
      }
    };
    remind();
    const timer = window.setInterval(remind, 30000);
    return () => window.clearInterval(timer);
  }, [
    data?.company.timezone,
    activeShift?.id,
    activeShift?.lunch,
    activeShift?.end,
    activeShift?.lunchMinutes,
    activeState,
    data?.events,
  ]);
  if (recovering)
    return (
      <PasswordRecovery
        onComplete={() => {
          setRecovering(false);
          void refresh();
        }}
      />
    );
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center" role="status">
        Connecting…
      </div>
    );
  if (!signed || !data || data.onboarding)
    return (
      <AccountScreen
        signed={signed}
        error={error}
        busy={busy}
        onAuthenticated={refresh}
        command={command}
        logout={logout}
      />
    );
  const shift = data.shifts.find((s) => s.employeeId === data.me && s.date === data.today);
  const todayEvents = (id: string) => {
    const sh = data.shifts.find((s) => s.employeeId === id && s.date === data.today);
    return sh ? data.events.filter((e) => e.shiftId === sh.id) : [];
  };
  const myEvents = todayEvents(data.me);
  const value: Ctx = {
    ...data,
    ready: true,
    busy,
    online,
    location,
    locationMonitoringEnabled,
    setLocationMonitoringEnabled,
    shift: shift || {
      id: "",
      employeeId: data.me,
      date: data.today,
      start: "08:00",
      end: "17:00",
      lunch: "12:00",
      lunchMinutes: 60,
      trackingStop: "17:00",
      siteId: data.employees.find((e) => e.id === data.me)!.siteId,
      regularMinutes: 480,
      totals: EMPTY,
    },
    hasShift: !!shift,
    myEvents,
    state: data.states.find((s) => s.shiftId === shift?.id)?.state || "not_clocked_in",
    todayEvents,
    dayTotals: (id, date) =>
      data.shifts.find((s) => s.employeeId === id && s.date === date)?.totals || EMPTY,
    act: async (type, extra = {}) => {
      const result = await command("transition", { id: uid(), type, ...extra });
      if (result)
        toast.success(
          result.status === "needs_review" ? "Saved for manager review" : "Attendance saved",
        );
      return !!result;
    },
    command,
    logout,
    refresh,
    periodLocked: data.periods.some((p) => data.today >= p.start && data.today <= p.end),
  };
  return (
    <C.Provider value={value}>
      {error && (
        <p role="alert" className="bg-tint-cream p-3 text-center text-sm">
          Connection interrupted. Showing the last saved records.
        </p>
      )}
      {children}
    </C.Provider>
  );
}
export function useAttendance() {
  const value = useContext(C);
  if (!value) throw new Error("Attendance provider missing");
  return value;
}
