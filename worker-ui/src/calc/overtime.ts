/**
 * Shiftline — overtime calculation layer.
 *
 * DESIGN CONTRACT
 * ---------------
 * Every function here is pure: it derives numbers from a *recorded attendance
 * event log* plus a *shift policy*. Nothing reads the device clock, nothing
 * reads UI state, nothing mutates its inputs.
 *
 * That is deliberate. In production this module is intended to run on the
 * backend, which returns `ShiftTotals` as the authoritative result; the phone
 * renders it. Because the derivation is pure and clock-free, the same code can
 * be executed server-side and unit-tested here without a device.
 *
 * The live in-progress shift on the Today screen is a *provisional estimate*
 * built from unconfirmed events and is always flagged as such. It is never
 * treated as authoritative and can never be submitted for overtime.
 *
 * All timestamps are ISO-8601 in UTC. `ShiftPolicy.timezone` is display-only,
 * so overnight shifts and timezone boundaries are handled by UTC arithmetic
 * rather than by local-date guesswork.
 */

export const MINUTE_MS = 60_000;

// ─── Events ────────────────────────────────────────────────────────────────

export type EventType =
  | "clock_in"
  | "clock_out"
  | "lunch_start"
  | "lunch_end"
  | "departure_start"
  | "departure_end"
  | "job_start"
  | "job_end";

/** Where the event came from. `correction` events are manager/worker amendments. */
export type EventSource = "device" | "kiosk" | "correction" | "import";

/**
 * `superseded` events are excluded from the maths but retained in the log so
 * the audit history is never rewritten.
 */
export type EventSync = "confirmed" | "pending" | "unsynced" | "superseded";

export type DepartureKind = "personal" | "emergency";

export interface AttendanceEvent {
  id: string;
  type: EventType;
  /** ISO-8601 UTC */
  at: string;
  source: EventSource;
  sync: EventSync;
  /** For departures: why the worker left. Drives paid vs unpaid. */
  departureKind?: DepartureKind;
  /** Free-text note captured with the event (e.g. "emergency — family"). */
  note?: string;
  /** Job this departure belongs to, for job_start/job_end. */
  jobId?: string;
  jobTitle?: string;
  /** Id of the event this one replaces, when source === "correction". */
  corrects?: string;
  /** Audit: when the record was written, and by whom. */
  recordedAt: string;
  actor: string;
}

// ─── Policy ────────────────────────────────────────────────────────────────

export interface ShiftPolicy {
  id: string;
  /** Local work date, "2026-10-09". Display/grouping only — never used for maths. */
  workdate: string;
  /** ISO-8601 UTC */
  scheduledStart: string;
  /** ISO-8601 UTC. May fall on the following day for overnight shifts. */
  scheduledEnd: string;
  /** Worked minutes beyond which time becomes overtime. Usually the scheduled length. */
  overtimeAfterMinutes: number;
  /** Overtime shorter than this is not claimable. */
  overtimeGraceMinutes: number;
  /** Claimable overtime is floored to this unit, so we never over-claim. */
  roundingMinutes: number;
  /** Departure kinds that are unpaid and therefore deducted from worked time. */
  unpaidDepartureKinds: DepartureKind[];
  /** Whether lunch is unpaid. */
  lunchUnpaid: boolean;
  /** Assigned-job time is work, so it is paid and NOT deducted. */
  jobTimePaid: boolean;
  /** A clock-out this far after scheduledEnd is flagged for review. */
  clockOutCutoffMinutes: number;
  /** Repeats of the same event type inside this window are treated as duplicates. */
  duplicateWindowSeconds: number;
  /** Display-only. */
  timezone: string;
}

// ─── Timesheet + approval ──────────────────────────────────────────────────

export type TimesheetStatus =
  | "Open"
  | "Submitted"
  | "Awaiting review"
  | "Approved"
  | "Locked";

export type ApprovalState = "none" | "requested_pending" | "approved" | "declined";

export interface OvertimeDecision {
  /** May be lower than the requested amount — a manager can approve in part. */
  approvedMinutes: number;
  reason?: string;
  decidedBy: string;
  /** ISO-8601 UTC */
  decidedAt: string;
}

