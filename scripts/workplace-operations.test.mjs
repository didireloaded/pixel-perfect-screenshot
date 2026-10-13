import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
async function fixture() {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    worker = randomUUID(),
    outsider = randomUUID();
  for (const user of [manager, worker, outsider])
    await db.query("insert into auth.users values($1)", [user]);
  const call = (user, action, data) => runRpc(db, user, action, data);
  const setup = await call(manager, "setup", {
    company: "Workplace test",
    name: "Manager",
    site: "Office",
    timezone: "UTC",
  });
  const site = setup.snapshot.sites[0].id;
  const invite = await call(manager, "create_employee", { name: "Worker", no: "W1", siteId: site });
  await call(worker, "activate", { employeeNo: "W1", code: invite.activationCode });
  await call(outsider, "setup", {
    company: "Other",
    name: "Other Manager",
    site: "Other office",
    timezone: "UTC",
  });
  await call(manager, "set_geofence", {
    siteId: site,
    mode: "notify",
    latitude: -22.6226793,
    longitude: 17.087781,
    radiusM: 150,
    maxAccuracyM: 100,
  });
  const shift = await call(manager, "assign_shift", {
    employeeId: invite.employeeId,
    siteId: site,
    date: setup.snapshot.today,
    start: "00:00",
    end: "23:59",
    lunch: "12:00",
    lunchMinutes: 60,
    regularMinutes: 480,
  });
  const jobPayload = {
    id: randomUUID(),
    shiftId: shift.shiftId,
    title: "Inspection",
    destination: "Job site",
    instructions: "Check equipment",
    start: "00:00",
    end: "23:59",
    latitude: -22.65,
    longitude: 17.12,
    radiusM: 150,
    lunchOption: "scheduled",
    overtime: true,
  };
  const job = await call(manager, "create_job", jobPayload);
  const replay = await call(manager, "create_job", jobPayload);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.snapshot.jobs.length, 1);
  const jobId = job.snapshot.jobs[0].id;
  const position = {
    shiftId: shift.shiftId,
    latitude: -22.6226793,
    longitude: 17.087781,
    accuracyM: 10,
  };
  const transition = (type) => call(worker, "transition", { id: randomUUID(), type, jobId });
  return {
    db,
    call,
    manager,
    worker,
    outsider,
    site,
    shiftId: shift.shiftId,
    employeeId: invite.employeeId,
    jobId,
    position,
    transition,
  };
}
test("on-job lunch clears location, retains job context, resumes the job and completes only on return", async () => {
  const f = await fixture();
  try {
    await f.transition("clock_in");
    await f.call(f.worker, "report_position", f.position);
    let snap = await f.call(f.manager, null);
    assert.equal(snap.sitePresence[0].latitude, f.position.latitude);
    assert.deepEqual((await f.call(f.worker, null)).sitePresence, []);
    await f.transition("start_job");
    assert.equal((await f.call(f.manager, null)).sitePresence.length, 0);
    let result = await f.call(f.worker, "report_position", {
      ...f.position,
      latitude: -22.65,
      longitude: 17.12,
    });
    snap = await f.call(f.manager, null);
    assert.equal(snap.sitePresence[0].inside, true);
    assert.equal(snap.sitePresence[0].jobId, f.jobId);
    assert.equal(result.status, "inside_or_unchanged");
    result = await f.call(f.worker, "report_position", f.position);
    assert.equal(result.status, "exit");
    await assert.rejects(
      f.call(f.manager, "set_job_status", {
        jobId: f.jobId,
        status: "completed",
        expectedStatus: "in_progress",
      }),
      /still on the job/,
    );
    await f.transition("start_lunch");
    snap = await f.call(f.manager, null);
    assert.equal(snap.jobs[0].status, "in_progress");
    await assert.rejects(
      f.call(f.manager, "set_job_status", { jobId: f.jobId, status: "assigned" }),
      /still on the job/,
    );
    assert.equal(snap.states[0].state, "on_lunch");
    assert.equal(snap.sitePresence.length, 0);
    assert.equal((await f.db.query("select count(*)::int n from sl_site_presence")).rows[0].n, 0);
    await assert.rejects(f.call(f.worker, "report_position", f.position), /paused/);
    await f.transition("end_lunch");
    snap = await f.call(f.manager, null);
    assert.equal(snap.states[0].state, "on_job");
    assert.equal(snap.events.find((e) => e.type === "end_lunch").jobId, f.jobId);
    await f.call(f.worker, "report_position", {
      ...f.position,
      latitude: -22.65,
      longitude: 17.12,
    });
    await f.transition("end_job");
    snap = await f.call(f.manager, null);
    assert.equal(snap.jobs[0].status, "completed");
    assert.equal(snap.states[0].state, "working");
    assert.equal(snap.sitePresence.length, 0);
    await f.transition("clock_out");
    await assert.rejects(f.call(f.worker, "report_position", f.position), /paused/);
  } finally {
    await f.db.close();
  }
});
test("positions expire, are isolated and reject bad location evidence", async () => {
  const f = await fixture();
  try {
    await f.transition("clock_in");
    for (const patch of [
      { latitude: 91 },
      { longitude: -181 },
      { accuracyM: -1 },
      { accuracyM: 101 },
      { accuracyM: "NaN" },
      { latitude: "NaN" },
      { latitude: null },
    ])
      await assert.rejects(f.call(f.worker, "report_position", { ...f.position, ...patch }));
    await assert.rejects(f.call(f.outsider, "report_position", f.position), /Unknown shift/);
    await f.call(f.worker, "report_position", f.position);
    assert.deepEqual((await f.call(f.outsider, null)).sitePresence, []);
    await f.db.query("update sl_site_presence set checked_at=now()-interval '4 minutes'");
    assert.equal((await f.call(f.manager, null)).sitePresence.length, 0);
    await f.db.query("select shiftline_private.prune_positions()");
    assert.equal((await f.db.query("select count(*)::int n from sl_site_presence")).rows[0].n, 0);
    await f.call(f.worker, "report_position", f.position);
    await f.call(f.worker, "clear_position", {});
    assert.equal((await f.call(f.manager, null)).sitePresence.length, 0);
  } finally {
    await f.db.close();
  }
});
test("job briefs and employee profiles persist with manager and tenant permissions", async () => {
  const f = await fixture();
  try {
    const profile = {
      employeeId: f.employeeId,
      name: "Worker Name",
      department: "HR",
      jobTitle: "Coordinator",
      bio: "Helps the team",
      photoUrl: "https://example.com/photo.jpg",
    };
    await assert.rejects(f.call(f.worker, "update_employee_profile", profile), /Manager access/);
    await assert.rejects(
      f.call(f.outsider, "update_employee_profile", profile),
      /Unknown employee/,
    );
    await f.call(f.manager, "update_employee_profile", profile);
    const me = (await f.call(f.worker, null)).employees[0];
    assert.equal(me.team, "HR");
    assert.equal(me.bio, profile.bio);
    assert.equal(me.jobTitle, profile.jobTitle);
    assert.equal(me.role, "employee");
    await assert.rejects(
      f.call(f.manager, "update_employee_profile", { ...profile, photoUrl: "javascript:alert(1)" }),
      /HTTPS/,
    );
    const brief = {
      jobId: f.jobId,
      latitude: -22.66,
      longitude: 17.13,
      radiusM: 200,
      lunchOption: "none",
      overtime: false,
    };
    await assert.rejects(f.call(f.worker, "configure_job", brief), /Manager access/);
    await assert.rejects(f.call(f.outsider, "configure_job", brief), /Unknown job/);
    await f.call(f.manager, "configure_job", brief);
    let job = (await f.call(f.worker, null)).jobs[0];
    assert.equal(job.lunchOption, "none");
    assert.equal(job.overtime, false);
    assert.equal(job.latitude, -22.66);
    await f.transition("clock_in");
    await f.transition("start_job");
    await assert.rejects(f.call(f.manager, "configure_job", brief), /before the job starts/);
    await assert.rejects(
      f.call(f.manager, "create_job", {
        shiftId: f.shiftId,
        title: "Invalid",
        destination: "Office",
        start: "12:00",
        end: "11:00",
      }),
      /valid job/,
    );
  } finally {
    await f.db.close();
  }
});
