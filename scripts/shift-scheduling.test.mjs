import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

async function fixture() {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    worker = randomUUID(),
    outsider = randomUUID(),
    colleague = randomUUID();
  for (const id of [manager, worker, outsider, colleague])
    await db.query("insert into auth.users values($1)", [id]);
  const call = (user, action, data) => runRpc(db, user, action, data);
  const setup = await call(manager, "setup", {
    company: "Scheduling test",
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
  const company = setup.snapshot.company.id,
    site = setup.snapshot.sites[0].id;
  const invite = await call(manager, "create_employee", {
    name: "Worker",
    no: "W-1",
    siteId: site,
  });
  await call(worker, "activate", { employeeNo: "W-1", code: invite.activationCode });
  await db.query(
    "insert into public.sl_employees(company_id,user_id,no,name,site_id,role) values($1,$2,'M-2','Colleague',$3,'manager')",
    [company, colleague, site],
  );
  const payload = {
    employeeId: invite.employeeId,
    siteId: site,
    date: setup.snapshot.today,
    start: "08:00",
    end: "17:00",
    lunch: "12:00",
    lunchMinutes: 60,
    regularMinutes: 480,
  };
  return { db, call, manager, worker, outsider, colleague, setup, other, company, site, payload };
}

test("shift assignment retries and concurrent managers keep one shift, timesheet and audit entry", async () => {
  const f = await fixture();
  try {
    const [first, second] = await Promise.all([
      f.call(f.manager, "assign_shift", f.payload),
      f.call(f.colleague, "assign_shift", f.payload),
    ]);
    assert.equal(first.shiftId, second.shiftId);
    assert.equal(second.duplicate, true);
    assert.deepEqual(
      (
        await f.db.query(
          "select (select count(*)::int from public.sl_shifts where company_id=$1) shifts, (select count(*)::int from public.sl_timesheets where company_id=$1) sheets, (select count(*)::int from public.sl_audit where company_id=$1 and action='assign_shift') audits",
          [f.company],
        )
      ).rows[0],
      { shifts: 1, sheets: 1, audits: 1 },
    );
    await assert.rejects(
      f.call(f.manager, "assign_shift", { ...f.payload, start: "09:00" }),
      /already has a shift.*Open it in Calendar/,
    );
    const edited = await f.call(f.manager, "update_shift", {
      ...f.payload,
      start: "09:00",
      shiftId: first.shiftId,
      expected: f.payload,
    });
    assert.equal(edited.shiftId, first.shiftId);
    const seen = await f.call(f.worker, null);
    assert.equal(seen.shifts[0].start, "09:00");
    assert.equal(seen.shifts[0].id, first.shiftId);
    assert.equal(seen.timesheets[0].shiftId, first.shiftId);
    const retry = await f.call(f.manager, "update_shift", {
      ...f.payload,
      start: "09:00",
      shiftId: first.shiftId,
      expected: f.payload,
    });
    assert.equal(retry.duplicate, true);
    await assert.rejects(
      f.call(f.colleague, "update_shift", {
        ...f.payload,
        end: "18:00",
        shiftId: first.shiftId,
        expected: f.payload,
      }),
      /changed since you opened/,
    );
    assert.equal((await f.call(f.manager, null)).shifts[0].end, "17:00");
    const audit = (
      await f.db.query("select detail from public.sl_audit where action='update_shift'")
    ).rows[0].detail;
    assert.equal(audit.before.start, "08:00");
    assert.equal(audit.after.start, "09:00");
    assert.equal(
      (await f.db.query("select count(*)::int n from public.sl_audit where action='update_shift'"))
        .rows[0].n,
      1,
    );
  } finally {
    await f.db.close();
  }
});

test("scheduling validates all inputs and enforces manager, tenant and employee approval boundaries", async () => {
  const f = await fixture();
  try {
    for (const payload of [null, [], "bad"])
      await assert.rejects(f.call(f.manager, "assign_shift", payload), /Invalid command payload/);
    for (const patch of [
      { end: "07:00" },
      { start: "25:00" },
      { lunch: "16:30" },
      { lunchMinutes: 1.5 },
      { lunchMinutes: 121 },
      { regularMinutes: 0 },
      { date: "2026-02-30" },
      { date: "tomorrow" },
      { start: null },
      { regularMinutes: "480" },
      { employeeId: "bad" },
      { siteId: null },
      { start: "22:00", end: "23:59", lunch: "23:30", lunchMinutes: 120 },
    ])
      await assert.rejects(f.call(f.manager, "assign_shift", { ...f.payload, ...patch }));
    await assert.rejects(f.call(f.worker, "assign_shift", f.payload), /Manager access required/);
    await assert.rejects(f.call(f.outsider, "assign_shift", f.payload), /Unknown employee or site/);
    await assert.rejects(
      f.call(f.manager, "assign_shift", { ...f.payload, siteId: f.other.snapshot.sites[0].id }),
      /Unknown employee or site/,
    );
    await f.db.query("update public.sl_employees set access_status='pending' where id=$1", [
      f.payload.employeeId,
    ]);
    await assert.rejects(f.call(f.manager, "assign_shift", f.payload), /Approve this employee/);
    await assert.rejects(f.call(f.worker, "assign_shift", f.payload), /awaiting manager approval/);
    await f.db.query("update public.sl_employees set access_status='active' where id=$1", [
      f.payload.employeeId,
    ]);
    const saved = await f.call(f.manager, "assign_shift", f.payload);
    const edit = { ...f.payload, start: "09:00", expected: f.payload, shiftId: saved.shiftId };
    await assert.rejects(f.call(f.worker, "update_shift", edit), /Manager access required/);
    await assert.rejects(
      f.call(f.outsider, "update_shift", {
        ...edit,
        employeeId: f.other.snapshot.me,
        siteId: f.other.snapshot.sites[0].id,
      }),
      /Shift is unavailable/,
    );
    await assert.rejects(
      f.call(f.manager, "update_shift", { ...edit, date: "2099-01-01" }),
      /cannot change its employee or date/,
    );
    await assert.rejects(
      f.call(f.manager, "update_shift", { ...edit, expected: undefined }),
      /changed since you opened/,
    );
    assert.equal((await f.call(f.manager, null)).shifts[0].start, "08:00");
  } finally {
    await f.db.close();
  }
});

test("shift edits preserve tasks, policy versions, captured attendance and locked records", async () => {
  const f = await fixture();
  try {
    await f.call(f.manager, "save_policy", { lunch_paid: true });
    const saved = await f.call(f.manager, "assign_shift", f.payload);
    const edit = { ...f.payload, start: "09:00", shiftId: saved.shiftId, expected: f.payload };
    assert.equal(saved.snapshot.shifts[0].totals.policyVersion, 2);
    await f.call(f.manager, "save_policy", { lunch_paid: false });
    await f.call(f.manager, "create_job", {
      shiftId: saved.shiftId,
      title: "Inspection",
      destination: "Gate",
      start: "08:00",
      end: "10:00",
    });
    await assert.rejects(
      f.call(f.manager, "update_shift", edit),
      /Assigned tasks must stay inside/,
    );
    const extended = await f.call(f.manager, "update_shift", {
      ...edit,
      start: "07:00",
      end: "18:00",
    });
    assert.equal(extended.snapshot.jobs[0].shiftId, saved.shiftId);
    assert.equal(extended.snapshot.shifts[0].totals.policyVersion, 2);
    const expected = { ...f.payload, start: "07:00", end: "18:00" };
    await f.db.query(
      "insert into public.sl_timesheets(shift_id,company_id,employee_id) values($1,$2,$3) on conflict do nothing",
      [saved.shiftId, f.company, f.payload.employeeId],
    );
    await f.db.query("update public.sl_timesheets set status='submitted' where shift_id=$1", [
      saved.shiftId,
    ]);
    await assert.rejects(
      f.call(f.manager, "update_shift", { ...edit, start: "07:00", end: "19:00", expected }),
      /submitted timesheet/,
    );
    await f.db.query("update public.sl_timesheets set status='open' where shift_id=$1", [
      saved.shiftId,
    ]);
    // Privileged test fixture models a payroll lock without needing a completed period.
    await f.db.query(
      "insert into public.sl_periods(company_id,start_date,end_date,locked_by,rows) values($1,$2,$2,$3,'[]')",
      [f.company, f.payload.date, f.setup.snapshot.me],
    );
    await assert.rejects(
      f.call(f.manager, "update_shift", { ...edit, start: "07:00", end: "19:00", expected }),
      /Payroll period is locked/,
    );
    assert.equal((await f.call(f.manager, "assign_shift", expected)).duplicate, true);
    // Future shifts allow an offline evidence record independent of test execution time.
    const future = { ...f.payload, date: "2099-01-01" };
    const futureShift = await f.call(f.manager, "assign_shift", future);
    await f.db.query(
      "insert into public.sl_submissions(id,company_id,employee_id,shift_id,payload,captured_at,status) values($1,$2,$3,$4,'{}',now(),'needs_review')",
      [randomUUID(), f.company, f.payload.employeeId, futureShift.shiftId],
    );
    await assert.rejects(
      f.call(f.manager, "update_shift", {
        ...future,
        start: "09:00",
        shiftId: futureShift.shiftId,
        expected: future,
      }),
      /has attendance/,
    );
    const eventShift = await f.call(f.manager, "assign_shift", { ...future, date: "2099-01-02" });
    await f.db.query(
      "insert into public.sl_events(id,company_id,employee_id,shift_id,type,captured_at) values($1,$2,$3,$4,'clock_in',now())",
      [randomUUID(), f.company, f.payload.employeeId, eventShift.shiftId],
    );
    await assert.rejects(
      f.call(f.manager, "update_shift", {
        ...future,
        date: "2099-01-02",
        start: "09:00",
        shiftId: eventShift.shiftId,
        expected: { ...future, date: "2099-01-02" },
      }),
      /has attendance/,
    );
  } finally {
    await f.db.close();
  }
});
