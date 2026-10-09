// Pure attendance rules. In a live build these run on the server; the demo runs them locally.
// All durations are integer minutes; timestamps are epoch milliseconds.

import type { AttendanceState, AttendanceEvent, EventType } from "../../shared/attendance";
export type {
  AttendanceState,
  AttendanceEvent,
  EventType,
  SyncStatus,
} from "../../shared/attendance";

export const STATE_LABEL: Record<AttendanceState, string> = {
  not_clocked_in: "Not clocked in",
  working: "Working at site",
  on_lunch: "On lunch",
  on_job: "On assigned job",
  on_personal: "On personal departure",
  clocked_out: "Clocked out",
};

const TRANSITIONS: Record<EventType, { from: AttendanceState[]; to: AttendanceState }> = {
  clock_in: { from: ["not_clocked_in"], to: "working" },
  start_lunch: { from: ["working"], to: "on_lunch" },
  end_lunch: { from: ["on_lunch"], to: "working" },
  start_job: { from: ["working"], to: "on_job" },
  end_job: { from: ["on_job"], to: "working" },
  start_personal: { from: ["working"], to: "on_personal" },
  end_personal: { from: ["on_personal"], to: "working" },
  clock_out: { from: ["working", "on_job"], to: "clocked_out" },
};

export function canTransition(state: AttendanceState, type: EventType) {
  return TRANSITIONS[type].from.includes(state);
}

export function deriveState(events: AttendanceEvent[]): AttendanceState {
  let s: AttendanceState = "not_clocked_in";
  for (const e of sorted(events)) if (canTransition(s, e.type)) s = TRANSITIONS[e.type].to;
  return s;
}

export type ApplyResult =
  { ok: true; events: AttendanceEvent[]; duplicate: boolean } | { ok: false; reason: string };

/** Idempotent append: same id twice is a no-op; invalid transitions are rejected. */
export function applyEvent(events: AttendanceEvent[], ev: AttendanceEvent): ApplyResult {
  if (events.some((e) => e.id === ev.id)) return { ok: true, events, duplicate: true };
  const state = deriveState(events);
  if (!canTransition(state, ev.type))
    return {
      ok: false,
      reason: `Can't ${ev.type.replace("_", " ")} while ${STATE_LABEL[state].toLowerCase()}`,
    };
  const last = sorted(events).at(-1);
  if (last && ev.capturedAt < last.capturedAt)
    return { ok: true, events: [...events, { ...ev, sync: "needs_review" }], duplicate: false };
  return { ok: true, events: [...events, ev], duplicate: false };
}

function sorted(events: AttendanceEvent[]) {
  return [...events].sort((a, b) => a.capturedAt - b.capturedAt);
}

export interface BreakPolicy {
  version: number;
  lunchPaid: boolean;
  dailyRegularMinutes: number;
}

export interface DayTotals {
  workedMinutes: number; // paid time incl. jobs
  lunchMinutes: number;
  personalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  missingClockOut: boolean;
  steps: string[];
}

const mins = (a: number, b: number) => Math.round((b - a) / 60000);

/** Computes totals from recorded intervals. Overtime only counts if approved. */
export function computeDay(
  events: AttendanceEvent[],
  policy: BreakPolicy,
  approvedOvertimeMinutes = 0,
): DayTotals {
  const ev = sorted(events);
  const steps: string[] = [];
  let lunch = 0,
    personal = 0,
    span = 0;
  const inE = ev.find((e) => e.type === "clock_in");
  const outE = ev.find((e) => e.type === "clock_out");
  if (inE && outE) {
    span = mins(inE.capturedAt, outE.capturedAt);
    steps.push(`Clock in → clock out: ${fmtMin(span)}`);
  }
  const pair = (s: EventType, e: EventType) => {
    let total = 0;
    let open: number | null = null;
    for (const x of ev) {
      if (x.type === s) open = x.capturedAt;
      if (x.type === e && open !== null) {
        total += mins(open, x.capturedAt);
        open = null;
      }
    }
    return total;
  };
  lunch = pair("start_lunch", "end_lunch");
  personal = pair("start_personal", "end_personal");
  if (lunch)
    steps.push(
      `Lunch ${fmtMin(lunch)} (${policy.lunchPaid ? "paid" : "unpaid"}, policy v${policy.version})`,
    );
  if (personal) steps.push(`Personal departure ${fmtMin(personal)} (unpaid)`);
  const worked = Math.max(0, span - (policy.lunchPaid ? 0 : lunch) - personal);
  const regular = Math.min(worked, policy.dailyRegularMinutes);
  const extra = worked - regular;
  const ot = Math.min(extra, approvedOvertimeMinutes);
  if (span)
    steps.push(`Regular capped at ${fmtMin(policy.dailyRegularMinutes)} → ${fmtMin(regular)}`);
  if (extra) steps.push(`Beyond regular ${fmtMin(extra)}; approved overtime ${fmtMin(ot)}`);
  return {
    workedMinutes: regular + ot,
    lunchMinutes: lunch,
    personalMinutes: personal,
    regularMinutes: regular,
    overtimeMinutes: ot,
    missingClockOut: !!inE && !outE,
    steps,
  };
}

export function fmtMin(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, "0")}m`;
}

/** Location may be collected only inside the authorised window, ended by the earliest stop. */
export function trackingAllowed(opts: {
  now: number;
  state: AttendanceState;
  windowStart: number;
  windowEnd: number;
  approvedExtensionEnd?: number;
  terminatedAt?: number;
}) {
  const { now, state } = opts;
  if (state === "not_clocked_in" || state === "clocked_out") return false;
  if (state === "on_lunch" || state === "on_personal") return false;
  const end = Math.min(
    opts.approvedExtensionEnd ?? opts.windowEnd,
    opts.terminatedAt ?? Number.POSITIVE_INFINITY,
  );
  return now >= opts.windowStart && now < end;
}

export interface PayrollRow {
  employeeNo: string;
  name: string;
  date: string;
  regularMinutes: number;
  overtimeMinutes: number;
  status: string;
}

export function toCsv(rows: PayrollRow[]) {
  const head = "employee_no,name,date,regular_hours,overtime_hours,status";
  const h = (m: number) =>
    `${Math.floor(m / 60)}.${String(Math.round(((m % 60) * 100) / 60)).padStart(2, "0")}`;
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [
    head,
    ...rows.map((r) =>
      [r.employeeNo, esc(r.name), r.date, h(r.regularMinutes), h(r.overtimeMinutes), r.status].join(
        ",",
      ),
    ),
  ].join("\n");
}
