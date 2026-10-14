import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("worker clock-in creates one attendance day, retries safely and keeps privacy transitions", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID();
    for (const id of [manager, worker]) await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Test",
      name: "Manager",
      site: "Office",
      timezone: "UTC",
    });
    const invite = await call(manager, "create_employee", {
      name: "Worker",
      no: "W1",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "W1", code: invite.activationCode });
    await assert.rejects(
      call(worker, "start_workday", { id: randomUUID(), expectedEnd: "00:00" }),
      /later today/,
    );
    assert.equal((await call(worker, null)).shifts.length, 0);
    await db.query("update sl_employees set access_status='pending' where id=$1", [
      invite.employeeId,
    ]);
    await assert.rejects(
      call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" }),
      /approval/,
    );
    await db.query("update sl_employees set access_status='active' where id=$1", [
      invite.employeeId,
    ]);
    await call(manager, "set_geofence", {
      siteId: setup.snapshot.sites[0].id,
      mode: "validate",
      latitude: -22.6,
      longitude: 17.08,
      radiusM: 150,
      maxAccuracyM: 100,
    });
    await call(manager, "save_policy", { require_gps_stamp: true, enforce_geofence: true });
    await assert.rejects(
      call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" }),
      /LOCATION_UNAVAILABLE/,
    );
    assert.equal((await call(worker, null)).shifts.length, 0);
    await call(manager, "save_policy", { require_gps_stamp: false, enforce_geofence: false });
    const payload = { id: randomUUID(), expectedEnd: "23:59" };
    const started = await call(worker, "start_workday", payload);
    assert.equal(started.status, "synced");
    assert.equal(started.snapshot.shifts.length, 1);
    assert.equal(started.snapshot.states[0].state, "working");
    const replay = await call(worker, "start_workday", payload);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.snapshot.events.length, 1);
    await assert.rejects(
      call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" }),
      /INVALID_TRANSITION/,
    );
    await assert.rejects(
      call(worker, "start_workday", { ...payload, employeeId: randomUUID() }),
      /Invalid clock-in payload/,
    );
    const managerView = await call(manager, null);
    assert.equal(managerView.shifts[0].id, started.snapshot.shifts[0].id);
    assert.equal(managerView.events.length, 1);
    const captured = (await db.query("select clock_timestamp() + interval '1 second' as capture"))
      .rows[0].capture;
    const offlineLunch = {
      id: randomUUID(),
      type: "start_lunch",
      shiftId: started.snapshot.shifts[0].id,
      capturedAt: new Date(captured).toISOString(),
      offline: true,
      location: { latitude: -22.6, longitude: 17.08, accuracyM: 10 },
    };
    const lunch = await call(worker, "submit_attendance", offlineLunch);
    assert.equal(lunch.snapshot.states[0].state, "on_lunch");
    const lunchReplay = await call(worker, "submit_attendance", offlineLunch);
    assert.equal(lunchReplay.duplicate, true);
    assert.equal(lunchReplay.snapshot.events.length, lunch.snapshot.events.length);
    assert.equal(
      (
        await db.query("select payload->'location' as location from sl_submissions where id=$1", [
          offlineLunch.id,
        ])
      ).rows[0].location,
      null,
    );
    const back = await call(worker, "submit_attendance", {
      id: randomUUID(),
      type: "end_lunch",
      shiftId: started.snapshot.shifts[0].id,
      capturedAt: new Date(new Date(captured).getTime() + 1000).toISOString(),
      offline: true,
    });
    assert.equal(back.snapshot.states[0].state, "working");
    const out = await call(worker, "submit_attendance", {
      id: randomUUID(),
      type: "clock_out",
      shiftId: started.snapshot.shifts[0].id,
      capturedAt: new Date(new Date(captured).getTime() + 2000).toISOString(),
      offline: true,
    });
    assert.equal(out.snapshot.states[0].state, "clocked_out");
  } finally {
    await db.close();
  }
});

