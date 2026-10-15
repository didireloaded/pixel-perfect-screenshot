import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("general jobs need no shifts; starting attaches verified destinations to actual attendance", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID(),
      otherWorker = randomUUID(),
      outsider = randomUUID();
    for (const id of [manager, worker, otherWorker, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, payload) => runRpc(db, user, action, payload);
    const setup = await call(manager, "setup", {
      company: "Plan test",
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
    const invite2 = await call(manager, "create_employee", {
      name: "Other worker",
      no: "W2",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(otherWorker, "activate", { employeeNo: "W2", code: invite2.activationCode });
    await call(outsider, "setup", {
      company: "Other",
      name: "Other",
      site: "Other",
      timezone: "UTC",
    });
    const plan = {
      id: randomUUID(),
      date: setup.snapshot.today,
      title: "Stage setup",
      details: "Full confirmed instructions ".repeat(60),
      employeeIds: [],
      address: "Confirmed stadium pin",
      latitude: -22.62,
      longitude: 17.09,
      radiusM: 150,
    };
    const created = await call(manager, "create_calendar_job", plan);
    assert.equal(created.snapshot.shifts.length, 0);
    assert.equal(created.snapshot.jobs.length, 0);
    assert.equal(created.snapshot.calendarJobs[0].latitude, plan.latitude);
    assert.equal((await call(worker, null)).calendarJobs[0].address, plan.address);
    assert.equal((await call(manager, "create_calendar_job", plan)).duplicate, true);
    await assert.rejects(
      call(manager, "create_calendar_job", { ...plan, latitude: -22.63 }),
      /location ID conflict/,
    );
    await assert.rejects(
      call(worker, "start_calendar_job", { id: randomUUID(), calendarJobId: plan.id }),
      /Clock in/,
    );
    const previousLocation = {
      address: plan.address,
      latitude: plan.latitude,
      longitude: plan.longitude,
      radiusM: plan.radiusM,
    };
    const change = {
      id: plan.id,
      address: plan.address,
      latitude: -22.63,
      longitude: plan.longitude,
      radiusM: 200,
      expected: previousLocation,
    };
    await assert.rejects(call(worker, "update_job_plan_location", change), /Manager access/);
    await assert.rejects(call(outsider, "update_job_plan_location", change), /Unknown job/);
    await call(manager, "update_job_plan_location", change);
    assert.equal((await call(manager, "update_job_plan_location", change)).duplicate, true);
    await assert.rejects(
      call(manager, "update_job_plan_location", { ...change, latitude: -22.64 }),
      /refresh before saving/,
    );
    plan.latitude = change.latitude;
    plan.radiusM = change.radiusM;
    await call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" });
    const payload = { id: randomUUID(), calendarJobId: plan.id };
    const start = await call(worker, "start_calendar_job", payload);
    assert.equal(start.snapshot.states[0].state, "on_job");
    assert.equal(start.snapshot.jobs[0].calendarJobId, plan.id);
    assert.equal(start.snapshot.jobs[0].latitude, plan.latitude);
    assert.equal(start.snapshot.jobs[0].instructions, plan.details.trim());
    await assert.rejects(
      call(manager, "update_job_plan_location", {
        ...change,
        latitude: -22.64,
        expected: {
          address: plan.address,
          latitude: plan.latitude,
          longitude: plan.longitude,
          radiusM: plan.radiusM,
        },
      }),
      /already started/,
    );
    const replay = await call(worker, "start_calendar_job", payload);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.snapshot.jobs.length, 1);
    assert.equal(replay.snapshot.events.length, start.snapshot.events.length);
    await call(worker, "transition", { id: randomUUID(), type: "start_lunch" });
    assert.equal((await call(worker, null)).states[0].state, "on_lunch");
    await call(worker, "transition", { id: randomUUID(), type: "end_lunch" });
    assert.equal((await call(worker, null)).states[0].state, "on_job");
    const restricted = { ...plan, id: randomUUID(), employeeIds: [invite.employeeId] };
    await call(manager, "create_calendar_job", restricted);
    await assert.rejects(
      call(otherWorker, "start_calendar_job", { id: randomUUID(), calendarJobId: restricted.id }),
      /not available/,
    );
    await assert.rejects(
      call(outsider, "start_calendar_job", { id: randomUUID(), calendarJobId: plan.id }),
      /not available/,
    );
    assert.equal((await call(manager, null)).jobs[0].destination, plan.address);
  } finally {
    await db.close();
  }
});
