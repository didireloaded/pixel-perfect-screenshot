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

    const threadId = sent.snapshot.messages[0].id;
    const replied = await call(worker, "reply_message", { threadId, body: "On my way" });
    assert.equal(replied.snapshot.messages.find((m) => m.body === "On my way").recipientId, setup.snapshot.me);
    assert.equal((await call(manager, null)).messages.filter((m) => m.threadId === threadId).length, 2);
    assert.equal((await call(teammate, null)).messages.length, 0);
    await assert.rejects(call(teammate, "reply_message", { threadId, body: "Intrude" }), /Conversation unavailable/);
    await assert.rejects(call(outsider, "reply_message", { threadId, body: "Intrude" }), /Conversation unavailable/);
    await assert.rejects(call(worker, "reply_message", { threadId, body: "   " }), /Message must be/);
    const workerReply = replied.snapshot.messages.find((m) => m.body === "On my way");
    assert.equal(workerReply.readAt, null);
    await call(worker, "read_message", { id: workerReply.id });
    assert.equal((await call(manager, null)).messages.find((m) => m.id === workerReply.id).readAt, null);
    await call(manager, "read_message", { id: workerReply.id });
    assert.ok((await call(manager, null)).messages.find((m) => m.id === workerReply.id).readAt);
    const managerReply = await call(manager, "reply_message", { threadId, body: "Thanks" });
    assert.equal(managerReply.snapshot.messages.find((m) => m.body === "Thanks").recipientId, one.employeeId);
    await assert.rejects(call(worker, "reply_message", { threadId: two.employeeId, body: "No" }), /Conversation unavailable/);

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
    const note = await call(manager, "add_manager_note", { title: "Site reminder", body: "Bring keys" });
    assert.equal(note.snapshot.managerNotes[0].title, "Site reminder");
    assert.deepEqual((await call(worker, null)).managerNotes, []);
    assert.deepEqual((await call(outsider, null)).managerNotes, []);
    await assert.rejects(call(worker, "add_manager_note", { title: "No", body: "No" }), /Manager access/);
    await call(worker, "add_job_comment", { jobId, body: "Valves checked" });
    const comment = (await call(manager, null)).jobComments.find((item) => item.body === "Valves checked");
    assert.equal(comment.authorName, "Worker");
    assert.equal((await call(worker, null)).jobComments.length, 1);
    assert.equal((await call(teammate, null)).jobComments.length, 0);
    assert.equal((await call(outsider, null)).jobComments.length, 0);
    await assert.rejects(call(teammate, "add_job_comment", { jobId, body: "Intrude" }), /Job unavailable/);
    await assert.rejects(call(outsider, "add_job_comment", { jobId, body: "Intrude" }), /Job unavailable/);
    await call(manager, "delete_manager_note", { id: note.snapshot.managerNotes[0].id });
    assert.equal((await call(manager, null)).managerNotes.length, 0);
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

test("worksite map shows only recent active presence and never worker coordinates", async () => {
  const db = await createLocalDatabase();
  const manager = randomUUID(), worker = randomUUID(), outsider = randomUUID();
  try {
    for (const id of [manager, worker, outsider]) await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", { company: "Map Test", name: "Manager", site: "Yard", timezone: "Africa/Windhoek" });
    const siteId = setup.snapshot.sites[0].id;
    const employee = await call(manager, "create_employee", { name: "Worker", no: "W-1", siteId });
    await call(worker, "activate", { employeeNo: "W-1", code: employee.activationCode });
    await call(outsider, "setup", { company: "Other", name: "Other", site: "Elsewhere", timezone: "Africa/Windhoek" });
    await call(manager, "set_geofence", { siteId, mode: "validate", latitude: -22.56, longitude: 17.08, radiusM: 150, maxAccuracyM: 100 });
    const shift = await call(manager, "assign_shift", { employeeId: employee.employeeId, siteId, date: setup.snapshot.today, start: "00:00", end: "23:59", lunch: "12:00", lunchMinutes: 60, regularMinutes: 480 });
    const shiftId = shift.snapshot.shifts.find((item) => item.employeeId === employee.employeeId).id;
    await db.query("insert into public.sl_events(id,company_id,employee_id,shift_id,type) values($1,$2,$3,$4,'clock_in')", [randomUUID(), setup.snapshot.company.id, employee.employeeId, shiftId]);
    const reported = await call(worker, "report_position", { shiftId, latitude: -22.56, longitude: 17.08, accuracyM: 15, source: "web" });
    assert.equal(reported.status, "inside_or_unchanged");
    const snapshot = await call(manager, null);
    assert.equal(snapshot.sitePresence.length, 1);
    assert.equal(snapshot.sitePresence[0].inside, true);
    assert.equal("latitude" in snapshot.sitePresence[0], false);
    assert.deepEqual((await call(worker, null)).sitePresence, []);
    assert.deepEqual((await call(outsider, null)).sitePresence, []);
    await db.query("update public.sl_site_presence set checked_at=clock_timestamp()-interval '4 minutes' where employee_id=$1", [employee.employeeId]);
    assert.deepEqual((await call(manager, null)).sitePresence, []);
  } finally { await db.close(); }
});