test("midnight attendance remains evidence for review and never invents a clock-out or retains off-duty GPS", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID();
    for (const id of [manager, worker]) await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Midnight regression",
      name: "Manager",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const invite = await call(manager, "create_employee", {
      name: "Worker",
      no: "N1",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "N1", code: invite.activationCode });
    await call(manager, "save_policy", { allow_offline_clockin: true });
    // Entire fixture is in the past, so it is independent of the test runner's hour/timezone.
    const date = (
      await db.query(
        "select ((clock_timestamp() at time zone 'Africa/Windhoek')::date-2)::text as day",
      )
    ).rows[0].day;
    const shift = await call(manager, "assign_shift", {
      employeeId: invite.employeeId,
      siteId: setup.snapshot.sites[0].id,
      date,
      start: "20:00",
      end: "23:59",
      lunch: "21:00",
      lunchMinutes: 0,
      regularMinutes: 480,
    });
    const capture = (
      await db.query(
        `select
      (($1::date+time '20:00') at time zone 'Africa/Windhoek') as started,
      (($1::date+1+time '00:30') at time zone 'Africa/Windhoek') as finished`,
        [date],
      )
    ).rows[0];
    const originalClockInId = randomUUID();
    const started = await call(worker, "submit_attendance", {
      id: originalClockInId,
      type: "clock_in",
      shiftId: shift.shiftId,
      capturedAt: new Date(capture.started).toISOString(),
      offline: true,
    });
    assert.equal(started.status, "synced");
    // Legacy connected clients retry transition IDs without capturedAt. The
    // original record must be recognized before looking for today's shift.
    const transitionReplay = await call(worker, "transition", {
      id: originalClockInId,
      type: "clock_in",
    });
    assert.equal(transitionReplay.duplicate, true);
    assert.equal(transitionReplay.status, "synced");
    for (const changed of [{ type: "clock_out" }, { note: "Changed evidence" }]) {
      await assert.rejects(
        call(worker, "transition", {
          id: originalClockInId,
          type: "clock_in",
          ...changed,
        }),
        /Event ID conflict/,
      );
    }
    await assert.rejects(
      call(manager, "transition", {
        id: originalClockInId,
        type: "clock_in",
      }),
      /Event ID conflict/,
    );
    await db.query("update sl_employees set access_status='pending' where id=$1", [
      invite.employeeId,
    ]);
    await assert.rejects(
      call(worker, "transition", {
        id: originalClockInId,
        type: "clock_in",
      }),
      /approval/,
    );
    await db.query("update sl_employees set access_status='active' where id=$1", [
      invite.employeeId,
    ]);
    const payload = {
      id: randomUUID(),
      type: "clock_out",
      shiftId: shift.shiftId,
      capturedAt: new Date(capture.finished).toISOString(),
      offline: true,
      location: { latitude: -22.6, longitude: 17.08, accuracyM: 10 },
    };
    const submitted = await call(worker, "submit_attendance", payload);
    assert.equal(submitted.status, "needs_review");
    assert.equal(submitted.reason, "SHIFT_DATE_MISMATCH");
    const stored = (
      await db.query(
        "select captured_at, payload, canonical_event_id from sl_submissions where id=$1",
        [payload.id],
      )
    ).rows[0];
    assert.equal(new Date(stored.captured_at).toISOString(), payload.capturedAt);
    assert.equal(stored.payload.location, null);
    assert.equal(stored.canonical_event_id, null);
    assert.equal(
      (
        await db.query("select count(*)::int as count from sl_events where shift_id=$1", [
          shift.shiftId,
        ])
      ).rows[0].count,
      1,
    );
    const replay = await call(worker, "submit_attendance", payload);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.status, "needs_review");
    // Current approval cannot accept a next-day timestamp. Keep this limitation explicit,
    // rather than hiding it by moving the evidence onto another date.
    await assert.rejects(
      call(manager, "review_submission", {
        id: payload.id,
        decision: "approved",
        reason: "Verified event crew finished after midnight",
      }),
      /assigned shift date/,
    );
    await assert.rejects(
      call(worker, "report_position", {
        shiftId: shift.shiftId,
        latitude: -22.6,
        longitude: 17.08,
        accuracyM: 10,
      }),
      /Location window is closed/,
    );
    await assert.rejects(
      call(worker, "start_workday", {
        id: randomUUID(),
        expectedEnd: "23:59",
      }),
      /OTHER_SHIFT_OPEN/,
    );
    // Failed new-day clock-in rolls its provisional workday back atomically.
    assert.equal((await call(worker, null)).shifts.length, 1);
  } finally {
    await db.close();
  }
});
