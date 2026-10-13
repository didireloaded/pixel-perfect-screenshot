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
