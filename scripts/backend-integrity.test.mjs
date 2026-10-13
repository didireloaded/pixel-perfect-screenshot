import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

async function fixture() {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    worker = randomUUID(),
    teammate = randomUUID(),
    outsider = randomUUID();
  for (const id of [manager, worker, teammate, outsider])
    await db.query("insert into auth.users values($1)", [id]);
  const call = (user, action, data = {}) => runRpc(db, user, action, data);
  const setup = await call(manager, "setup", {
    company: "Integrity",
    name: "Manager",
    site: "Yard",
    timezone: "Africa/Windhoek",
  });
  const other = await call(outsider, "setup", {
    company: "Other",
    name: "Other Manager",
    site: "Other Yard",
    timezone: "Africa/Windhoek",
  });
  const siteId = setup.snapshot.sites[0].id,
    companyId = setup.snapshot.company.id;
  const one = await call(manager, "create_employee", { name: "Worker", no: "W-1", siteId });
  const two = await call(manager, "create_employee", { name: "Teammate", no: "W-2", siteId });
  await call(worker, "activate", { employeeNo: "W-1", code: one.activationCode });
  await call(teammate, "activate", { employeeNo: "W-2", code: two.activationCode });
  for (const employeeId of [one.employeeId, two.employeeId])
    await call(manager, "assign_shift", {
      employeeId,
      siteId,
      date: setup.snapshot.today,
      start: "00:00",
      end: "23:59",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 480,
    });
  const snapshot = await call(manager, null);
  const shiftId = snapshot.shifts.find((s) => s.employeeId === one.employeeId).id;
  const otherShift = snapshot.shifts.find((s) => s.employeeId === two.employeeId).id;
  return {
    db,
    call,
    manager,
    worker,
    teammate,
    outsider,
    setup,
    other,
    one,
    two,
    siteId,
    companyId,
    shiftId,
    otherShift,
  };
}

test("SQL rejects cross-company links, wrong shift ownership, invalid events and rewritten evidence", async () => {
  const f = await fixture();
  const { db, call, manager, worker, one, two, other, companyId, shiftId, otherShift } = f;
  try {
    await assert.rejects(
      db.query(
        "insert into public.sl_employees(company_id,no,name,site_id,role) values($1,'BAD','Bad',$2,'employee')",
        [companyId, other.snapshot.sites[0].id],
      ),
      (e) => e.code === "23503",
    );
    await assert.rejects(
      db.query(
        "insert into public.sl_messages(company_id,recipient_id,sender_id,title,body) values($1,$2,$3,'Bad','Bad')",
        [companyId, one.employeeId, other.snapshot.me],
      ),
      (e) => e.code === "23503",
    );
    await assert.rejects(
      db.query(
        "insert into public.sl_events(id,company_id,employee_id,shift_id,type) values($1,$2,$3,$4,'clock_in')",
        [randomUUID(), companyId, one.employeeId, otherShift],
      ),
      /ownership mismatch/,
    );
    await assert.rejects(
      db.query(
        "insert into public.sl_events(id,company_id,employee_id,shift_id,type) values($1,$2,$3,$4,'clock_out')",
        [randomUUID(), companyId, one.employeeId, shiftId],
      ),
      /Invalid attendance transition/,
    );
  } finally {
    await db.close();
  }
});

