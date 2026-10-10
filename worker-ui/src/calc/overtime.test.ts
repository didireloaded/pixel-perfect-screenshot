import { describe, expect, it } from "vitest";
import {
  approvedMinutes,
  buildDayView,
  declinedMinutes,
  deriveShiftTotals,
  fmtMinutes,
  overtimeChips,
  pendingMinutes,
  scheduledMinutesOf,
  summariseDays,
  validateOvertimeRequest,
} from "./overtime";
import type {
  AttendanceEvent,
  EventType,
  OvertimeClaim,
  ShiftPolicy,
  ShiftRecord,
  TimesheetStatus,
} from "./overtime";

// ─── helpers ───────────────────────────────────────────────────────────────

let n = 0;
function ev(type: EventType, at: string, extra: Partial<AttendanceEvent> = {}): AttendanceEvent {
  n += 1;
  return {
    id: `t${n}`,
    type,
    at,
    source: "device",
    sync: "confirmed",
    recordedAt: at,
    actor: "Alex Martin",
    ...extra,
  };
}

/** Standard day shift, 08:00–17:00 UTC, overtime after 8h. */
function pol(over: Partial<ShiftPolicy> = {}): ShiftPolicy {
  return {
    id: "p",
    workdate: "2026-10-08",
    scheduledStart: "2026-10-08T08:00:00Z",
    scheduledEnd: "2026-10-08T17:00:00Z",
    overtimeAfterMinutes: 480,
    overtimeGraceMinutes: 5,
    roundingMinutes: 5,
    unpaidDepartureKinds: ["personal", "emergency"],
    lunchUnpaid: true,
    jobTimePaid: true,
    clockOutCutoffMinutes: 240,
    duplicateWindowSeconds: 120,
    timezone: "UTC",
    ...over,
  };
}

function rec(
  id: string,
  label: string,
  events: AttendanceEvent[],
  over: Partial<ShiftPolicy> = {},
  claim?: OvertimeClaim,
  timesheetStatus: TimesheetStatus = "Open"
): ShiftRecord {
  return {
    id,
    label,
    workdate: "2026-10-08",
    site: "Main Office",
    policy: pol(over),
    events,
    timesheetStatus,
    claim,
  };
}

const codes = (t: ReturnType<typeof deriveShiftTotals>) => t.issues.map((i) => i.code);

// ─── core arithmetic ───────────────────────────────────────────────────────

describe("worked time derivation", () => {
  it("subtracts unpaid lunch from clocked time", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol()
    );

    expect(t.clockedMinutes).toBe(540);
    expect(t.unpaidMinutes).toBe(60);
    expect(t.workedMinutes).toBe(480);
    expect(t.regularMinutes).toBe(480);
    expect(t.overtimeEligibleMinutes).toBe(0);
    expect(t.provisional).toBe(false);
    expect(t.issues).toEqual([]);
    expect(t.breakdown[0]).toBe(
      "Clocked time 9h 00m − unpaid breaks 1h 00m = worked time 8h 00m"
    );
  });

  it("deducts emergency departures but keeps assigned-job time as paid work", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("departure_start", "2026-10-08T10:00:00Z", {
          departureKind: "emergency",
          note: "Family emergency",
        }),
        ev("departure_end", "2026-10-08T10:30:00Z", { departureKind: "emergency" }),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("job_start", "2026-10-08T14:00:00Z", { jobTitle: "Site Inspection" }),
        ev("job_end", "2026-10-08T16:00:00Z", { jobTitle: "Site Inspection" }),
        ev("clock_out", "2026-10-08T18:00:00Z"),
      ],
      pol()
    );

    // 10h00 clocked − 1h00 lunch − 0h30 emergency = 8h30 worked.
    // The 2h00 job is working time and must NOT be deducted.
    expect(t.clockedMinutes).toBe(600);
    expect(t.unpaidMinutes).toBe(90);
    expect(t.workedMinutes).toBe(510);
    expect(t.jobMinutes).toBe(120);
    expect(t.regularMinutes).toBe(480);
    expect(t.overtimeEligibleMinutes).toBe(30);
    expect(t.jobIntervals[0].unpaid).toBe(false);
    expect(t.provisional).toBe(false);
  });

  it("keeps lunch as paid time when the policy says lunch is paid", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol({ lunchUnpaid: false })
    );

    expect(t.unpaidMinutes).toBe(0);
    expect(t.workedMinutes).toBe(540);
    expect(t.overtimeEligibleMinutes).toBe(60);
    expect(t.unpaidIntervals[0].unpaid).toBe(false);
  });

  it("never derives more than the clocked span when nothing is deducted", () => {
    const t = deriveShiftTotals(
      [ev("clock_in", "2026-10-08T08:00:00Z"), ev("clock_out", "2026-10-08T17:00:00Z")],
      pol({ lunchUnpaid: true })
    );
    expect(t.workedMinutes).toBe(540);
    expect(t.unpaidMinutes).toBe(0);
  });
});