export interface OvertimeClaim {
  id: string;
  shiftId: string;
  requestedMinutes: number;
  /** What the calculation supported when the worker submitted. Frozen for audit. */
  eligibleAtSubmitMinutes: number;
  state: ApprovalState;
  /** ISO-8601 UTC */
  submittedAt: string;
  submittedBy: string;
  decision?: OvertimeDecision;
}

export interface ShiftRecord {
  id: string;
  /** "Fri 9 Oct" — display label. */
  label: string;
  workdate: string;
  site: string;
  policy: ShiftPolicy;
  /** The preserved original log, including superseded and duplicate events. */
  events: AttendanceEvent[];
  timesheetStatus: TimesheetStatus;
  claim?: OvertimeClaim;
}

/** Provenance of the numbers being displayed. Surfaced in the UI. */
export type TotalsSource = "backend" | "derived-on-device";

// ─── Results ───────────────────────────────────────────────────────────────

export type IssueCode =
  | "missing_clock_in"
  | "missing_clock_out"
  | "event_syncing"
  | "correction_in_review"
  | "unresolved_interval"
  | "orphan_interval_end"
  | "duplicate_event"
  | "superseded_event"
  | "beyond_cutoff"
  | "overnight_shift"
  | "negative_interval";

export type IssueSeverity = "provisional" | "review" | "info";

export interface CalcIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
}

export interface Interval {
  kind: "lunch" | DepartureKind | "job";
  /** ISO-8601 UTC */
  start: string;
  end: string | null;
  minutes: number;
  resolved: boolean;
  /** Whether the policy deducts this from worked time. */
  unpaid: boolean;
  label: string;
  eventIds: string[];
}

export interface ShiftTotals {
  scheduledMinutes: number;
  /** clock_out − clock_in, before any deduction. */
  clockedMinutes: number;
  /** Sum of resolved unpaid intervals. */
  unpaidMinutes: number;
  /** clockedMinutes − unpaidMinutes. Job time stays inside this figure. */
  workedMinutes: number;
  regularMinutes: number;
  /** Overtime supported by recorded time and policy, after grace and rounding. */
  overtimeEligibleMinutes: number;
  /** Paid time spent on assigned jobs, already included in workedMinutes. */
  jobMinutes: number;
  clockIn: string | null;
  clockOut: string | null;
  unpaidIntervals: Interval[];
  jobIntervals: Interval[];
  /** Event ids excluded from the maths (duplicates, superseded). Still auditable. */
  excludedEventIds: string[];
  /** Events counted, in chronological order — the audit view. */
  countedEvents: AttendanceEvent[];
  issues: CalcIssue[];
  provisional: boolean;
  /** Human-readable derivation, e.g. "Clocked 9h 15m − unpaid 1h 00m = worked 8h 15m". */
  breakdown: string[];
}

// ─── Formatting ────────────────────────────────────────────────────────────

