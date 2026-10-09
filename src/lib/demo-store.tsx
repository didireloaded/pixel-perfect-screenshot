import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  applyEvent,
  computeDay,
  deriveState,
  type AttendanceEvent,
  type AttendanceState,
  type BreakPolicy,
  type EventType,
} from "./attendance";

// DEMO MODE: all data is fictional and stored in this browser only.
// Location checks, approvals and payroll here are simulated, not live.

export type LocationStatus = "inactive" | "active" | "paused" | "unavailable";
export type RequestStatus = "pending" | "approved" | "declined";
export type RequestKind = "leave" | "personal_departure" | "missing_clocking" | "correction" | "emergency";

export interface Employee { id: string; no: string; name: string; team: string; siteId: string; role: string }
export interface Site { id: string; name: string; address: string }
export interface Shift { start: string; end: string; lunch: string; lunchMinutes: number; trackingStop: string; siteId: string }
export interface Job {
  id: string; title: string; instructions: string; date: string; start: string; end: string;
  destination: string; supervisor: string; status: "assigned" | "in_progress" | "completed"; assignee: string;
}
export interface Req {
  id: string; employeeId: string; kind: RequestKind; summary: string; detail?: string; submittedAt: number;
  status: RequestStatus; reviewer?: string; reason?: string; approvalRequired: boolean; expectedReturn?: string | undefined;
}
export interface Notice {
  id: string; kind: "holiday" | "maintenance" | "emergency" | "shift_change"; title: string; body: string;
  date: string; target: string; attendance: string; paid: string; requiresAck: boolean; acked: boolean;
}
export interface Audit { id: string; at: number; actor: string; action: string; detail: string }
export interface Timesheet { employeeId: string; date: string; status: "open" | "submitted" | "approved"; overtimeRequested: number; overtimeApproved: number; overtimeStatus: "none" | "pending" | "approved" | "declined" }
export interface Exception { id: string; employeeId: string; kind: string; detail: string; resolved: boolean }

interface Data {
  me: string;
  employees: Employee[];
  sites: Site[];
  shift: Shift;
  policy: BreakPolicy;
  events: AttendanceEvent[];
  jobs: Job[];
  requests: Req[];
  notices: Notice[];
  audit: Audit[];
  timesheets: Timesheet[];
  exceptions: Exception[];
  location: LocationStatus;
  online: boolean;
  periodLocked: boolean;
}

const KEY = "shiftline-demo-v1";
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const at = (hhmm: string, base = new Date()) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

function seed(): Data {
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86400000);
  const y = yesterday.toISOString().slice(0, 10);
  const employees: Employee[] = [
    { id: "e1", no: "1042", name: "Maya Kandjii", team: "Field Services", siteId: "s1", role: "Technician" },
    { id: "e2", no: "1057", name: "Daniel Shipanga", team: "Field Services", siteId: "s1", role: "Technician" },
    { id: "e3", no: "1063", name: "Rosa Amutenya", team: "Warehouse", siteId: "s2", role: "Stock controller" },
    { id: "e4", no: "1071", name: "Peter Nghifindaka", team: "Warehouse", siteId: "s2", role: "Driver" },
  ];
  const ev = (eid: string, type: EventType, hhmm: string, base = new Date()): AttendanceEvent => ({
    id: uid(), employeeId: eid, type, capturedAt: at(hhmm, base), receivedAt: at(hhmm, base), sync: "synced",
  });
  return {
    me: "e1",
    employees,
    sites: [
      { id: "s1", name: "North Yard", address: "14 Industrial Rd" },
      { id: "s2", name: "Central Warehouse", address: "3 Depot Lane" },
    ],
    shift: { start: "08:00", end: "16:45", lunch: "12:30", lunchMinutes: 45, trackingStop: "17:00", siteId: "s1" },
    policy: { version: 3, lunchPaid: false, dailyRegularMinutes: 480 },
    events: [
      ev("e1", "clock_in", "07:56", yesterday), ev("e1", "start_lunch", "12:31", yesterday),
      ev("e1", "end_lunch", "13:14", yesterday), ev("e1", "clock_out", "16:52", yesterday),
      ev("e2", "clock_in", "07:58"), ev("e3", "clock_in", "08:04"), ev("e3", "start_lunch", "12:02"),
      ev("e4", "clock_in", "07:45", yesterday),
    ],
    jobs: [
      { id: "j1", title: "Pump inspection", instructions: "Check pressure valves on units 2 and 4. Photograph seals before replacing.", date: today, start: "14:00", end: "15:30", destination: "Riverside Plant, Gate B", supervisor: "Anna Haufiku", status: "assigned", assignee: "e1" },
      { id: "j2", title: "Generator service", instructions: "Quarterly service. Log hours meter reading.", date: today, start: "10:00", end: "11:00", destination: "North Yard, Bay 3", supervisor: "Anna Haufiku", status: "assigned", assignee: "e1" },
      { id: "j3", title: "Delivery handover", instructions: "Collect signed delivery note.", date: y, start: "09:00", end: "10:00", destination: "Central Warehouse", supervisor: "Field team", status: "completed", assignee: "e1" },
    ],
    requests: [
      { id: "r1", employeeId: "e1", kind: "leave", summary: "Annual leave · 2 days", detail: "Family visit", submittedAt: Date.now() - 3 * 86400000, status: "approved", reviewer: "Anna Haufiku", reason: "Cover arranged", approvalRequired: true },
      { id: "r2", employeeId: "e1", kind: "correction", summary: `Correct clock-out ${y}`, detail: "Left at 16:52, recorded correctly — changed lunch end to 13:10", submittedAt: Date.now() - 86400000, status: "declined", reviewer: "Anna Haufiku", reason: "Recorded time matches site entry log", approvalRequired: true },
      { id: "r3", employeeId: "e3", kind: "correction", summary: "Missed clock-in yesterday", detail: "Phone battery died, arrived 08:00", submittedAt: Date.now() - 7200000, status: "pending", approvalRequired: true },
    ],
    notices: [
      { id: "n1", kind: "maintenance", title: "North Yard power shutdown", body: "Planned electrical maintenance. Report to Central Warehouse instead.", date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), target: "Site · North Yard", attendance: "Attend at Central Warehouse", paid: "Normal paid time", requiresAck: true, acked: false },
    ],
    audit: [],
    timesheets: [
      { employeeId: "e1", date: y, status: "submitted", overtimeRequested: 0, overtimeApproved: 0, overtimeStatus: "none" },
      { employeeId: "e4", date: y, status: "open", overtimeRequested: 0, overtimeApproved: 0, overtimeStatus: "none" },
    ],
    exceptions: [
      { id: "x1", employeeId: "e4", kind: "Missing clock-out", detail: `${y}: clocked in 07:45, no clock-out recorded. Tracking stopped at 17:00.`, resolved: false },
      { id: "x2", employeeId: "e2", kind: "Location unavailable", detail: "No location update for 40 min. Not treated as a departure.", resolved: false },
    ],
    location: "inactive",
    online: true,
    periodLocked: false,
  };
}