// ─── policy boundaries ─────────────────────────────────────────────────────

describe("overtime policy boundaries", () => {
  it("floors eligible overtime to the policy rounding unit", () => {
    // 07:55 → 17:21 = 9h26 clocked − 1h00 lunch = 8h26 worked → 26m raw.
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T07:55:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:21:00Z"),
      ],
      pol()
    );

    expect(t.workedMinutes).toBe(506);
    expect(t.regularMinutes).toBe(480);
    expect(t.overtimeEligibleMinutes).toBe(25); // 26 rounded down, never up
    expect(t.breakdown[1]).toBe("Regular 8h 00m + overtime eligible 0h 25m");
  });

  it("drops overtime below the grace threshold", () => {
    // 07:59 → 17:03 with one hour of unpaid lunch = 8h04 worked.
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T07:59:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:03:00Z"),
      ],
      pol()
    );

    expect(t.workedMinutes).toBe(484);
    expect(t.regularMinutes).toBe(480);
    expect(t.overtimeEligibleMinutes).toBe(0);
  });

  it("flags a clock-out beyond the cutoff for review and blocks submission", () => {
    const t = deriveShiftTotals(
      [ev("clock_in", "2026-10-08T08:00:00Z"), ev("clock_out", "2026-10-08T22:00:00Z")],
      pol({ clockOutCutoffMinutes: 240 })
    );

    expect(codes(t)).toContain("beyond_cutoff");
    expect(t.issues.find((i) => i.code === "beyond_cutoff")?.severity).toBe("review");
    expect(t.provisional).toBe(true);
    expect(t.overtimeEligibleMinutes).toBe(360); // computed, but not claimable
    expect(validateOvertimeRequest(360, t, pol()).ok).toBe(false);
  });

  it("computes a scheduled window that wraps past midnight", () => {
    expect(
      scheduledMinutesOf(
        pol({ scheduledStart: "2026-10-08T22:00:00Z", scheduledEnd: "2026-10-08T06:00:00Z" })
      )
    ).toBe(480);
  });
});

// ─── overnight + timezone ──────────────────────────────────────────────────

describe("overnight and timezone boundaries", () => {
  it("handles a shift crossing midnight as plain UTC arithmetic", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-03T21:58:00Z"),
        ev("lunch_start", "2026-10-04T01:30:00Z"),
        ev("lunch_end", "2026-10-04T02:00:00Z"),
        ev("clock_out", "2026-10-04T06:04:00Z"),
      ],
      pol({
        scheduledStart: "2026-10-03T22:00:00Z",
        scheduledEnd: "2026-10-04T06:00:00Z",
      })
    );

    expect(t.scheduledMinutes).toBe(480);
    expect(t.clockedMinutes).toBe(486); // 8h06 across midnight
    expect(t.workedMinutes).toBe(456); // − 30m lunch
    expect(t.overtimeEligibleMinutes).toBe(0);
    expect(codes(t)).toContain("overnight_shift");
    expect(t.provisional).toBe(false); // informational only
  });

  it("gives identical totals for the same instants written in different offsets", () => {
    const asUtc = deriveShiftTotals(
      [ev("clock_in", "2026-10-08T08:00:00Z"), ev("clock_out", "2026-10-08T17:00:00Z")],
      pol()
    );
    const asLocal = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T09:00:00+01:00"),
        ev("clock_out", "2026-10-08T18:00:00+01:00"),
      ],
      pol({ timezone: "Europe/London" })
    );

    expect(asLocal.clockedMinutes).toBe(asUtc.clockedMinutes);
    expect(asLocal.workedMinutes).toBe(540);
    expect(asLocal.overtimeEligibleMinutes).toBe(60);
  });
});

// ─── provisional states ────────────────────────────────────────────────────

