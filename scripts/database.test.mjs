import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./local-api.mjs";
let db;
const manager = randomUUID(),
  employee = randomUUID(),
  outsider = randomUUID(),
  second = randomUUID();
let company, site, employeeId, shift, job, code, today;
const call = (user, action, data = {}) => runRpc(db, user, action, data);
before(async () => {
  db = await createLocalDatabase();
  for (const id of [manager, employee, outsider, second])
    await db.query("insert into auth.users values($1)", [id]);
});
after(async () => await db.close());
test("real attendance and payroll workflow with tenant and role isolation", async () => {
  const setup = await call(manager, "setup", {
    company: "Test Company",
    name: "Team Manager",
    site: "North Yard",
    address: "14 Industrial Road",
    timezone: "Africa/Windhoek",
  });
  company = setup.snapshot.company.id;
  site = setup.snapshot.sites[0].id;
  today = setup.snapshot.today;
  const invitation = await call(manager, "create_employee", {
    name: "Employee One",
    no: "1042",
    team: "Services",
    siteId: site,
  });
  code = invitation.activationCode;
  employeeId = invitation.employeeId;
  assert.equal(code.length, 32);
  assert.equal(JSON.stringify(invitation.snapshot).includes(code), false);
  await call(employee, "activate", { employeeNo: "1042", code });
  await assert.rejects(
    call(outsider, "activate", { employeeNo: "1042", code }),
    /Invalid or expired/,
  );
  await assert.rejects(
    call(employee, "create_employee", { name: "Intruder", no: "9", siteId: site }),
    /Manager access required/,
  );
  await assert.rejects(
    call(manager, "assign_shift", {
      employeeId,
      siteId: site,
      date: today,
      start: "17:00",
      end: "08:00",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 480,
    }),
  );
  const assignment = await call(manager, "assign_shift", {
    employeeId,
    siteId: site,
    date: today,
    start: "08:00",
    end: "17:00",
    lunch: "12:00",
    lunchMinutes: 60,
    regularMinutes: 480,
  });
  shift = assignment.snapshot.shifts[0].id;
  const assignedJob = await call(manager, "create_job", {
    shiftId: shift,
    title: "Pump inspection",
    destination: "Riverside Plant",
    instructions: "Check valves",
    start: "14:00",
    end: "15:00",
  });
  job = assignedJob.snapshot.jobs[0].id;
  await assert.rejects(
    call(employee, "transition", { id: randomUUID(), type: "clock_out" }),
    /not allowed/,
  );
  const id = randomUUID();
  await call(employee, "transition", { id, type: "clock_in" });
  const duplicate = await call(employee, "transition", { id, type: "clock_in" });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.snapshot.events.length, 1);
  await assert.rejects(
    call(employee, "transition", { id, type: "start_lunch" }),
    /Event ID conflict/,
  );
  await assert.rejects(
    call(employee, "transition", { id: randomUUID(), type: "clock_in" }),
    /not allowed/,
  );
  await call(employee, "transition", { id: randomUUID(), type: "start_lunch" });
  await assert.rejects(
    call(employee, "transition", { id: randomUUID(), type: "clock_out" }),
    /not allowed/,
  );
  await call(employee, "transition", { id: randomUUID(), type: "end_lunch" });
  await call(employee, "transition", { id: randomUUID(), type: "start_job", jobId: job });
  await call(employee, "transition", { id: randomUUID(), type: "end_job" });
  await call(employee, "transition", {
    id: randomUUID(),
    type: "start_personal",
    reason: "emergency",
    note: "Emergency",
  });
  const departure = await call(employee, null);
  assert.equal(departure.requests.length, 1);
  assert.equal(departure.requests[0].kind, "emergency");
  assert.equal(departure.requests[0].detail, "");
  await call(employee, "transition", { id: randomUUID(), type: "end_personal" });
  await call(employee, "transition", { id: randomUUID(), type: "clock_out" });
  // Set a deterministic recorded fixture through the DB owner, not through the public API.
  const events = (
    await db.query("select id,type from public.sl_events where shift_id=$1 order by seq", [shift])
  ).rows;
  const offsets = [0, 240, 300, 360, 420, 435, 450, 570];
  await db.exec("alter table public.sl_events disable trigger sl_events_immutable");
  for (let i = 0; i < events.length; i++)
    await db.query(
      "update public.sl_events set captured_at=($1::date+time '08:00') at time zone 'Africa/Windhoek' + $2::int * interval '1 minute' where id=$3",
      [today, offsets[i], events[i].id],
    );
  await db.exec("alter table public.sl_events enable trigger sl_events_immutable");
  const finished = await call(employee, null);
  const totals = finished.shifts[0].totals;
  assert.equal(totals.recordedMinutes, 495);
  assert.equal(totals.lunchMinutes, 60);
  assert.equal(totals.personalMinutes, 15);
  assert.equal(totals.regularMinutes, 480);
  await assert.rejects(
    call(employee, "submit_timesheet", { shiftId: shift, overtimeMinutes: 16 }),
    /exceeds/,
  );
  await call(employee, "submit_timesheet", { shiftId: shift, overtimeMinutes: 15 });
  await assert.rejects(
    call(employee, "approve_timesheet", { shiftId: shift, overtimeMinutes: 15 }),
    /Manager access required/,
  );
  await assert.rejects(
    call(manager, "lock_period", { start: today, end: today }),
    /complete and approved/,
  );
  await call(manager, "approve_timesheet", { shiftId: shift, overtimeMinutes: 15 });
  const locked = await call(manager, "lock_period", { start: today, end: today });
  const period = locked.snapshot.periods[0].id;
  const exported = await call(manager, "export_period", { id: period });
  assert.equal(exported.rows[0].regular_seconds, 28800);
  assert.equal(exported.rows[0].overtime_seconds_approved, 900);
  await assert.rejects(call(manager, "lock_period", { start: today, end: today }), /overlaps/);
  await assert.rejects(
    call(manager, "assign_shift", {
      employeeId,
      siteId: site,
      date: today,
      start: "08:00",
      end: "17:00",
      lunch: "12:00",
      lunchMinutes: 60,
      regularMinutes: 480,
    }),
    /locked/,
  );
  await assert.rejects(call(employee, "export_period", { id: period }), /Manager access required/);
  const other = await call(outsider, "setup", {
    company: "Other Company",
    name: "Other Manager",
    site: "Other Site",
    timezone: "Africa/Windhoek",
  });
  assert.notEqual(other.snapshot.company.id, company);
  assert.equal(other.snapshot.employees.length, 1);
  assert.equal(other.snapshot.events.length, 0);
  assert.equal(
    other.snapshot.audit.some((a) => a.detail.includes(code)),
    false,
  );
  await assert.rejects(call(outsider, "export_period", { id: period }), /Choose a locked/);
  await assert.rejects(
    call(outsider, "create_job", {
      shiftId: shift,
      title: "Cross tenant",
      destination: "Site",
      start: "14:00",
      end: "15:00",
    }),
    /Assign a shift/,
  );
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select * from public.sl_events");
    }),
    /permission denied/,
  );
  await assert.rejects(call("", null), /Sign in first/);
  const own = await call(employee, null);
  assert.equal(own.employees.length, 1);
  assert.equal(own.audit.length, 0);
  assert.equal(own.employees[0].id, employeeId);
});
test("concurrent commands, expiring activation and payroll completeness", async () => {
  const invite = await call(manager, "create_employee", {
    name: "Employee Two",
    no: "1057",
    siteId: site,
  });
  await db.query(
    "update public.sl_employees set activation_expires=now()-interval '1 minute' where id=$1",
    [invite.employeeId],
  );
  await assert.rejects(
    call(second, "activate", { employeeNo: "1057", code: invite.activationCode }),
    /expired/,
  );
  const renewed = await call(manager, "issue_activation", { employeeId: invite.employeeId });
  await call(second, "activate", { employeeNo: "1057", code: renewed.activationCode });
  const tomorrow = (await db.query("select ($1::date+1)::text as day", [today])).rows[0].day;
  const assign = await call(manager, "assign_shift", {
    employeeId: invite.employeeId,
    siteId: site,
    date: tomorrow,
    start: "08:00",
    end: "17:00",
    lunch: "12:00",
    lunchMinutes: 60,
    regularMinutes: 480,
  });
  const sh = assign.snapshot.shifts.find((s) => s.employeeId === invite.employeeId);
  await assert.rejects(
    call(second, "transition", { id: randomUUID(), type: "clock_in" }),
    /No shift/,
  );
  await assert.rejects(
    call(second, "submit_timesheet", { shiftId: sh.id, overtimeMinutes: 0 }),
    /Clock out/,
  );
  await assert.rejects(
    call(manager, "lock_period", { start: tomorrow, end: tomorrow }),
    /completed payroll/,
  );
  const results = await Promise.allSettled([
    call(second, "setup", {
      company: "Bad",
      name: "Bad",
      site: "Bad",
      timezone: "Africa/Windhoek",
    }),
    call(second, "setup", {
      company: "Bad",
      name: "Bad",
      site: "Bad",
      timezone: "Africa/Windhoek",
    }),
  ]);
  assert.ok(results.every((r) => r.status === "rejected"));
});

test("simultaneous clock-ins have one winner and retries do not add events", async () => {
  const user = randomUUID();
  await db.query("insert into auth.users values($1)", [user]);
  const inviter = await call(outsider, null);
  const otherSite = inviter.sites[0].id;
  const invitation = await call(outsider, "create_employee", {
    name: "Concurrent Employee",
    no: "2001",
    siteId: otherSite,
  });
  await call(user, "activate", { employeeNo: "2001", code: invitation.activationCode });
  await call(outsider, "assign_shift", {
    employeeId: invitation.employeeId,
    siteId: otherSite,
    date: today,
    start: "08:00",
    end: "17:00",
    lunch: "12:00",
    lunchMinutes: 60,
    regularMinutes: 480,
  });
  const ids = [randomUUID(), randomUUID()];
  const results = await Promise.allSettled(
    ids.map((id) => call(user, "transition", { id, type: "clock_in" })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const accepted = ids[results.findIndex((r) => r.status === "fulfilled")];
  const retry = await call(user, "transition", { id: accepted, type: "clock_in" });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.snapshot.events.length, 1);
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select public.sl_snapshot()");
    }),
    /permission denied/,
  );
});