interface Ctx extends Data {
  ready: boolean;
  myEvents: AttendanceEvent[];
  todayEvents: (eid: string) => AttendanceEvent[];
  state: AttendanceState;
  act: (type: EventType, extra?: Partial<AttendanceEvent>) => boolean;
  update: (fn: (d: Data) => Data) => void;
  log: (actor: string, action: string, detail: string) => void;
  dayTotals: (eid: string, date: string) => ReturnType<typeof computeDay>;
  reset: () => void;
}

const C = createContext<Ctx | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setData(raw ? JSON.parse(raw) : seed());
    } catch {
      setData(seed());
    }
  }, []);
  useEffect(() => {
    if (data) localStorage.setItem(KEY, JSON.stringify(data));
  }, [data]);

  const update = useCallback((fn: (d: Data) => Data) => setData((d) => (d ? fn(d) : d)), []);
  const log = useCallback(
    (actor: string, action: string, detail: string) =>
      update((d) => ({ ...d, audit: [{ id: uid(), at: Date.now(), actor, action, detail }, ...d.audit] })),
    [update],
  );

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const today = todayISO();
    const todayEvents = (eid: string) =>
      data.events.filter((e) => e.employeeId === eid && new Date(e.capturedAt).toISOString().slice(0, 10) === today);
    const myEvents = todayEvents(data.me);
    const state = deriveState(myEvents);
    const act: Ctx["act"] = (type, extra) => {
      const ev: AttendanceEvent = {
        id: uid(), employeeId: data.me, type, capturedAt: Date.now(),
        sync: data.online ? "synced" : "waiting_to_sync",
        receivedAt: data.online ? Date.now() : undefined, ...extra,
      };
      const r = applyEvent(myEvents, ev);
      if (!r.ok) { toast.error(r.reason); return false; }
      if (r.duplicate) return true;
      const next = r.events.at(-1)!;
      const loc: LocationStatus =
        type === "clock_out" ? "inactive" : type === "start_lunch" || type === "start_personal" ? "paused" : "active";
      setData({ ...data, events: [...data.events, next], location: loc });
      toast.success(data.online ? "Synced" : "Saved on this phone · waiting to sync");
      return true;
    };
    const dayTotals = (eid: string, date: string) => {
      const evs = data.events.filter((e) => e.employeeId === eid && new Date(e.capturedAt).toISOString().slice(0, 10) === date);
      const ts = data.timesheets.find((t) => t.employeeId === eid && t.date === date);
      return computeDay(evs, data.policy, ts?.overtimeApproved ?? 0);
    };
    return { ...data, ready: true, myEvents, todayEvents, state, act, update, log, dayTotals, reset: () => setData(seed()) };
  }, [data, update, log]);

  if (!value)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground" role="status">
        Loading…
      </div>
    );
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useDemo() {
  const v = useContext(C);
  if (!v) throw new Error("useDemo outside provider");
  return v;
}

export const fmtTime = (t?: number) =>
  t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
export { uid };