describe("provisional calculations", () => {
  it("is provisional and yields no claimable overtime when the clock-out is missing", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
      ],
      pol()
    );

    expect(codes(t)).toContain("missing_clock_out");
    expect(t.clockOut).toBeNull();
    expect(t.clockedMinutes).toBe(0);
    expect(t.workedMinutes).toBe(0);
    expect(t.overtimeEligibleMinutes).toBe(0);
    expect(t.provisional).toBe(true);
    expect(t.breakdown[0]).toContain("no clock-out");
  });

  it("is provisional when there is no clock-in", () => {
    const t = deriveShiftTotals([ev("clock_out", "2026-10-08T17:00:00Z")], pol());
    expect(codes(t)).toContain("missing_clock_in");
    expect(t.provisional).toBe(true);
  });

  it("does not deduct an unresolved departure and marks the total provisional", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("departure_start", "2026-10-08T15:00:00Z", { departureKind: "personal" }),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol()
    );

    expect(codes(t)).toContain("unresolved_interval");
    expect(t.unpaidMinutes).toBe(0); // unknown duration → never guessed
    expect(t.workedMinutes).toBe(540);
    expect(t.overtimeEligibleMinutes).toBe(60);
    expect(t.provisional).toBe(true);
    expect(t.unpaidIntervals[0].resolved).toBe(false);
    // Eligible time exists, but it cannot be claimed while provisional.
    expect(validateOvertimeRequest(60, t, pol()).ok).toBe(false);
  });

  it("flags an interval end with no matching start", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol()
    );
    expect(codes(t)).toContain("orphan_interval_end");
    expect(t.provisional).toBe(true);
  });

  it("is provisional while an event is still syncing", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z", { sync: "unsynced" }),
      ],
      pol()
    );

    expect(codes(t)).toContain("event_syncing");
    expect(t.provisional).toBe(true);
    expect(t.clockedMinutes).toBe(540); // still shown, clearly marked provisional
  });

  it("is provisional while a correction is under review", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z"),
        ev("clock_out", "2026-10-08T17:45:00Z", {
          source: "correction",
          sync: "pending",
          actor: "Sarah Chen",
        }),
      ],
      pol()
    );

    expect(codes(t)).toContain("correction_in_review");
    expect(t.provisional).toBe(true);
    // The first confirmed clock-out is the one counted; the correction is pending.
    expect(t.clockOut).toBe("2026-10-08T17:00:00Z");
  });

  it("treats informational issues as non-provisional", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z", { sync: "superseded" }),
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol()
    );

    expect(codes(t)).toContain("superseded_event");
    expect(t.issues.every((i) => i.severity === "info")).toBe(true);
    expect(t.provisional).toBe(false);
  });
});

// ─── duplicates and audit preservation ─────────────────────────────────────

describe("duplicate and offline events", () => {
  it("counts an offline double-submit of the same event once", () => {
    const events = [
      ev("clock_in", "2026-10-08T08:00:00Z"),
      ev("clock_in", "2026-10-08T08:00:30Z", { source: "import", note: "Offline re-submit" }),
      ev("clock_out", "2026-10-08T17:00:00Z"),
    ];
    const t = deriveShiftTotals(events, pol());

    expect(codes(t)).toContain("duplicate_event");
    expect(t.excludedEventIds).toHaveLength(1);
    expect(t.countedEvents.filter((e) => e.type === "clock_in")).toHaveLength(1);
    expect(t.clockIn).toBe("2026-10-08T08:00:00Z"); // earliest wins
    expect(t.clockedMinutes).toBe(540);
    expect(t.provisional).toBe(false);
  });

  it("allows the same event type again outside the duplicate window", () => {
    const t = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("departure_start", "2026-10-08T10:00:00Z", { departureKind: "personal" }),
        ev("departure_end", "2026-10-08T10:20:00Z", { departureKind: "personal" }),
        ev("departure_start", "2026-10-08T14:00:00Z", { departureKind: "personal" }),
        ev("departure_end", "2026-10-08T14:10:00Z", { departureKind: "personal" }),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol()
    );

    expect(t.unpaidIntervals).toHaveLength(2);
    expect(t.unpaidMinutes).toBe(30);
    expect(codes(t)).not.toContain("duplicate_event");
  });

  it("excludes superseded events from the maths but preserves them for audit", () => {
    const superseded = ev("clock_in", "2026-10-08T09:00:00Z", { sync: "superseded" });
    const events = [
      superseded,
      ev("clock_in", "2026-10-08T08:00:00Z"),
      ev("clock_out", "2026-10-08T17:00:00Z"),
    ];
    const t = deriveShiftTotals(events, pol());

    expect(t.excludedEventIds).toContain(superseded.id);
    expect(t.countedEvents.map((e) => e.id)).not.toContain(superseded.id);
    expect(events).toContain(superseded); // original log untouched
    expect(t.clockedMinutes).toBe(540);
  });

  it("does not mutate the event log it is given", () => {
    const events = Object.freeze([
      ev("clock_in", "2026-10-08T08:00:00Z"),
      ev("lunch_start", "2026-10-08T12:00:00Z"),
      ev("lunch_end", "2026-10-08T13:00:00Z"),
      ev("clock_out", "2026-10-08T17:00:00Z"),
    ]);
    const before = JSON.stringify(events);
    deriveShiftTotals(events, pol());
    expect(JSON.stringify(events)).toBe(before);
    expect(events).toHaveLength(4);
  });
});

