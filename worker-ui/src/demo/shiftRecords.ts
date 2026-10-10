/**
 * ⚠ DEMO DATA — NOT CONNECTED TO A BACKEND
 * ----------------------------------------
 * This repo contains no server. These `ShiftRecord`s stand in for the payload a
 * Shiftline backend would return for a pay period: a shift policy, the
 * preserved original attendance event log, the timesheet status and any
 * overtime claim with its manager decision.
 *
 * They are consumed by the pure functions in `src/calc/overtime.ts`, which is
 * where the real calculation lives. Swapping this file for an API response is
 * the only change needed to make the numbers authoritative — no calculation or
 * UI code has to move.
 *
 * Every timestamp is a real ISO-8601 instant. October 2026 in the sample site
 * timezone (Europe/London) is BST, i.e. UTC+01:00, so 08:00 local is 07:00Z.
 */

import type {
  AttendanceEvent,
  EventType,
  ShiftPolicy,
  ShiftRecord,
  TotalsSource,
} from "../calc/overtime";

export const DEMO_TOTALS_SOURCE: TotalsSource = "derived-on-device";

export const DEMO_DISCLAIMER =
  "Demo data. Overtime is derived on this device from the recorded event log and the shift policy. In production these totals are calculated by the Shiftline backend and are authoritative.";

let seq = 0;

interface EvExtra extends Partial<Omit<AttendanceEvent, "id" | "type" | "at">> {}

function ev(type: EventType, at: string, extra: EvExtra = {}): AttendanceEvent {
  seq += 1;
  return {
    id: `ev-${seq}`,
    type,
    at,
    source: "device",
    sync: "confirmed",
    recordedAt: at,
    actor: "Alex Martin",
    ...extra,
  };
}

/** Northstar Operations · standard day-shift policy. */
function policy(workdate: string, start: string, end: string, over: Partial<ShiftPolicy> = {}): ShiftPolicy {
  return {
    id: "ns-ops-standard",
    workdate,
    scheduledStart: start,
    scheduledEnd: end,
    overtimeAfterMinutes: 480,
    overtimeGraceMinutes: 5,
    roundingMinutes: 5,
    unpaidDepartureKinds: ["personal", "emergency"],
    lunchUnpaid: true,
    jobTimePaid: true,
    clockOutCutoffMinutes: 240,
    duplicateWindowSeconds: 120,
    timezone: "Europe/London",
    ...over,
  };
}

