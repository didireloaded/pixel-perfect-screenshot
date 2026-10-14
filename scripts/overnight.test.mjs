import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalDatabase, runRpc } from "./test-database.mjs";

async function fixture(timezone = "Africa/Windhoek") {
  const db = await createLocalDatabase();
  const manager = randomUUID(),
    worker = randomUUID(),
    outsider = randomUUID();
  for (const id of [manager, worker, outsider])
    await db.query("insert into auth.users values($1)", [id]);
  const call = (user, action, data = {}) => runRpc(db, user, action, data);
  const setup = await call(manager, "setup", {
    company: "Night crew",
    name: "Manager",
    site: "Office",
    timezone,
  });
  const invite = await call(manager, "create_employee", {
    name: "Worker",
    no: "NIGHT-1",
    siteId: setup.snapshot.sites[0].id,
  });
  await call(worker, "activate", { employeeNo: "NIGHT-1", code: invite.activationCode });
  await call(outsider, "setup", { company: "Other", name: "Other", site: "Other", timezone });
  await call(manager, "save_policy", {
    allow_offline_clockin: true,
    require_two_level_correction_approval: false,
  });
  const today = setup.snapshot.today;
  const date = (await db.query("select ($1::date-1)::text as day", [today])).rows[0].day;
  const shift = await call(manager, "assign_shift", {
    employeeId: invite.employeeId,
    siteId: setup.snapshot.sites[0].id,
    date,
    start: "23:00",
    end: "23:59",
    lunch: "23:00",
    lunchMinutes: 0,
    regularMinutes: 480,
  });
  await db.query(
    "update sl_shifts set start_time='23:59',lunch_time='23:59',finish_date=$2::date,end_time='23:59' where id=$1",
    [shift.shiftId, today],
  );
  const at = async (day, time) =>
    new Date(
      (
        await db.query("select ($1::date+$2::time) at time zone $3 as instant", [
          day,
          time,
          timezone,
        ])
      ).rows[0].instant,
    ).toISOString();
  const submit = async (type, day, time, extra = {}) =>
    call(worker, "submit_attendance", {
      id: randomUUID(),
      shiftId: shift.shiftId,
      type,
      capturedAt: await at(day, time),
      offline: true,
      ...extra,
    });
  return { db, manager, worker, outsider, call, setup, invite, today, date, shift, at, submit };
}

test("overnight lunch, jobs, clock-out and reporting retain start-date ownership", async () => {
  const f = await fixture();
  try {
    const { db, call, manager, worker, outsider, setup, shift, today, date, submit } = f;
    assert.equal((await submit("clock_in", date, "23:59")).status, "synced");
    assert.equal(
      (await submit("start_lunch", today, "00:10")).snapshot.states[0].state,
      "on_lunch",
    );
    assert.equal((await submit("end_lunch", today, "00:20")).status, "synced");
    const job = await call(manager, "create_job", {
      id: randomUUID(),
      shiftId: shift.shiftId,
      title: "Night inspection",
      destination: "Venue",
      start: "23:59",
      end: "03:00",
    });
    const jobId = job.snapshot.jobs[0].id;
    assert.equal((await submit("start_job", today, "00:30", { jobId })).status, "synced");
    assert.equal((await submit("end_job", today, "01:00")).status, "synced");
    const out = await submit("clock_out", today, "02:00");
    assert.equal(out.status, "synced");
    assert.equal(out.snapshot.states[0].state, "clocked_out");
    assert.equal(out.snapshot.shifts[0].date, date);
    assert.equal(out.snapshot.shifts[0].finishDate, today);
    assert.equal(out.snapshot.shifts[0].totals.missingClockOut, false);
    assert.equal(out.snapshot.shifts[0].totals.workedMinutes, 111);
    assert.equal((await call(outsider, null)).shifts.length, 0);
    const snapshots = await call(manager, null);
    assert.equal(snapshots.shifts[0].id, shift.shiftId);
    const privacy = (
      await db.query(
        "select shiftline_private.workday_tracking(s,$2::timestamptz,c.timezone) as before,shiftline_private.workday_tracking(s,$3::timestamptz,c.timezone) as after from sl_shifts s join sl_companies c on c.id=s.company_id where s.id=$1",
        [shift.shiftId, await f.at(today, "01:00"), await f.at(today, "23:59")],
      )
    ).rows[0];
    assert.equal(privacy.before, true);
    assert.equal(privacy.after, false);
    await assert.rejects(
      call(worker, "report_position", {
        shiftId: shift.shiftId,
        latitude: -22.6,
        longitude: 17.08,
        accuracyM: 10,
      }),
      /paused/,
    );
  } finally {
    await f.db.close();
  }
});

