import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";
test("overtime records the tap, excludes unapproved backdating and requires independent payroll review", async () => {
  const db = await createLocalDatabase();
  try {
    const owner = randomUUID(),
      worker = randomUUID(),
      outsider = randomUUID();
    for (const id of [owner, worker, outsider])
      await db.query("insert into auth.users(id) values($1)", [id]);
    const call = (user, action, data = {}) => runRpc(db, user, action, data);
    const setup = await call(owner, "setup", {
      company: "Overtime test",
      name: "Owner",
      site: "Office",
      timezone: "UTC",
    });
    const invite = await call(owner, "create_employee", {
      name: "Worker",
      no: "OT",
      siteId: setup.snapshot.sites[0].id,
    });
    await call(worker, "activate", { employeeNo: "OT", code: invite.activationCode });
    await call(outsider, "setup", {
      company: "Other",
      name: "Other",
      site: "Other",
      timezone: "UTC",
    });
    const contacts = (await call(worker, null)).messageContacts;
    assert.ok(contacts.some((contact) => contact.id === setup.snapshot.me));
    assert.ok(!contacts.some((contact) => contact.name === "Other"));
    assert.ok(!("phone" in contacts[0]));
    const shift = { id: randomUUID() };
    await db.query(
      "insert into public.sl_shifts(id,company_id,employee_id,site_id,date,start_time,end_time,lunch_time,lunch_minutes) values($1,$2,$3,$4,$5,'00:00','23:59','12:00',60)",
      [
        shift.id,
        setup.snapshot.company.id,
        invite.employeeId,
        setup.snapshot.sites[0].id,
        setup.snapshot.today,
      ],
    );
    await db.query(
      "insert into public.sl_timesheets(shift_id,company_id,employee_id) values($1,$2,$3)",
      [shift.id, setup.snapshot.company.id, invite.employeeId],
    );
    await db.query(
      "insert into public.sl_events(id,company_id,employee_id,shift_id,type,captured_at) values($1,$2,$3,$4,'clock_in',($5::date at time zone 'UTC'))",
      [randomUUID(), setup.snapshot.company.id, invite.employeeId, shift.id, setup.snapshot.today],
    );
    await assert.rejects(
      call(worker, "start_overtime", {
        shiftId: shift.id,
        id: randomUUID(),
        expectedEnd: "23:59",
        finishDay: "today",
      }),
      /planned finish/,
    );
    // Time fixture in an isolated database: normal work began at midnight and finished at 00:01.
    await db.query(
      "update public.sl_shifts set start_time='00:00',end_time='00:01',lunch_time='00:00' where id=$1",
      [shift.id],
    );
    const id = randomUUID();
    const payload = { id, shiftId: shift.id, expectedEnd: "23:59", finishDay: "today" };
    const started = await call(worker, "start_overtime", payload);
    const session = started.snapshot.overtimeSessions[0];
    assert.ok(Math.abs(Date.now() - Date.parse(session.startedAt)) < 10000);
    assert.equal(session.reviewStatus, "none");
    assert.equal((await call(worker, "start_overtime", payload)).duplicate, true);
    await assert.rejects(
      call(outsider, "finish_overtime", { shiftId: shift.id, id: randomUUID() }),
      /Unknown workday/,
    );
    const earlier = new Date(Date.parse(session.startedAt) - 60000).toISOString();
    await call(worker, "request_overtime_start", {
      shiftId: shift.id,
      startedAt: earlier,
      reason: "Supervisor requested extra setup work",
    });
    await assert.rejects(
      call(worker, "review_overtime_start", { shiftId: shift.id, decision: "approved" }),
      /Independent payroll/,
    );
    await assert.rejects(
      call(worker, "submit_timesheet", { shiftId: shift.id, overtimeMinutes: 1 }),
      /Resolve the overtime/,
    );
    const reviewed = await call(owner, "review_overtime_start", {
      shiftId: shift.id,
      decision: "approved",
    });
    assert.equal(reviewed.snapshot.overtimeSessions[0].startedAt, session.startedAt);
    assert.ok(reviewed.snapshot.overtimeSessions[0].recordedSeconds >= 60);
    const finished = await call(worker, "finish_overtime", { shiftId: shift.id, id: randomUUID() });
    assert.ok(finished.snapshot.overtimeSessions[0].endedAt);
    assert.equal(finished.snapshot.states[0].state, "clocked_out");
    await assert.rejects(
      call(worker, "submit_timesheet", { shiftId: shift.id, overtimeMinutes: 100 }),
      /recorded overtime/,
    );
    const submitted = await call(worker, "submit_timesheet", {
      shiftId: shift.id,
      overtimeMinutes: 1,
    });
    assert.equal(submitted.snapshot.timesheets[0].overtimeRequested, 1);
    assert.equal(submitted.snapshot.timesheets[0].status, "submitted");
  } finally {
    await db.close();
  }
});