// ─── request validation ────────────────────────────────────────────────────

describe("validateOvertimeRequest", () => {
  const eligible25 = deriveShiftTotals(
    [
      ev("clock_in", "2026-10-08T07:55:00Z"),
      ev("lunch_start", "2026-10-08T12:00:00Z"),
      ev("lunch_end", "2026-10-08T13:00:00Z"),
      ev("clock_out", "2026-10-08T17:21:00Z"),
    ],
    pol()
  );

  it("accepts exactly the supported amount", () => {
    const v = validateOvertimeRequest(25, eligible25, pol());
    expect(v.ok).toBe(true);
    expect(v.cappedMinutes).toBe(25);
    expect(v.errors).toEqual([]);
  });

  it("rejects a request above what recorded time supports", () => {
    const v = validateOvertimeRequest(60, eligible25, pol());
    expect(v.ok).toBe(false);
    expect(v.cappedMinutes).toBe(25);
    expect(v.errors.some((e) => e.includes("only request up to 0h 25m"))).toBe(true);
  });

  it("rejects zero and negative amounts", () => {
    expect(validateOvertimeRequest(0, eligible25, pol()).ok).toBe(false);
    expect(validateOvertimeRequest(-15, eligible25, pol()).ok).toBe(false);
  });

  it("rejects any request when there is no eligible overtime", () => {
    // Exactly on schedule: 9h00 clocked − 1h00 lunch = 8h00 worked = threshold.
    const none = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T08:00:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:00:00Z"),
      ],
      pol()
    );
    expect(none.workedMinutes).toBe(480);
    expect(none.overtimeEligibleMinutes).toBe(0);
    const v = validateOvertimeRequest(15, none, pol());
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("supports no overtime"))).toBe(true);
  });

  it("warns and rounds down when the amount is not on a rounding boundary", () => {
    const eligible35 = deriveShiftTotals(
      [
        ev("clock_in", "2026-10-08T07:57:00Z"),
        ev("lunch_start", "2026-10-08T12:00:00Z"),
        ev("lunch_end", "2026-10-08T13:00:00Z"),
        ev("clock_out", "2026-10-08T17:32:00Z"),
      ],
      pol()
    );
    expect(eligible35.overtimeEligibleMinutes).toBe(35);

    const v = validateOvertimeRequest(33, eligible35, pol());
    expect(v.ok).toBe(true);
    expect(v.cappedMinutes).toBe(30);
    expect(v.warnings.some((w) => w.includes("rounded down"))).toBe(true);
  });

  it("blocks submission while the calculation is provisional", () => {
    const provisional = deriveShiftTotals(
      [ev("clock_in", "2026-10-08T08:00:00Z")],
      pol()
    );
    const v = validateOvertimeRequest(30, provisional, pol());
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("provisional"))).toBe(true);
  });
});

// ─── approval boundaries ───────────────────────────────────────────────────