test("late overnight evidence requires review, preserves its timestamp, and never extends tracking", async () => {
  const f = await fixture();
  try {
    const { db, call, manager, worker, date, today, shift, submit } = f;
    await submit("clock_in", date, "23:59");
    await db.query("update sl_shifts set end_time='01:00' where id=$1", [shift.shiftId]);
    const payload = {
      id: randomUUID(),
      shiftId: shift.shiftId,
      type: "clock_out",
      capturedAt: await f.at(today, "02:00"),
      offline: true,
      location: { latitude: -22.6, longitude: 17.08, accuracyM: 10 },
    };
    const late = await call(worker, "submit_attendance", payload);
    assert.equal(late.reason, "WORKDAY_FINISH_EXCEEDED");
    assert.equal(late.status, "needs_review");
    assert.equal((await call(worker, "submit_attendance", payload)).duplicate, true);
    const stored = (
      await db.query("select payload,captured_at from sl_submissions where id=$1", [payload.id])
    ).rows[0];
    assert.equal(stored.payload.location, null);
    assert.equal(new Date(stored.captured_at).toISOString(), payload.capturedAt);
    await assert.rejects(
      call(worker, "report_position", {
        shiftId: shift.shiftId,
        latitude: -22.6,
        longitude: 17.08,
        accuracyM: 10,
      }),
      /window is closed/,
    );
    const reviewed = await call(manager, "review_submission", {
      id: payload.id,
      decision: "approved",
      reason: "Verified overnight finish",
    });
    assert.equal(reviewed.snapshot.states[0].state, "clocked_out");
    assert.equal(reviewed.snapshot.shifts[0].date, date);
    assert.equal(reviewed.snapshot.shifts[0].totals.missingClockOut, false);
    assert.equal(reviewed.snapshot.shifts[0].end, "01:00");
  } finally {
    await f.db.close();
  }
});

test("explicit tomorrow clock-in is bounded to 24 hours and cannot overlap an open day", async () => {
  const db = await createLocalDatabase();
  try {
    const user = randomUUID();
    await db.query("insert into auth.users values($1)", [user]);
    const call = (action, data = {}) => runRpc(db, user, action, data);
    await call("setup", {
      company: "Start test",
      name: "Owner",
      site: "Office",
      timezone: "Africa/Windhoek",
    });
    const now = (
      await db.query(
        "select to_char(clock_timestamp() at time zone 'Africa/Windhoek','HH24:MI') as time, to_char((clock_timestamp() at time zone 'Africa/Windhoek')+interval '1 hour','HH24:MI') as later",
      )
    ).rows[0];
    if (now.later > now.time)
      await assert.rejects(
        call("start_workday", { id: randomUUID(), expectedEnd: now.later, finishDay: "tomorrow" }),
        /within 24 hours/,
      );
    await assert.rejects(
      call("start_workday", { id: randomUUID(), expectedEnd: now.time, finishDay: "next week" }),
      /today or tomorrow/,
    );
    const payload = { id: randomUUID(), expectedEnd: now.time, finishDay: "tomorrow" };
    const result = await call("start_workday", payload);
    const shift = result.snapshot.shifts[0];
    assert.equal(result.status, "synced");
    assert.equal(Date.parse(shift.finishesAt) - Date.parse(shift.startsAt), 86400000);
    assert.notEqual(shift.finishDate, shift.date);
    assert.equal((await call("start_workday", payload)).duplicate, true);
    await assert.rejects(
      call("start_workday", { ...payload, id: randomUUID() }),
      /OTHER_SHIFT_OPEN/,
    );
  } finally {
    await db.close();
  }
});

test("workday instants respect company timezone outside Namibia", async () => {
  const f = await fixture("Asia/Kolkata");
  try {
    await f.submit("clock_in", f.date, "23:59");
    const out = await f.submit("clock_out", f.today, "00:30");
    assert.equal(out.status, "synced");
    assert.equal(out.snapshot.shifts[0].totals.workedMinutes, 31);
    assert.equal(out.snapshot.shifts[0].date, f.date);
  } finally {
    await f.db.close();
  }
});

test("overnight approvals and period locks use the start date", async () => {
  const f = await fixture();
  try {
    await f.submit("clock_in", f.date, "23:59");
    const managerId = f.setup.snapshot.me;
    await f.db.query(
      "insert into sl_periods(company_id,start_date,end_date,locked_by,rows) values($1,$2,$2,$3,'[]')",
      [f.setup.snapshot.company.id, f.today, managerId],
    );
    assert.equal((await f.submit("start_lunch", f.today, "00:10")).status, "synced");
    assert.equal((await f.submit("end_lunch", f.today, "00:20")).status, "synced");
    await f.db.query(
      "insert into sl_periods(company_id,start_date,end_date,locked_by,rows) values($1,$2,$2,$3,'[]')",
      [f.setup.snapshot.company.id, f.date, managerId],
    );
    const payload = {
      id: randomUUID(),
      shiftId: f.shift.shiftId,
      type: "clock_out",
      capturedAt: await f.at(f.today, "00:30"),
      offline: true,
    };
    const result = await f.call(f.worker, "submit_attendance", payload);
    assert.equal(result.reason, "PAYROLL_LOCKED");
    assert.equal(result.status, "needs_review");
    await assert.rejects(
      f.call(f.manager, "review_submission", {
        id: payload.id,
        decision: "approved",
        reason: "Review locked workday",
      }),
      /period is locked/,
    );
    await assert.rejects(
      f.call(f.outsider, "review_submission", {
        id: payload.id,
        decision: "approved",
        reason: "Other company",
      }),
      /Cannot review/,
    );
  } finally {
    await f.db.close();
  }
});
