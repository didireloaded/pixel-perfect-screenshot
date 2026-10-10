import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./local-api.mjs";
test("versioned policies, native evidence, two-level corrections and exact locked seconds", async () => {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    employee = randomUUID(),
    payroll = randomUUID();
  try {
    for (const id of [manager, employee, payroll])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Advanced Tests",
      name: "Manager",
      site: "Test Site",
      timezone: "Africa/Windhoek",
    });
    const site = setup.snapshot.sites[0].id;
    // Use a completed recent day so captured events stay valid at any test-run hour.
    const day = new Date(Date.parse(`${setup.snapshot.today}T12:00:00Z`) - 86400000)
      .toISOString()
      .slice(0, 10);
    await call(manager, "set_geofence", {
      siteId: site,
      mode: "validate",
      latitude: -22.56,
      longitude: 17.08,
      radiusM: 150,
      maxAccuracyM: 100,
    });
    const invite = await call(manager, "create_employee", {
      name: "Employee",
      no: "1001",
      siteId: site,
    });
    await call(employee, "activate", { employeeNo: "1001", code: invite.activationCode });
    const invitePayroll = await call(manager, "create_employee", {
      name: "Payroll",
      no: "1002",
      siteId: site,
    });
    await call(payroll, "activate", { employeeNo: "1002", code: invitePayroll.activationCode });
    await call(manager, "set_payroll_role", { employeeId: invitePayroll.employeeId });
    await assert.rejects(call(manager, "save_policy", { require_face_match: true }), /Biometrics/);
    await call(manager, "save_policy", {
      require_gps_stamp: true,
      enforce_geofence: true,
      allow_offline_clockin: true,
      require_two_level_correction_approval: true,
    });
    const assign = await call(manager, "assign_shift", {
      employeeId: invite.employeeId,
      siteId: site,
      date: day,
      start: "08:00",
      end: "17:00",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 1,
    });
    const shift = assign.snapshot.shifts[0].id;
    await call(manager, "save_policy", { allow_offline_clockin: false });
    const snap = await call(employee, null);
    assert.equal(snap.policy.version, 3);
    assert.equal(snap.shifts[0].totals.policyVersion, 2);
    const device = randomUUID();
    await call(employee, "register_device", {
      id: device,
      clientType: "kiosk",
      platform: "android",
    });
    await assert.rejects(
      call(payroll, "register_device", { id: device, clientType: "kiosk", platform: "android" }),
      /conflict/,
    );
    const base = {
      shiftId: shift,
      deviceId: device,
      offline: true,
      location: { latitude: -22.56, longitude: 17.08, accuracyM: 15 },
    };
    const send = (type, time, extra = {}) =>
      call(employee, "submit_attendance", {
        ...base,
        id: randomUUID(),
        type,
        capturedAt: `${day}T${time}+02:00`,
        ...extra,
      });
    const outsideId = randomUUID();
    const outsideIntent = {
      ...base,
      id: outsideId,
      type: "clock_in",
      capturedAt: `${day}T08:00:00+02:00`,
      location: { latitude: -22, longitude: 17, accuracyM: 10 },
    };
    const outside = await call(employee, "submit_attendance", outsideIntent);
    assert.equal(outside.reason, "OUTSIDE_WORKSITE");
    assert.equal(outside.snapshot.events.length, 0);
    const replay = await call(employee, "submit_attendance", outsideIntent);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.conflictId, outsideId);
    await call(manager, "review_submission", {
      id: outsideId,
      decision: "declined",
      reason: "Incorrect capture; employee rechecked the site.",
    });
    const clock = await send("clock_in", "08:00:01");
    assert.equal(clock.status, "synced");
    await assert.rejects(
      call(employee, "submit_attendance", {
        ...base,
        id: clock.eventId,
        type: "clock_out",
        capturedAt: `${day}T08:00:01+02:00`,
      }),
      /Event ID conflict/,
    );
    const invalid = await send("end_lunch", "08:01:00");
    assert.equal(invalid.status, "needs_review");
    assert.equal(invalid.reason, "INVALID_TRANSITION");
    await call(manager, "review_submission", {
      id: invalid.conflictId,
      decision: "declined",
      reason: "Lunch had not started.",
    });
    await send("start_lunch", "08:10:01");
    await send("end_lunch", "08:15:01");
    const out = await send("clock_out", "08:30:31");
    const originalOut = out.snapshot.events.find((e) => e.type === "clock_out");
    const totals = out.snapshot.shifts[0].totals;
    assert.equal(totals.recordedSeconds, 1530);
    assert.equal(totals.unpaidBreakSeconds, 300);
    assert.equal(totals.regularSeconds, 60);
    assert.equal(totals.overtimeSecondsPending, 1470);
    await call(employee, "submit_timesheet", { shiftId: shift, overtimeMinutes: 24 });
    await call(manager, "approve_timesheet", { shiftId: shift, overtimeMinutes: 24 });
    const request = await call(employee, "request_correction", {
      shiftId: shift,
      eventId: originalOut.id,
      replacementAt: `${day}T08:31:01+02:00`,
      reason: "Correct clock-out by 30 seconds",
    });
    const correction = request.snapshot.corrections[0].id;
    await assert.rejects(call(manager, "lock_period", { start: day, end: day }), /outstanding/);
    await assert.rejects(
      call(employee, "review_correction", {
        id: correction,
        decision: "approved",
        reason: "Self review",
      }),
      /Manager access/,
    );
    const level1 = await call(manager, "review_correction", {
      id: correction,
      decision: "approved",
      reason: "Verified the recorded departure.",
    });
    assert.equal(level1.snapshot.corrections[0].status, "pending_payroll");
    assert.equal(level1.snapshot.shifts[0].totals.recordedSeconds, 1530);
    await assert.rejects(
      call(manager, "review_correction", {
        id: correction,
        decision: "approved",
        reason: "Trying both levels",
      }),
      /different payroll/,
    );
    const level2 = await call(payroll, "review_correction", {
      id: correction,
      decision: "approved",
      reason: "Payroll verified the change.",
    });
    assert.equal(level2.snapshot.corrections[0].status, "approved");
    assert.equal(level2.snapshot.shifts[0].totals.recordedSeconds, 1560);
    assert.equal(level2.snapshot.timesheets[0].status, "open");
    assert.equal(
      level2.snapshot.events.find((e) => e.id === originalOut.id).capturedAt,
      originalOut.capturedAt,
    );
    await assert.rejects(
      db.query("update public.sl_events set note='changed' where id=$1", [originalOut.id]),
      /Append-only/,
    );
    await assert.rejects(
      db.query("delete from public.sl_policies where company_id=$1", [setup.snapshot.company.id]),
      /Append-only/,
    );
    await call(employee, "submit_timesheet", { shiftId: shift, overtimeMinutes: 25 });
    await call(manager, "approve_timesheet", { shiftId: shift, overtimeMinutes: 25 });
    const locked = await call(manager, "lock_period", { start: day, end: day });
    const exported = await call(manager, "export_period", { id: locked.snapshot.periods[0].id });
    const row = exported.rows[0];
    assert.equal(row.regular_seconds, 60);
    assert.equal(row.overtime_seconds_approved, 1500);
    assert.equal(row.payable_seconds, 1560);
    assert.equal(row.policy_version, 2);
    assert.equal(Object.keys(row).length, 12);
    assert.equal(
      (
        await db.query("select count(*)::int n from public.sl_calculations where shift_id=$1", [
          shift,
        ])
      ).rows[0].n,
      2,
    );
    await call(manager, "save_policy", { allow_offline_clockin: true, lunch_paid: true });
    const same = await call(manager, "export_period", { id: locked.snapshot.periods[0].id });
    assert.deepEqual(same.rows, exported.rows);
    await assert.rejects(
      call(employee, "request_correction", {
        shiftId: shift,
        eventId: originalOut.id,
        replacementAt: `${day}T08:32:00+02:00`,
        reason: "Late request",
      }),
      /locked/,
    );
    await assert.rejects(
      call(manager, "verify_setup", { step: "not_real_step", evidence: "Invalid" }),
    );
    const verified = await call(manager, "verify_setup", {
      step: "real_device_test",
      evidence: "Test fixture records native platform evidence; not physical proof.",
    });
    assert.equal(verified.snapshot.setup.find((s) => s.id === "real_device_test").complete, true);
  } finally {
    await db.close();
  }
});