describe("approval states", () => {
  const base = {
    id: "c1",
    shiftId: "s1",
    eligibleAtSubmitMinutes: 25,
    submittedAt: "2026-10-05T18:00:00Z",
    submittedBy: "Alex Martin",
  };

  it("never counts pending overtime as approved", () => {
    const claim: OvertimeClaim = { ...base, requestedMinutes: 25, state: "requested_pending" };
    expect(pendingMinutes(claim)).toBe(25);
    expect(approvedMinutes(claim)).toBe(0);
    expect(declinedMinutes(claim)).toBe(0);
  });

  it("supports partial approval below the requested amount", () => {
    const claim: OvertimeClaim = {
      ...base,
      requestedMinutes: 25,
      state: "approved",
      decision: {
        approvedMinutes: 15,
        reason: "Only 15 minutes were authorised for the delivery.",
        decidedBy: "Sarah Chen",
        decidedAt: "2026-10-06T09:00:00Z",
      },
    };
    expect(approvedMinutes(claim)).toBe(15);
    expect(pendingMinutes(claim)).toBe(0);
    expect(declinedMinutes(claim)).toBe(0);
  });

  it("counts a declined claim as neither pending nor approved", () => {
    const claim: OvertimeClaim = {
      ...base,
      requestedMinutes: 25,
      state: "declined",
      decision: {
        approvedMinutes: 0,
        reason: "The extra time was not authorised in advance.",
        decidedBy: "Sarah Chen",
        decidedAt: "2026-10-06T09:00:00Z",
      },
    };
    expect(declinedMinutes(claim)).toBe(25);
    expect(approvedMinutes(claim)).toBe(0);
    expect(pendingMinutes(claim)).toBe(0);
  });

  it("returns zero for every bucket when there is no claim", () => {
    expect(pendingMinutes(undefined)).toBe(0);
    expect(approvedMinutes(undefined)).toBe(0);
    expect(declinedMinutes(undefined)).toBe(0);
  });

  it("exposes the decision reason on the worker view after a decision", () => {
    const day = buildDayView(
      rec("s1", "Wed 7 Oct", [
        ev("clock_in", "2026-10-07T07:57:00Z"),
        ev("lunch_start", "2026-10-07T12:00:00Z"),
        ev("lunch_end", "2026-10-07T13:00:00Z"),
        ev("clock_out", "2026-10-07T17:32:00Z"),
      ], {}, {
        id: "c7",
        shiftId: "s1",
        requestedMinutes: 35,
        eligibleAtSubmitMinutes: 35,
        state: "approved",
        submittedAt: "2026-10-07T18:05:00Z",
        submittedBy: "Alex Martin",
        decision: {
          approvedMinutes: 35,
          reason: "Safety audit ran over the scheduled end. Approved in full.",
          decidedBy: "Sarah Chen",
          decidedAt: "2026-10-08T09:20:00Z",
        },
      })
    );

    expect(day.approvalState).toBe("approved");
    expect(day.approvedMinutes).toBe(35);
    expect(day.pendingMinutes).toBe(0);
    expect(day.decisionReason).toContain("Approved in full");
    expect(day.decidedBy).toBe("Sarah Chen");
    expect(day.provisional).toBe(false);
  });

  it("keeps a pending claim visibly pending on the worker view", () => {
    const day = buildDayView(
      rec("s2", "Mon 5 Oct", [
        ev("clock_in", "2026-10-05T07:55:00Z"),
        ev("lunch_start", "2026-10-05T12:00:00Z"),
        ev("lunch_end", "2026-10-05T13:00:00Z"),
        ev("clock_out", "2026-10-05T17:21:00Z"),
      ], {}, {
        id: "c5",
        shiftId: "s2",
        requestedMinutes: 25,
        eligibleAtSubmitMinutes: 25,
        state: "requested_pending",
        submittedAt: "2026-10-05T18:00:00Z",
        submittedBy: "Alex Martin",
      })
    );

    expect(day.approvalState).toBe("requested_pending");
    expect(day.pendingMinutes).toBe(25);
    expect(day.approvedMinutes).toBe(0);
    expect(day.decisionReason).toBeUndefined();
  });

  it("lists why a day is provisional on the worker view", () => {
    const day = buildDayView(
      rec("s3", "Fri 2 Oct", [ev("clock_in", "2026-10-02T08:01:00Z")])
    );
    expect(day.provisional).toBe(true);
    expect(day.provisionalReasons.some((r) => r.includes("clock-out"))).toBe(true);
    expect(day.eligibleMinutes).toBe(0);
  });
});

// ─── weekly aggregation ────────────────────────────────────────────────────

