import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

test("incident context, review and private documents never rewrite attendance or cross companies", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID(),
      other = randomUUID(),
      unclocked = randomUUID();
    for (const id of [manager, worker, other, unclocked])
      await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Reports test",
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
      name: "Not working",
      no: "W2",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(unclocked, "activate", { employeeNo: "W2", code: invite2.activationCode });
    const outside = await call(other, "setup", {
      company: "Other",
      name: "Other manager",
      site: "Office",
      timezone: "UTC",
    });
    const started = await call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" });
    const shift = started.snapshot.shifts[0];
    const before = await db.query("select id,type,captured_at from sl_events order by id");
    await call(manager, "assign_shift", {
      employeeId: invite2.employeeId,
      siteId: setup.snapshot.sites[0].id,
      date: setup.snapshot.today,
      start: "00:00",
      end: "23:59",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 480,
    });
    const incident = {
      id: randomUUID(),
      kind: "power_outage",
      title: "Power outage",
      description: "Management authorizes early release; pay treatment requires a separate review.",
      startsLocal: `${setup.snapshot.today}T00:00`,
      endsLocal: `${setup.snapshot.today}T23:59`,
      scope: "company",
      target: "",
    };
    const reported = await call(manager, "create_incident", incident);
    assert.equal(reported.snapshot.incidentExceptions.length, 1);
    const link = reported.snapshot.incidentExceptions[0];
    assert.equal(link.shift_id, shift.id);
    assert.equal(link.status, "pending");
    assert.equal((await call(worker, null)).incidents.length, 1);
    assert.equal((await call(other, null)).incidents.length, 0);
    assert.equal((await call(unclocked, null)).incidentExceptions.length, 0);
    const outsideWindow = await call(manager, "create_incident", {
      ...incident,
      id: randomUUID(),
      title: "Earlier disruption",
      startsLocal: new Date(started.snapshot.events[0].capturedAt - 120000)
        .toISOString()
        .slice(0, 19),
      endsLocal: new Date(started.snapshot.events[0].capturedAt - 60000).toISOString().slice(0, 19),
    });
    assert.equal(outsideWindow.snapshot.incidentExceptions.length, 1);
    assert.equal((await call(manager, "create_incident", incident)).snapshot.incidents.length, 2);
    await assert.rejects(
      call(worker, "create_incident", { ...incident, id: randomUUID() }),
      /Manager/,
    );
    await assert.rejects(
      call(other, "review_incident_exception", {
        id: link.id,
        decision: "explained",
        reason: "Cannot review",
      }),
      /Unknown review/,
    );
    const review = {
      id: link.id,
      decision: "explained",
      reason: "Outage explains the disruption; no pay adjustment approved.",
    };
    const reviewed = await call(manager, "review_incident_exception", review);
    assert.equal(reviewed.snapshot.incidentExceptions[0].status, "explained");
    await call(manager, "review_incident_exception", review);
    await assert.rejects(
      call(manager, "review_incident_exception", { ...review, decision: "dismissed" }),
      /already reviewed/,
    );
    assert.deepEqual(
      (await db.query("select id,type,captured_at from sl_events order by id")).rows,
      before.rows,
    );
    assert.deepEqual(
      reviewed.snapshot.shifts.find((item) => item.id === shift.id).totals,
      started.snapshot.shifts[0].totals,
    );
    await assert.rejects(
      db.query("update sl_incidents set title=$1 where id=$2", ["Changed", incident.id]),
      /Append-only/,
    );
    const document = {
      id: randomUUID(),
      incidentId: incident.id,
      filename: "report.txt",
      mimeType: "text/plain",
      sizeBytes: 10,
    };
    const reserved = await call(manager, "reserve_report_document", document);
    const path = reserved.snapshot.reportDocuments[0].object_path;
    assert.equal((await call(worker, null)).reportDocuments.length, 0);
    await assert.rejects(
      call(other, "reserve_report_document", { ...document, id: randomUUID() }),
      /Unknown incident/,
    );
    await assert.rejects(call(manager, "finish_report_document", { id: document.id }), /missing/);
    const store = (user) =>
      db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("set local role authenticated");
        return tx.query(
          "insert into storage.objects(bucket_id,name,metadata) values('shiftline-reports',$1,$2)",
          [path, JSON.stringify({ size: 10, mimetype: "text/plain" })],
        );
      });
    await assert.rejects(store(worker), /row-level security/);
    await assert.rejects(store(other), /row-level security/);
    await store(manager);
    const done = await call(manager, "finish_report_document", { id: document.id });
    assert.equal(done.snapshot.reportDocuments[0].status, "ready");
    await call(manager, "finish_report_document", { id: document.id });
    await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [worker]);
      await tx.exec("set local role authenticated");
      assert.equal((await tx.query("select * from storage.objects")).rows.length, 0);
    });
    await assert.rejects(
      db.query("update sl_report_documents set filename=$1 where id=$2", ["Changed", document.id]),
      /immutable/,
    );
    await assert.rejects(
      call(manager, "create_incident", {
        ...incident,
        id: randomUUID(),
        scope: "employee",
        target: outside.snapshot.me,
      }),
      /affected active/,
    );
  } finally {
    await db.close();
  }
});

test("worker departure, arrival, inspection and return reuse attendance without inventing work", async () => {
  const db = await createLocalDatabase();
  try {
    const manager = randomUUID(),
      worker = randomUUID();
    for (const id of [manager, worker]) await db.query("insert into auth.users values($1)", [id]);
    const call = (user, action, data) => runRpc(db, user, action, data);
    const setup = await call(manager, "setup", {
      company: "Activity test",
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
    const started = await call(worker, "start_workday", { id: randomUUID(), expectedEnd: "23:59" });
    const shift = started.snapshot.shifts[0];
    const job = await call(manager, "create_job", {
      id: randomUUID(),
      shiftId: shift.id,
      title: "Setup",
      destination: "Venue",
      instructions: "Move equipment",
      start: shift.start,
      end: "23:59",
    });
    const jobId = job.snapshot.jobs[0].id;
    const activity = (kind) => ({
      id: randomUUID(),
      shiftId: shift.id,
      jobId,
      kind,
      description: "Confirmed by worker",
    });
    const depart = activity("leaving_site");
    const left = await call(worker, "record_work_activity", depart);
    assert.equal(left.snapshot.states[0].state, "on_job");
    const replay = await call(worker, "record_work_activity", depart);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.snapshot.events.length, left.snapshot.events.length);
    const arrived = await call(worker, "record_work_activity", activity("arrived_site"));
    assert.equal(arrived.snapshot.events.length, left.snapshot.events.length);
    await call(worker, "record_work_activity", activity("inspection"));
    await call(worker, "transition", { id: randomUUID(), type: "start_lunch" });
    await assert.rejects(
      call(worker, "record_work_activity", activity("other")),
      /only while working/,
    );
    await call(worker, "transition", { id: randomUUID(), type: "end_lunch" });
    const returned = await call(worker, "record_work_activity", activity("returning_office"));
    assert.equal(returned.snapshot.states[0].state, "working");
    assert.equal(returned.snapshot.jobs[0].status, "completed");
    assert.equal(returned.snapshot.workActivities.length, 4);
    assert.equal((await call(manager, null)).workActivities.length, 4);
    await assert.rejects(
      call(worker, "record_work_activity", { ...activity("leaving_site"), jobId: randomUUID() }),
      /not assigned/,
    );
    await assert.rejects(
      call(worker, "record_work_activity", { ...depart, description: "Changed" }),
      /ID conflict/,
    );
  } finally {
    await db.close();
  }
});