export const SHIFT_RECORDS: ShiftRecord[] = [
  // ── Thu 8 Oct · clean shift, no overtime ────────────────────────────────
  // 08:00 → 17:00 = 9h00 clocked, − 1h00 lunch = 8h00 worked.
  {
    id: "s-1008",
    label: "Thu 8 Oct",
    workdate: "2026-10-08",
    site: "Main Office",
    timesheetStatus: "Submitted",
    policy: policy("2026-10-08", "2026-10-08T08:00:00+01:00", "2026-10-08T17:00:00+01:00"),
    events: [
      ev("clock_in", "2026-10-08T08:00:00+01:00"),
      ev("lunch_start", "2026-10-08T12:00:00+01:00"),
      ev("lunch_end", "2026-10-08T13:00:00+01:00"),
      ev("clock_out", "2026-10-08T17:00:00+01:00"),
    ],
  },

  // ── Wed 7 Oct · job time is paid, 35m overtime approved ─────────────────
  // 07:57 → 17:32 = 9h35 clocked, − 1h00 lunch = 8h35 worked.
  // The 1h30 safety audit is working time, so it is NOT deducted.
  // 8h35 − 8h00 threshold = 35m eligible. Manager approved in full.
  {
    id: "s-1007",
    label: "Wed 7 Oct",
    workdate: "2026-10-07",
    site: "Main Office",
    timesheetStatus: "Awaiting review",
    policy: policy("2026-10-07", "2026-10-07T08:00:00+01:00", "2026-10-07T17:00:00+01:00"),
    events: [
      ev("clock_in", "2026-10-07T07:57:00+01:00"),
      ev("job_start", "2026-10-07T10:00:00+01:00", {
        jobId: "j5",
        jobTitle: "Safety Audit Support",
      }),
      ev("job_end", "2026-10-07T11:30:00+01:00", { jobId: "j5", jobTitle: "Safety Audit Support" }),
      ev("lunch_start", "2026-10-07T12:00:00+01:00"),
      ev("lunch_end", "2026-10-07T13:00:00+01:00"),
      ev("clock_out", "2026-10-07T17:32:00+01:00"),
    ],
    claim: {
      id: "cl-1007",
      shiftId: "s-1007",
      requestedMinutes: 35,
      eligibleAtSubmitMinutes: 35,
      state: "approved",
      submittedAt: "2026-10-07T18:05:00+01:00",
      submittedBy: "Alex Martin",
      decision: {
        approvedMinutes: 35,
        reason: "Safety audit ran over the scheduled end. Approved in full.",
        decidedBy: "Sarah Chen",
        decidedAt: "2026-10-08T09:20:00+01:00",
      },
    },
  },

  // ── Tue 6 Oct · unpaid personal departure, no overtime ──────────────────
  // 08:03 → 17:18 = 9h15 clocked, − 1h00 lunch − 0h20 personal = 7h55 worked.
  // The 2h00 stock replenishment job is paid time and stays inside the total.
  {
    id: "s-1006",
    label: "Tue 6 Oct",
    workdate: "2026-10-06",
    site: "Main Office",
    timesheetStatus: "Approved",
    policy: policy("2026-10-06", "2026-10-06T08:00:00+01:00", "2026-10-06T17:00:00+01:00"),
    events: [
      ev("clock_in", "2026-10-06T08:03:00+01:00"),
      ev("departure_start", "2026-10-06T10:15:00+01:00", {
        departureKind: "personal",
        note: "Bank appointment",
      }),
      ev("departure_end", "2026-10-06T10:35:00+01:00", { departureKind: "personal" }),
      ev("lunch_start", "2026-10-06T12:00:00+01:00"),
      ev("lunch_end", "2026-10-06T13:00:00+01:00"),
      ev("job_start", "2026-10-06T14:00:00+01:00", {
        jobId: "j6",
        jobTitle: "Stock Replenishment",
      }),
      ev("job_end", "2026-10-06T16:00:00+01:00", { jobId: "j6", jobTitle: "Stock Replenishment" }),
      ev("clock_out", "2026-10-06T17:18:00+01:00"),
    ],
  },

  // ── Mon 5 Oct · 26m raw overtime rounded down to 25m, still pending ─────
  // 07:55 → 17:21 = 9h26 clocked, − 1h00 lunch = 8h26 worked.
  // 26m over the 8h00 threshold, floored to the nearest 5m = 25m claimable.
  // Requested, awaiting a manager decision. Never shown as approved.
  {
    id: "s-1005",
    label: "Mon 5 Oct",
    workdate: "2026-10-05",
    site: "Main Office",
    timesheetStatus: "Submitted",
    policy: policy("2026-10-05", "2026-10-05T08:00:00+01:00", "2026-10-05T17:00:00+01:00"),
    events: [
      ev("clock_in", "2026-10-05T07:55:00+01:00"),
      ev("lunch_start", "2026-10-05T12:00:00+01:00"),
      ev("lunch_end", "2026-10-05T13:00:00+01:00"),
      ev("clock_out", "2026-10-05T17:21:00+01:00"),
    ],
    claim: {
      id: "cl-1005",
      shiftId: "s-1005",
      requestedMinutes: 25,
      eligibleAtSubmitMinutes: 25,
      state: "requested_pending",
      submittedAt: "2026-10-05T18:00:00+01:00",
      submittedBy: "Alex Martin",
    },
  },

  // ── Sat 3 Oct · overnight rotation crossing midnight ────────────────────
  // 21:58 → 06:04 next day = 8h06 clocked, − 0h30 lunch = 7h36 worked.
  // Proves midnight/timezone boundaries are plain UTC arithmetic.
  {
    id: "s-1003",
    label: "Sat 3 Oct",
    workdate: "2026-10-03",
    site: "Main Warehouse · night rotation",
    timesheetStatus: "Approved",
    policy: policy(
      "2026-10-03",
      "2026-10-03T22:00:00+01:00",
      "2026-10-04T06:00:00+01:00",
      { id: "ns-warehouse-night" }
    ),
    events: [
      ev("clock_in", "2026-10-03T21:58:00+01:00"),
      ev("lunch_start", "2026-10-04T01:30:00+01:00"),
      ev("lunch_end", "2026-10-04T02:00:00+01:00"),
      ev("clock_out", "2026-10-04T06:04:00+01:00"),
    ],
  },

  // ── Fri 2 Oct · provisional: duplicate, unresolved departure, no clock-out
  // Everything that must stop overtime being claimed is present on one day:
  //   • a duplicate clock_in 60s later from an offline re-submit → excluded
  //   • a superseded clock_in kept for audit only → excluded
  //   • an emergency departure with no matching end → not deducted, flagged
  //   • a correction to the missing clock-out, still under review
  //   • no confirmed clock-out at all
  // Worked time cannot be finalised, so overtime cannot be requested.
  {
    id: "s-1002",
    label: "Fri 2 Oct",
    workdate: "2026-10-02",
    site: "Main Office",
    timesheetStatus: "Open",
    policy: policy("2026-10-02", "2026-10-02T08:00:00+01:00", "2026-10-02T17:00:00+01:00"),
    events: [
      ev("clock_in", "2026-10-02T08:01:00+01:00", {
        sync: "superseded",
        source: "kiosk",
        note: "Superseded by a correction under review",
      }),
      ev("clock_in", "2026-10-02T08:02:00+01:00", {
        source: "import",
        note: "Offline re-submit of the same badge read",
      }),
      ev("clock_in", "2026-10-02T08:01:30+01:00", {
        source: "correction",
        sync: "pending",
        actor: "Sarah Chen",
        note: "Kiosk read 08:01, badge log shows 08:01:30",
      }),
      ev("lunch_start", "2026-10-02T12:00:00+01:00"),
      ev("lunch_end", "2026-10-02T13:00:00+01:00"),
      ev("departure_start", "2026-10-02T15:20:00+01:00", {
        departureKind: "emergency",
        note: "Family emergency",
      }),
    ],
  },
];

export const SHIFT_RECORD_BY_ID = Object.fromEntries(
  SHIFT_RECORDS.map((r) => [r.id, r])
) as Record<string, ShiftRecord>;
