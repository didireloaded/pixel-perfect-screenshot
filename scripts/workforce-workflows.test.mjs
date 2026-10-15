import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

test("workplace pin, multi-day job and worker-initiated private conversation", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      other = randomUUID();
    for (const id of [owner, worker, other])
      await db.query("insert into auth.users(id) values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(owner, "setup", {
      company: "Workforce test",
      name: "Owner",
      site: "Office",
      address: "Confirmed test workplace",
      timezone: "UTC",
      latitude: -22.5,
      longitude: 17.1,
    });
    assert.equal(setup.snapshot.sites[0].latitude, -22.5);
    const invite = await call(owner, "create_employee", {
      name: "Lighting tech",
      no: "TECH",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "TECH", code: invite.activationCode });
    await call(other, "setup", { company: "Other", name: "Other", site: "Other", timezone: "UTC" });
    const message = await call(worker, "send_message", {
      recipientId: setup.snapshot.me,
      title: "Travel",
      body: "When does the crew leave?",
    });
    const root = message.snapshot.messages[0];
    assert.equal(root.senderId, invite.employeeId);
    const response = await call(owner, "reply_message", {
      threadId: root.id,
      body: "Tomorrow morning.",
    });
    assert.equal(response.snapshot.messages.length, 2);
    assert.equal((await call(worker, null)).messages.length, 2);
    assert.equal((await call(other, null)).messages.length, 0);
    await assert.rejects(
      call(other, "reply_message", { threadId: root.id, body: "Intrusion" }),
      /Conversation unavailable/,
    );
    const day = setup.snapshot.today;
    const offset = (days) =>
      new Date(Date.parse(`${day}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const plan = {
      id: randomUUID(),
      date: offset(-1),
      endDate: offset(2),
      title: "Coastal event",
      details: "Build stage",
      employeeIds: [invite.employeeId, setup.snapshot.me],
      address: "Confirmed coast pin",
      latitude: -22.8,
      longitude: 14.55,
      radiusM: 150,
      returnToOffice: false,
      lunchGuidance: "Crew agrees break time with supervisor",
    };
    const created = await call(owner, "create_calendar_job", plan);
    assert.equal(created.snapshot.calendarJobs[0].endDate, plan.endDate);
    assert.equal(created.snapshot.calendarJobs[0].returnToOffice, false);
    assert.equal((await call(owner, "create_calendar_job", plan)).duplicate, true);
    await assert.rejects(
      call(owner, "create_calendar_job", { ...plan, endDate: offset(3) }),
      /details ID conflict/,
    );
    await call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" });
    const startId = randomUUID();
    const started = await call(worker, "start_calendar_job", {
      id: startId,
      calendarJobId: plan.id,
    });
    assert.equal(started.snapshot.states[0].state, "on_job");
    assert.equal(started.snapshot.jobs[0].destination, plan.address);
    assert.equal(
      (await call(worker, "start_calendar_job", { id: startId, calendarJobId: plan.id })).duplicate,
      true,
    );
    await call(worker, "transition", { id: randomUUID(), type: "start_lunch" });
    await call(worker, "transition", { id: randomUUID(), type: "end_lunch" });
    assert.equal((await call(worker, null)).states[0].state, "on_job");
    await assert.rejects(call(worker, "complete_calendar_job", { id: plan.id }), /Manager access/);
    await call(owner, "complete_calendar_job", { id: plan.id });
    assert.ok((await call(worker, null)).calendarJobs[0].completedAt);
    await call(worker, "transition", { id: randomUUID(), type: "end_job" });
    await assert.rejects(
      call(worker, "start_calendar_job", { id: randomUUID(), calendarJobId: plan.id }),
      /planned dates/,
    );
  } finally {
    await db.close();
  }
});