describe("summariseDays", () => {
  const clean = buildDayView(
    rec("a", "Thu 8 Oct", [
      ev("clock_in", "2026-10-08T08:00:00Z"),
      ev("lunch_start", "2026-10-08T12:00:00Z"),
      ev("lunch_end", "2026-10-08T13:00:00Z"),
      ev("clock_out", "2026-10-08T17:00:00Z"),
    ], {}, undefined, "Submitted")
  );
  const withOt = buildDayView(
    rec("b", "Wed 7 Oct", [
      ev("clock_in", "2026-10-07T07:57:00Z"),
      ev("lunch_start", "2026-10-07T12:00:00Z"),
      ev("lunch_end", "2026-10-07T13:00:00Z"),
      ev("clock_out", "2026-10-07T17:32:00Z"),
    ], {}, undefined, "Awaiting review")
  );
  const provisional = buildDayView(
    rec("c", "Fri 2 Oct", [ev("clock_in", "2026-10-02T08:01:00Z")], {}, undefined, "Open")
  );

  it("sums worked, regular and eligible overtime across the week", () => {
    const s = summariseDays([clean, withOt, provisional]);
    expect(s.workedMinutes).toBe(480 + 515 + 0);
    expect(s.regularMinutes).toBe(480 + 480 + 0);
    expect(s.unpaidMinutes).toBe(60 + 60 + 0);
    expect(s.eligibleMinutes).toBe(0 + 35 + 0);
  });

  it("excludes provisional days from the confirmed worked total", () => {
    const s = summariseDays([clean, withOt, provisional]);
    expect(s.confirmedWorkedMinutes).toBe(480 + 515);
    expect(s.provisionalDayLabels).toEqual(["Fri 2 Oct"]);
  });

  it("keeps pending and approved overtime in separate buckets", () => {
    const pendingDay = buildDayView(
      rec("d", "Mon 5 Oct", [
        ev("clock_in", "2026-10-05T07:55:00Z"),
        ev("lunch_start", "2026-10-05T12:00:00Z"),
        ev("lunch_end", "2026-10-05T13:00:00Z"),
        ev("clock_out", "2026-10-05T17:21:00Z"),
      ], {}, {
        id: "c5",
        shiftId: "d",
        requestedMinutes: 25,
        eligibleAtSubmitMinutes: 25,
        state: "requested_pending",
        submittedAt: "2026-10-05T18:00:00Z",
        submittedBy: "Alex Martin",
      })
    );
    const approvedDay = buildDayView(
      rec("e", "Wed 7 Oct", [
        ev("clock_in", "2026-10-07T07:57:00Z"),
        ev("lunch_start", "2026-10-07T12:00:00Z"),
        ev("lunch_end", "2026-10-07T13:00:00Z"),
        ev("clock_out", "2026-10-07T17:32:00Z"),
      ], {}, {
        id: "c7",
        shiftId: "e",
        requestedMinutes: 35,
        eligibleAtSubmitMinutes: 35,
        state: "approved",
        submittedAt: "2026-10-07T18:05:00Z",
        submittedBy: "Alex Martin",
        decision: {
          approvedMinutes: 35,
          reason: "Approved in full.",
          decidedBy: "Sarah Chen",
          decidedAt: "2026-10-08T09:20:00Z",
        },
      })
    );

    const s = summariseDays([pendingDay, approvedDay]);
    expect(s.pendingMinutes).toBe(25);
    expect(s.approvedMinutes).toBe(35);
    expect(s.requestedMinutes).toBe(60);
    expect(s.declinedMinutes).toBe(0);
  });
});

describe("overtimeChips", () => {
  it("never offers more than the eligible amount", () => {
    expect(overtimeChips(25, 5)).toEqual([5, 10, 15, 20, 25]);
    expect(overtimeChips(35, 5)).toEqual([10, 20, 30, 35]);
    expect(overtimeChips(5, 5)).toEqual([5]);
    expect(overtimeChips(360, 5)).toEqual([60, 120, 180, 240, 300, 360]);
    for (const c of overtimeChips(360, 5)) expect(c).toBeLessThanOrEqual(360);
  });

  it("offers nothing when no overtime is eligible", () => {
    expect(overtimeChips(0, 5)).toEqual([]);
    expect(overtimeChips(-10, 5)).toEqual([]);
  });
});

describe("fmtMinutes", () => {
  it("formats durations with padded minutes", () => {
    expect(fmtMinutes(0)).toBe("0h 00m");
    expect(fmtMinutes(5)).toBe("0h 05m");
    expect(fmtMinutes(75)).toBe("1h 15m");
    expect(fmtMinutes(506)).toBe("8h 26m");
  });
});