export function fmtMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, "0")}m`;
}

export function fmtClock(iso: string | null, timezone?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(d);
  } catch {
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }
}

export const EVENT_LABEL: Record<EventType, string> = {
  clock_in: "Clock in",
  clock_out: "Clock out",
  lunch_start: "Lunch started",
  lunch_end: "Lunch ended",
  departure_start: "Departure started",
  departure_end: "Departure ended",
  job_start: "Left for job",
  job_end: "Returned from job",
};

const at = (iso: string) => new Date(iso).getTime();
const byTime = (a: AttendanceEvent, b: AttendanceEvent) =>
  at(a.at) - at(b.at) || a.id.localeCompare(b.id);

function floorTo(minutes: number, unit: number): number {
  return unit > 0 ? Math.floor(minutes / unit) * unit : Math.floor(minutes);
}

function minutesBetween(startIso: string, endIso: string): number {
  return (at(endIso) - at(startIso)) / MINUTE_MS;
}

/** UTC calendar day of an instant, whatever offset it was written in. */
function utcDay(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

// ─── Derivation ────────────────────────────────────────────────────────────

interface Paired {
  intervals: { start: AttendanceEvent; end?: AttendanceEvent }[];
  orphanEnds: AttendanceEvent[];
}

function pairIntervals(
  events: AttendanceEvent[],
  startType: EventType,
  endType: EventType
): Paired {
  const starts = events.filter((e) => e.type === startType).sort(byTime);
  const ends = events.filter((e) => e.type === endType).sort(byTime);
  const used = new Set<string>();
  const intervals: { start: AttendanceEvent; end?: AttendanceEvent }[] = [];

  for (const s of starts) {
    const match = ends.find((e) => !used.has(e.id) && at(e.at) > at(s.at));
    if (match) used.add(match.id);
    intervals.push({ start: s, end: match });
  }
  return { intervals, orphanEnds: ends.filter((e) => !used.has(e.id)) };
}

/** Scheduled length, tolerating a window that wraps past midnight. */
export function scheduledMinutesOf(policy: ShiftPolicy): number {
  let m = minutesBetween(policy.scheduledStart, policy.scheduledEnd);
  if (m <= 0) m += 24 * 60; // window crosses midnight
  return m;
}

export function deriveShiftTotals(
  events: readonly AttendanceEvent[],
  policy: ShiftPolicy
): ShiftTotals {
  const issues: CalcIssue[] = [];
  const excludedEventIds: string[] = [];

  // 1. Superseded events leave the maths but stay in the audit log.
  const notSuperseded = events.filter((e) => {
    if (e.sync === "superseded") {
      excludedEventIds.push(e.id);
      issues.push({
        code: "superseded_event",
        severity: "info",
        message: `${EVENT_LABEL[e.type]} at ${fmtClock(e.at, policy.timezone)} was replaced by a correction and is kept for audit only.`,
      });
      return false;
    }
    return true;
  });

  // 2. Duplicates — offline double-submits of the same event type.
  const chronological = [...notSuperseded].sort(byTime);
  const kept: AttendanceEvent[] = [];
  for (const e of chronological) {
    const twin = kept.find(
      (k) =>
        k.type === e.type &&
        Math.abs(at(e.at) - at(k.at)) <= policy.duplicateWindowSeconds * 1000
    );
    if (twin) {
      excludedEventIds.push(e.id);
      issues.push({
        code: "duplicate_event",
        severity: "info",
        message: `Duplicate ${EVENT_LABEL[e.type].toLowerCase()} at ${fmtClock(e.at, policy.timezone)} ignored — an identical event was already recorded ${twin.source === e.source ? "from the same source" : `from ${twin.source}`}.`,
      });
      continue;
    }
    kept.push(e);
  }

  // 3. Anything not yet confirmed makes the result provisional.
  const syncing = kept.filter((e) => e.sync === "pending" || e.sync === "unsynced");
  if (syncing.length > 0) {
    issues.push({
      code: "event_syncing",
      severity: "provisional",
      message:
        syncing.length === 1
          ? `1 recorded action is still syncing — these totals change once it is confirmed.`
          : `${syncing.length} recorded actions are still syncing — these totals change once they are confirmed.`,
    });
  }

  // 4. A correction awaiting a manager decision also makes it provisional.
  const pendingCorrection = kept.find(
    (e) => e.source === "correction" && (e.sync === "pending" || e.sync === "unsynced")
  );
  if (pendingCorrection) {
    issues.push({
      code: "correction_in_review",
      severity: "provisional",
      message: `A correction to the ${EVENT_LABEL[pendingCorrection.type].toLowerCase()} is under review. Totals are provisional until it is decided.`,
    });
  }

  // 5. Clock in / out.
  const clockIn = kept.find((e) => e.type === "clock_in") ?? null;
  const clockOut = kept.find((e) => e.type === "clock_out") ?? null;

  if (!clockIn) {
    issues.push({
      code: "missing_clock_in",
      severity: "provisional",
      message: "No clock-in recorded for this shift, so worked time cannot be established.",
    });
  }
  if (!clockOut) {
    issues.push({
      code: "missing_clock_out",
      severity: "provisional",
      message: "No clock-out recorded yet, so the shift has no end point and worked time is still open.",
    });
  }

  const scheduledMinutes = scheduledMinutesOf(policy);

  // Overnight handling: real UTC instants make midnight crossings arithmetic,
  // not a special case. We only surface it so the worker understands the span.
  if (clockIn && clockOut && utcDay(clockIn.at) !== utcDay(clockOut.at)) {
    issues.push({
      code: "overnight_shift",
      severity: "info",
      message:
        "This shift crosses midnight. Times are shown in the site timezone; the calculation uses absolute UTC instants.",
    });
  }
  if (scheduledMinutes !== minutesBetween(policy.scheduledStart, policy.scheduledEnd)) {
    issues.push({
      code: "overnight_shift",
      severity: "info",
      message: "The scheduled window runs overnight.",
    });
  }

  let clockedMinutes = 0;
  if (clockIn && clockOut) {
    clockedMinutes = minutesBetween(clockIn.at, clockOut.at);
    if (clockedMinutes < 0) {
      clockedMinutes = 0;
      issues.push({
        code: "negative_interval",
        severity: "provisional",
        message: "The recorded clock-out is earlier than the clock-in. Worked time is shown as zero until this is corrected.",
      });
    }
  }

  // 6. Pair intervals: lunch, departures (personal/emergency), jobs.
  const lunch = pairIntervals(kept, "lunch_start", "lunch_end");
  const departures = pairIntervals(kept, "departure_start", "departure_end");
  const jobs = pairIntervals(kept, "job_start", "job_end");

  const buildInterval = (
    p: { start: AttendanceEvent; end?: AttendanceEvent },
    kind: Interval["kind"],
    unpaid: boolean,
    label: string
  ): Interval => {
    const resolved = !!p.end;
    let minutes = 0;
    if (p.end) {
      minutes = minutesBetween(p.start.at, p.end.at);
      if (minutes < 0) {
        minutes = 0;
        issues.push({
          code: "negative_interval",
          severity: "provisional",
          message: `${label} ends before it starts and was not deducted.`,
        });
      }
    } else {
      issues.push({
        code: "unresolved_interval",
        severity: "provisional",
        message: `${label} started at ${fmtClock(p.start.at, policy.timezone)} but has no matching end. It is not deducted, and the total is provisional until a correction resolves it.`,
      });
    }
    return {
      kind,
      start: p.start.at,
      end: p.end?.at ?? null,
      minutes: Math.round(minutes),
      resolved,
      unpaid,
      label,
      eventIds: p.end ? [p.start.id, p.end.id] : [p.start.id],
    };
  };

  const unpaidIntervals: Interval[] = [];

  if (policy.lunchUnpaid) {
    for (const p of lunch.intervals) {
      unpaidIntervals.push(buildInterval(p, "lunch", true, "Lunch break"));
    }
  } else {
    // Paid lunch: still paired, but not deducted. Kept visible for transparency.
    for (const p of lunch.intervals) {
      const iv = buildInterval(p, "lunch", false, "Lunch break (paid)");
      unpaidIntervals.push(iv);
    }
  }

  for (const p of departures.intervals) {
    const kind: DepartureKind = p.start.departureKind ?? "personal";
    const unpaid = policy.unpaidDepartureKinds.includes(kind);
    const label =
      kind === "emergency"
        ? `Emergency departure${p.start.note ? ` · ${p.start.note}` : ""}`
        : `Personal departure${p.start.note ? ` · ${p.start.note}` : ""}`;
    unpaidIntervals.push(buildInterval(p, kind, unpaid, label));
  }

  const jobIntervals: Interval[] = jobs.intervals.map((p) =>
    buildInterval(
      p,
      "job",
      !policy.jobTimePaid,
      p.start.jobTitle ? `Job · ${p.start.jobTitle}` : "Assigned job"
    )
  );

  for (const orphan of [...lunch.orphanEnds, ...departures.orphanEnds, ...jobs.orphanEnds]) {
    issues.push({
      code: "orphan_interval_end",
      severity: "provisional",
      message: `${EVENT_LABEL[orphan.type]} at ${fmtClock(orphan.at, policy.timezone)} has no matching start and was ignored.`,
    });
  }

  // 7. Totals. Unpaid intervals are deducted; paid job time is not.
  const unpaidMinutes = unpaidIntervals
    .filter((i) => i.unpaid && i.resolved)
    .reduce((sum, i) => sum + i.minutes, 0);

  const jobMinutes = jobIntervals
    .filter((i) => i.resolved && policy.jobTimePaid)
    .reduce((sum, i) => sum + i.minutes, 0);

  const workedMinutes = Math.max(0, Math.round(clockedMinutes) - unpaidMinutes);
  const regularMinutes = Math.min(workedMinutes, policy.overtimeAfterMinutes);

  const rawOvertime = Math.max(0, workedMinutes - policy.overtimeAfterMinutes);
  const afterGrace = rawOvertime >= policy.overtimeGraceMinutes ? rawOvertime : 0;
  const overtimeEligibleMinutes = floorTo(afterGrace, policy.roundingMinutes);

  // 8. Late clock-out beyond the policy cutoff.
  if (clockOut && policy.clockOutCutoffMinutes > 0) {
    const afterEnd = minutesBetween(policy.scheduledEnd, clockOut.at);
    if (afterEnd > policy.clockOutCutoffMinutes) {
      issues.push({
        code: "beyond_cutoff",
        severity: "review",
        message: `Clock-out at ${fmtClock(clockOut.at, policy.timezone)} is ${fmtMinutes(Math.round(afterEnd))} after the scheduled end, beyond the ${fmtMinutes(policy.clockOutCutoffMinutes)} cutoff. A manager must review this before overtime counts.`,
      });
    }
  }

  const provisional = issues.some((i) => i.severity === "provisional" || i.severity === "review");

  const breakdown: string[] = [];
  if (clockIn && clockOut) {
    breakdown.push(
      `Clocked time ${fmtMinutes(Math.round(clockedMinutes))} − unpaid breaks ${fmtMinutes(unpaidMinutes)} = worked time ${fmtMinutes(workedMinutes)}`
    );
  } else {
    breakdown.push(
      `Clocked time incomplete — ${!clockIn ? "no clock-in" : "no clock-out"} recorded, so worked time cannot be finalised`
    );
  }
  if (overtimeEligibleMinutes > 0) {
    breakdown.push(
      `Regular ${fmtMinutes(regularMinutes)} + overtime eligible ${fmtMinutes(overtimeEligibleMinutes)}`
    );
  } else {
    breakdown.push(`Regular ${fmtMinutes(regularMinutes)} + overtime eligible 0h 00m`);
  }
  if (jobMinutes > 0) {
    breakdown.push(
      `Includes ${fmtMinutes(jobMinutes)} on assigned jobs, which is paid working time`
    );
  }
  if (policy.roundingMinutes > 0 && rawOvertime > overtimeEligibleMinutes) {
    breakdown.push(
      `Overtime rounded down to the nearest ${policy.roundingMinutes} minutes per policy`
    );
  }

  return {
    scheduledMinutes,
    clockedMinutes: Math.round(clockedMinutes),
    unpaidMinutes,
    workedMinutes,
    regularMinutes,
    overtimeEligibleMinutes,
    jobMinutes,
    clockIn: clockIn?.at ?? null,
    clockOut: clockOut?.at ?? null,
    unpaidIntervals,
    jobIntervals,
    excludedEventIds,
    countedEvents: kept,
    issues,
    provisional,
    breakdown,
  };
}

// ─── Approval boundaries ───────────────────────────────────────────────────

export interface OvertimeValidation {
  ok: boolean;
  /** The largest amount the worker may request, after policy rounding. */
  cappedMinutes: number;
  errors: string[];
  warnings: string[];
}

/**
 * A worker may only request overtime that recorded time and policy actually
 * support. Provisional calculations cannot be submitted at all — that is what
 * stops a missing clock-out from being turned into paid overtime.
 */
export function validateOvertimeRequest(
  requestedMinutes: number,
  totals: ShiftTotals,
  policy: ShiftPolicy
): OvertimeValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cappedMinutes = floorTo(
    Math.max(0, Math.min(requestedMinutes, totals.overtimeEligibleMinutes)),
    policy.roundingMinutes
  );

  if (!(requestedMinutes > 0)) {
    errors.push("Enter an overtime amount greater than zero.");
  }
  if (totals.overtimeEligibleMinutes <= 0) {
    errors.push(
      `Recorded time supports no overtime for this shift. Worked ${fmtMinutes(totals.workedMinutes)} against a ${fmtMinutes(policy.overtimeAfterMinutes)} threshold.`
    );
  }
  if (requestedMinutes > totals.overtimeEligibleMinutes) {
    errors.push(
      `You can only request up to ${fmtMinutes(totals.overtimeEligibleMinutes)}, which is what your recorded time supports.`
    );
  }
  if (totals.provisional) {
    const blocking = totals.issues.filter(
      (i) => i.severity === "provisional" || i.severity === "review"
    );
    errors.push(
      `This calculation is provisional and cannot be submitted yet: ${blocking
        .map((i) => i.message)
        .join(" ")}`
    );
  }
  if (requestedMinutes % (policy.roundingMinutes || 1) !== 0) {
    warnings.push(
      `Requests are rounded down to the nearest ${policy.roundingMinutes} minutes, so ${fmtMinutes(requestedMinutes)} becomes ${fmtMinutes(cappedMinutes)}.`
    );
  }

  return { ok: errors.length === 0, cappedMinutes, errors, warnings };
}

/**
 * Suggested request amounts for the picker. Always ends on the full eligible
 * amount and never offers more than the calculation supports.
 */
export function overtimeChips(
  eligibleMinutes: number,
  roundingMinutes: number,
  max = 6
): number[] {
  const unit = roundingMinutes > 0 ? roundingMinutes : 5;
  if (eligibleMinutes <= 0) return [];
  const step = Math.max(unit, Math.ceil(eligibleMinutes / max / unit) * unit);
  const chips: number[] = [];
  for (let m = step; m < eligibleMinutes; m += step) chips.push(m);
  chips.push(eligibleMinutes);
  return chips;
}

export function pendingMinutes(claim?: OvertimeClaim): number {
  return claim && claim.state === "requested_pending" ? claim.requestedMinutes : 0;
}

export function approvedMinutes(claim?: OvertimeClaim): number {
  return claim && claim.state === "approved" ? claim.decision?.approvedMinutes ?? 0 : 0;
}

export function declinedMinutes(claim?: OvertimeClaim): number {
  return claim && claim.state === "declined" ? claim.requestedMinutes : 0;
}

// ─── View models ───────────────────────────────────────────────────────────

export interface DayView {
  record: ShiftRecord;
  totals: ShiftTotals;
  eligibleMinutes: number;
  requestedMinutes: number;
  pendingMinutes: number;
  approvedMinutes: number;
  declinedMinutes: number;
  approvalState: ApprovalState;
  decisionReason?: string;
  decidedBy?: string;
  provisional: boolean;
  /** Why the numbers may still change — surfaced verbatim in the UI. */
  provisionalReasons: string[];
}

export function buildDayView(record: ShiftRecord): DayView {
  const totals = deriveShiftTotals(record.events, record.policy);
  const claim = record.claim;
  return {
    record,
    totals,
    eligibleMinutes: totals.overtimeEligibleMinutes,
    requestedMinutes: claim?.requestedMinutes ?? 0,
    pendingMinutes: pendingMinutes(claim),
    approvedMinutes: approvedMinutes(claim),
    declinedMinutes: declinedMinutes(claim),
    approvalState: claim?.state ?? "none",
    decisionReason: claim?.decision?.reason,
    decidedBy: claim?.decision?.decidedBy,
    provisional: totals.provisional,
    provisionalReasons: totals.issues
      .filter((i) => i.severity !== "info")
      .map((i) => i.message),
  };
}

export interface WeekSummary {
  scheduledMinutes: number;
  clockedMinutes: number;
  unpaidMinutes: number;
  workedMinutes: number;
  regularMinutes: number;
  eligibleMinutes: number;
  requestedMinutes: number;
  pendingMinutes: number;
  approvedMinutes: number;
  declinedMinutes: number;
  provisionalDayLabels: string[];
  /** Only ever sums *confirmed* days, so a provisional day never inflates pay. */
  confirmedWorkedMinutes: number;
}

export function summariseDays(days: readonly DayView[]): WeekSummary {
  const sum = (fn: (d: DayView) => number) => days.reduce((a, d) => a + fn(d), 0);
  const confirmed = days.filter((d) => !d.provisional);
  return {
    scheduledMinutes: sum((d) => d.totals.scheduledMinutes),
    clockedMinutes: sum((d) => d.totals.clockedMinutes),
    unpaidMinutes: sum((d) => d.totals.unpaidMinutes),
    workedMinutes: sum((d) => d.totals.workedMinutes),
    regularMinutes: sum((d) => d.totals.regularMinutes),
    eligibleMinutes: sum((d) => d.eligibleMinutes),
    requestedMinutes: sum((d) => d.requestedMinutes),
    pendingMinutes: sum((d) => d.pendingMinutes),
    approvedMinutes: sum((d) => d.approvedMinutes),
    declinedMinutes: sum((d) => d.declinedMinutes),
    provisionalDayLabels: days.filter((d) => d.provisional).map((d) => d.record.label),
    confirmedWorkedMinutes: confirmed.reduce((a, d) => a + d.totals.workedMinutes, 0),
  };
}
