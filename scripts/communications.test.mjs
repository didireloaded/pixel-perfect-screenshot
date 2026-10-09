import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./local-api.mjs";

test("manager messages, job progress, team and events remain scoped", async () => {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    worker = randomUUID(),
    teammate = randomUUID(),
    outsider = randomUUID();
  try {
    for (const id of [manager, worker, teammate, outsider])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Team Tests",
      name: "Manager",
      site: "Yard",
      timezone: "Africa/Windhoek",
    });
    const siteId = setup.snapshot.sites[0].id;
    const day = setup.snapshot.today;
    const one = await call(manager, "create_employee", { name: "Worker", no: "W-11", siteId });
    const two = await call(manager, "create_employee", { name: "Teammate", no: "W-12", siteId });
    await call(worker, "activate", { employeeNo: "W-11", code: one.activationCode });
    await call(teammate, "activate", { employeeNo: "W-12", code: two.activationCode });
    await call(outsider, "setup", {
      company: "Other",
      name: "Other Manager",
      site: "Elsewhere",
      timezone: "Africa/Windhoek",
    });
    await assert.rejects(
      call(worker, "send_message", { recipientId: two.employeeId, title: "No", body: "No" }),
      /Manager access/,
    );
    await assert.rejects(
      call(outsider, "send_message", { recipientId: one.employeeId, title: "No", body: "No" }),
      /Choose an employee/,
    );
    const sent = await call(manager, "send_message", {
      recipientId: one.employeeId,
      title: "Site update",
      body: "Meet at Gate B",
    });
    assert.equal(sent.snapshot.messages.length, 1);
    assert.equal(sent.snapshot.messages[0].body, "Meet at Gate B");
    assert.equal((await call(worker, null)).messages.length, 1);
    assert.equal((await call(teammate, null)).messages.length, 0);
    assert.equal((await call(outsider, null)).messages.length, 0);
    await call(teammate, "read_message", { id: sent.snapshot.messages[0].id });
    assert.equal((await call(worker, null)).messages[0].readAt, null);
    await call(worker, "read_message", { id: sent.snapshot.messages[0].id });
    assert.ok((await call(worker, null)).messages[0].readAt);

    const requested = await call(worker, "create_request", {
      kind: "leave",
      summary: "Family appointment",
      detail: "Friday afternoon",
    });
    const requestId = requested.snapshot.requests[0].id;
    await assert.rejects(call(worker, "mark_request_read", { id: requestId }), /No decision/);
    await call(manager, "review_request", {
      id: requestId,
      status: "approved",
      reason: "Approved",
    });
    assert.deepEqual((await call(worker, null)).readRequestIds, []);
    await assert.rejects(call(teammate, "mark_request_read", { id: requestId }), /No decision/);
    await call(worker, "mark_request_read", { id: requestId });
    await call(worker, "mark_request_read", { id: requestId });
    assert.deepEqual((await call(worker, null)).readRequestIds, [requestId]);

    const assigned = await call(manager, "assign_shift", {
      employeeId: one.employeeId,
      siteId,
      date: day,
      start: "08:00",
      end: "17:00",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 480,
    });
    const shiftId = assigned.snapshot.shifts.find((s) => s.employeeId === one.employeeId).id;
    const created = await call(manager, "create_job", {
      shiftId,
      title: "Pump inspection",
      destination: "Gate B",
      start: "13:00",
      end: "14:00",
    });
    const jobId = created.snapshot.jobs[0].id;
    await assert.rejects(
      call(worker, "add_job_step", { jobId, label: "Inspect valves" }),
      /Manager access/,
    );
    await call(manager, "add_job_step", { jobId, label: "Inspect valves" });
    await call(manager, "add_job_step", { jobId, label: "Record findings" });
    const step = (await call(worker, null)).jobSteps.find((s) => s.label === "Inspect valves");
    await call(worker, "set_job_step_done", { stepId: step.id, done: true });
    assert.equal((await call(worker, null)).jobSteps.filter((s) => s.completedAt).length, 1);
    await assert.rejects(
      call(teammate, "set_job_step_done", { stepId: step.id, done: true }),
      /Unknown job step/,
    );
    await call(manager, "add_job_member", { jobId, employeeId: two.employeeId });
    const team = (await call(worker, null)).jobTeam.filter((m) => m.jobId === jobId);
    assert.deepEqual(team.map((m) => m.name).sort(), ["Teammate", "Worker"]);
    await assert.rejects(
      call(worker, "create_event", { title: "Fake", startsOn: day, endsOn: day }),
      /Manager access/,
    );
    await call(manager, "create_event", {
      title: "Safety briefing",
      body: "Yard",
      startsOn: day,
      endsOn: day,
      startsTime: "09:00",
    });
    const event = (await call(worker, null)).notices.find((n) => n.kind === "event");
    assert.equal(event.startsTime, "09:00");
  } finally {
    await db.close();
  }
});