test("team collaboration, strict RPC payloads and break privacy use the real shared backend", async () => {
  const f = await fixture();
  const { db, call, manager, worker, teammate, outsider, one, two, siteId, companyId, shiftId } = f;
  try {
    for (const payload of [null, [], "bad", { body: "x".repeat(17000) }])
      await assert.rejects(call(manager, "add_manager_note", payload), /Invalid command payload/);
    await assert.rejects(call(manager, "", {}), /Invalid command payload/);
    const job = await call(manager, "create_job", {
      shiftId,
      title: "Inspection",
      destination: "Gate A",
      start: "00:00",
      end: "23:59",
    });
    const jobId = job.snapshot.jobs[0].id;
    await call(manager, "add_job_member", { jobId, employeeId: two.employeeId });
    await call(manager, "add_job_step", { jobId, label: "Check gate" });
    const assigned = await call(teammate, null);
    assert.equal(assigned.schemaVersion, 11);
    assert.equal(assigned.jobs.length, 1);
    assert.equal(
      assigned.shifts.every((s) => s.employeeId === two.employeeId),
      true,
    );
    assert.equal(assigned.jobTeam.length, 2);
    const stepId = assigned.jobSteps[0].id;
    await call(teammate, "set_job_step_done", { stepId, done: true });
    assert.ok((await call(worker, null)).jobSteps[0].completedAt);
    await assert.rejects(
      call(teammate, "set_job_step_done", { stepId, done: null }),
      /Choose whether/,
    );
    await call(teammate, "add_job_comment", { jobId, body: "Checked" });
    assert.equal((await call(manager, null)).jobComments.length, 1);
    assert.equal((await call(outsider, null)).jobs.length, 0);
    await assert.rejects(
      call(outsider, "set_job_step_done", { stepId, done: true }),
      /Unknown job step/,
    );
    await call(manager, "set_geofence", {
      siteId,
      mode: "validate",
      latitude: -22.56,
      longitude: 17.08,
      radiusM: 150,
      maxAccuracyM: 100,
    });
    const location = { latitude: -22.56, longitude: 17.08, accuracyM: 15 };
    const id = randomUUID();
    await call(worker, "transition", { id, type: "clock_in", location });
    await assert.rejects(
      db.query("update public.sl_submissions set payload='{}' where id=$1", [id]),
      /evidence is immutable/,
    );
    await assert.rejects(
      db.query("delete from public.sl_submissions where id=$1", [id]),
      /cannot be deleted/,
    );
    await assert.rejects(
      db.query("update public.sl_events set note=$1 where id=$2", ["altered", id]),
      /Append-only/,
    );
    await call(worker, "report_position", { shiftId, ...location, source: "web" });
    assert.equal((await call(manager, null)).sitePresence.length, 1);
    const lunch = randomUUID();
    await call(worker, "transition", { id: lunch, type: "start_lunch", location });
    assert.equal(
      (await db.query("select payload from public.sl_submissions where id=$1", [lunch])).rows[0]
        .payload.location,
      null,
    );
    assert.equal(
      (
        await db.query("select count(*)::int n from public.sl_site_presence where employee_id=$1", [
          one.employeeId,
        ])
      ).rows[0].n,
      0,
    );
    await assert.rejects(call(worker, "report_position", { shiftId, ...location }), /paused/);
    await call(worker, "transition", { id: randomUUID(), type: "end_lunch", location });
    await call(manager, "set_job_status", {
      jobId,
      status: "in_progress",
      expectedStatus: "assigned",
    });
    await call(worker, "transition", { id: randomUUID(), type: "start_job", jobId });
    await call(worker, "transition", { id: randomUUID(), type: "end_job" });
    await call(worker, "transition", { id: randomUUID(), type: "clock_out", location });
    const evidence = (
      await db.query("select payload from public.sl_submissions where employee_id=$1 and id<>$2", [
        one.employeeId,
        id,
      ])
    ).rows;
    assert.ok(evidence.every((s) => s.payload.location === null));
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query("select * from public.sl_events");
      }),
      /permission denied/,
    );
    const notice = await call(manager, "create_notice", {
      kind: "announcement",
      title: "Briefing",
      startsOn: f.setup.snapshot.today,
      endsOn: f.setup.snapshot.today,
    });
    await assert.rejects(
      db.query("insert into public.sl_notice_acks(notice_id,employee_id) values($1,$2)", [
        notice.snapshot.notices[0].id,
        f.other.snapshot.me,
      ]),
      /same company/,
    );
    assert.equal((await call(manager, null)).company.id, companyId);
  } finally {
    await db.close();
  }
});
